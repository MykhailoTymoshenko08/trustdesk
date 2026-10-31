"""dev card: what a developer needs to pick up the incident"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, Incident
from app.schemas import DevCard, Impact
from app.services import docs_loader
from app.services.impact import affected_users, compute_impact, ticket_authors

SAMPLE_USERS = 3


def _describe(ev: Event) -> str:
    payload = ", ".join(f"{k}={v}" for k, v in (ev.payload or {}).items())
    return f"{ev.event}({payload})" + (f" -> {ev.error_code}" if ev.error_code else "")


def repro_steps(db: Session, inc: Incident, sample: list[str]) -> list[str]:
    """steps derived from the first sampled user's events around the error, plus the observed deviation"""
    if not sample:
        return []
    evs = list(db.scalars(select(Event).where(Event.user_id == sample[0], Event.feature == inc.feature,
                                              Event.release == inc.release).order_by(Event.at)))
    steps = [f"{i}. [{ev.id}] {_describe(ev)}" for i, ev in enumerate(evs, 1)]
    last = evs[-1].payload if evs else {}
    if "new" in last and "stored" in last:
        steps.append(f"{len(steps) + 1}. expected stored time {last['new']}, actual {last['stored']}")
    steps.append(f"{len(steps) + 1}. same error seen for sampled users: {', '.join(sample)}")
    return steps


def build_markdown(inc: Incident, entry_points: list[dict], steps: list[str], impact: Impact) -> str:
    eps = "\n".join(f"- `{e.get('path')}` · `{e.get('symbol')}` · `{e.get('route', '')}`" for e in entry_points) or "- (not documented)"
    money = f"${impact.money_at_risk_cents / 100:,.2f}"
    return (
        f"## {inc.title}\n\n"
        f"**Feature:** `{inc.feature}`  \n**Release:** `{inc.release}`  \n**Error code:** `{inc.error_code}`  \n"
        f"**Impact:** {impact.affected_users} families affected ({impact.reporting_users} reported, "
        f"{impact.silent_users} silent), {impact.missed_lessons} missed lessons, {money} at risk\n\n"
        f"### Entry points\n{eps}\n\n### Repro steps (from logs)\n" + "\n".join(steps) + "\n"
    )


def build_devcard(db: Session, inc: Incident) -> DevCard:
    users = sorted(affected_users(db, inc.feature, inc.error_code or ""))
    impact = compute_impact(db, inc.feature, inc.error_code or "", ticket_authors(db, inc.id))
    steps = repro_steps(db, inc, users[:SAMPLE_USERS])
    eps = docs_loader.load_entry_points(inc.feature)
    return DevCard(feature=inc.feature, entry_points=eps, repro_steps=steps, release=inc.release, impact=impact,
                   markdown=build_markdown(inc, eps, steps, impact))
