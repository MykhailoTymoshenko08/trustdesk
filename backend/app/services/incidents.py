"""incident helpers: serialization and stats"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Event, Incident, Ticket
from app.schemas import IncidentOut, IncidentSignal, iso_z
from app.services.impact import compute_impact, ticket_authors

TITLES = {
    ("lesson-reschedule", "ERR_TZ_SHIFT"): "Rescheduled lessons shifted 1h earlier",
}


def title_for(feature: str, error_code: str | None) -> str:
    return TITLES.get((feature, error_code or ""), f"{error_code or 'Errors'} in {feature}")


def refresh_times(db: Session, inc: Incident) -> None:
    """first/last seen = first/last occurrence of the log signal"""
    if not inc.error_code:
        return
    lo, hi = db.execute(
        select(func.min(Event.at), func.max(Event.at)).where(
            Event.feature == inc.feature, Event.error_code == inc.error_code
        )
    ).one()
    if lo and hi:
        inc.first_seen, inc.last_seen = lo, hi


def to_out(db: Session, inc: Incident) -> IncidentOut:
    count = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.incident_id == inc.id)) or 0
    impact = compute_impact(db, inc.feature, inc.error_code or "", ticket_authors(db, inc.id))
    return IncidentOut(
        id=inc.id, title=inc.title, feature=inc.feature,
        signal=IncidentSignal(error_code=inc.error_code, release=inc.release),
        status=inc.status, ticket_count=count, first_seen=iso_z(inc.first_seen), last_seen=iso_z(inc.last_seen),
        impact=impact,
    )
