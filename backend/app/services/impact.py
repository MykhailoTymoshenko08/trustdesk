"""incident impact: pure sql/python, no ai"""
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock
from app.models import Event, Lesson, Subscription, Ticket, User
from app.schemas import Impact, ImpactBreakdown

RENEWAL_WINDOW = timedelta(days=14)


def affected_users(db: Session, feature: str, error_code: str) -> dict[str, datetime]:
    """user_id -> last time they hit the incident signal"""
    q = (
        select(Event.user_id, func.max(Event.at))
        .where(Event.feature == feature, Event.error_code == error_code)
        .group_by(Event.user_id)
    )
    return {uid: last for uid, last in db.execute(q)}


def ticket_authors(db: Session, incident_id: str) -> set[str]:
    return set(db.scalars(select(Ticket.user_id).where(Ticket.incident_id == incident_id)))


def silent_user_rows(db: Session, feature: str, error_code: str, authors: set[str]) -> list[dict]:
    hit = affected_users(db, feature, error_code)
    ids = sorted(set(hit) - authors)
    names = {u: n for u, n in db.execute(select(User.id, User.name).where(User.id.in_(ids)))} if ids else {}
    return [{"id": u, "name": names.get(u, u), "last_error_at": hit[u].isoformat() + "Z"} for u in ids]


def compute_impact(
    db: Session, feature: str, error_code: str, authors: set[str], now: datetime | None = None
) -> Impact:
    now = now or clock.now()
    affected = set(affected_users(db, feature, error_code))
    reporting = affected & authors
    missed = list(
        db.scalars(
            select(Lesson).where(
                Lesson.user_id.in_(affected),
                Lesson.stored_at != Lesson.requested_at,
                Lesson.stored_at <= now,
            )
        )
    ) if affected else []
    missed_value = sum(lesson.price_cents for lesson in missed)
    renewals = db.scalar(
        select(func.coalesce(func.sum(Subscription.price_cents), 0)).where(
            Subscription.user_id.in_(affected),
            Subscription.renews_at > now,
            Subscription.renews_at <= now + RENEWAL_WINDOW,
        )
    ) if affected else 0
    return Impact(
        affected_users=len(affected),
        silent_users=len(affected - authors),
        reporting_users=len(reporting),
        missed_lessons=len(missed),
        money_at_risk_cents=missed_value + renewals,
        breakdown=ImpactBreakdown(missed_lessons_value_cents=missed_value, renewals_at_risk_cents=renewals),
    )
