"""resolution plan: the model drafts one apology template, code personalises and proposes actions.
dry-run only - nothing is executed here"""
import logging
import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import clock
from app.llm import LLMUnavailable, get_llm
from app.models import Incident, Lesson, Plan, Ticket, User
from app.schemas import ActionProposal, PlanOut, ReplyTemplate
from app.services.impact import affected_users, ticket_authors
from app.services.policy import get_policy

log = logging.getLogger(__name__)
PLACEHOLDERS = {"{name}", "{lesson_time}"}
FALLBACK_TEMPLATE = (
    "Вітаємо, {name}! Через помилку на нашому боці час вашого перенесеного уроку ({lesson_time}) міг "
    "відображатися невірно. Ми вже виправили проблему. Вибачте за незручності."
)
REFUND_WORDS = re.compile(r"refund|поверн\w*\s+(мені\s+)?(гроші|кошти)|верніть\s+(мені\s+)?(гроші|кошти)", re.I)
MONEY = re.compile(r"\$\s?(\d+)")


def draft_template(incident: Incident) -> str:
    """apology text with {name}/{lesson_time}; falls back to a static text if the model fails or misuses placeholders"""
    prompt = (
        "Write one short, warm apology message in Ukrainian from Lumo (online math lessons) to a family "
        f"affected by this incident: \"{incident.title}\" (feature {incident.feature}, release {incident.release}). "
        "Explain that a lesson time may have been shown wrong, that it is fixed, and say sorry. "
        "Do not promise anything beyond a free lesson. Use exactly the placeholders {name} and {lesson_time}."
    )
    try:
        body = get_llm().generate_json(prompt, ReplyTemplate).body.strip()
    except LLMUnavailable:
        return FALLBACK_TEMPLATE
    used = set(re.findall(r"\{[^{}]*\}", body))
    return body if used <= PLACEHOLDERS and "{name}" in used and len(body) < 800 else FALLBACK_TEMPLATE


def personalise(template: str, name: str, lesson_time: str) -> str:
    return template.replace("{name}", name).replace("{lesson_time}", lesson_time)


def _broken_lessons(db: Session, user_ids: set[str], now: datetime) -> dict[str, Lesson]:
    q = select(Lesson).where(Lesson.user_id.in_(user_ids), Lesson.stored_at != Lesson.requested_at)
    return {lesson.user_id: lesson for lesson in db.scalars(q)}


def _key(incident_id: str, user_id: str, action: str) -> str:
    return f"{incident_id}:{user_id}:{action}"


def _proposal(inc: Incident, user_id: str, action: str, params: dict, reason: str) -> ActionProposal:
    return ActionProposal(action=action, user_id=user_id, params=params, reason=reason,
                          idempotency_key=_key(inc.id, user_id, action))


def _refund_requests(db: Session, user_ids: set[str]) -> list[Ticket]:
    """tickets (incident or flagged) where the customer asks for money back"""
    q = select(Ticket).where(Ticket.user_id.in_(user_ids))
    return [t for t in db.scalars(q) if REFUND_WORDS.search(t.text)]


def build_plan(db: Session, inc: Incident) -> PlanOut:
    now = clock.now()
    affected = affected_users(db, inc.feature, inc.error_code or "")
    authors = ticket_authors(db, inc.id)
    names = {u.id: u.name for u in db.scalars(select(User).where(User.id.in_(set(affected) | authors)))}
    broken = _broken_lessons(db, set(affected), now)
    template = draft_template(inc)
    proposals: list[ActionProposal] = []

    for uid in sorted(affected):
        lesson = broken.get(uid)
        when = lesson.requested_at.strftime("%d.%m %H:%M") if lesson else "—"
        who = "reported" if uid in authors else "silent (proactive)"
        text = personalise(template, names.get(uid, uid), when)
        proposals.append(_proposal(inc, uid, "send_message", {"text": text, "proactive": uid not in authors},
                                   f"{who} user affected by {inc.error_code}"))
        if lesson and lesson.stored_at <= now:
            proposals.append(_proposal(inc, uid, "grant_free_lesson", {"lessons": 1},
                                       f"missed lesson {lesson.id} due to {inc.error_code}"))
        elif lesson:
            proposals.append(_proposal(inc, uid, "reschedule_lesson", {"lesson_id": lesson.id,
                                       "to": lesson.requested_at.isoformat() + "Z"},
                                       f"restore requested time of lesson {lesson.id}"))

    injected: set[str] = set()
    # only users linked to this incident (affected or reporting) can get a refund proposal
    for t in _refund_requests(db, set(affected) | authors):
        flagged = bool((t.triage or {}).get("injection_detected"))
        if flagged:
            injected.add(t.user_id)
        amount = _refund_amount(t, broken.get(t.user_id), flagged)
        key = _key(inc.id, t.user_id, "refund")
        if amount and not any(p.idempotency_key == key for p in proposals):
            proposals.append(_proposal(inc, t.user_id, "refund", {"amount_cents": amount, "ticket_id": t.id},
                                       f"customer asked for a refund in {t.id}"
                                       + (" (prompt-injection attempt detected)" if flagged else "")))

    get_policy().evaluate_plan(proposals, injected_users=injected)
    plan_id = _next_plan_id(db)
    db.add(Plan(id=plan_id, incident_id=inc.id, created_at=now, proposals=[p.model_dump() for p in proposals]))
    db.commit()
    return PlanOut(plan_id=plan_id, proposals=proposals, summary=get_policy().summarize(proposals))


def _refund_amount(ticket: Ticket, lesson: Lesson | None, flagged: bool) -> int:
    """what the customer asks for: stated dollars in injected tickets, else the missed lesson price"""
    if flagged:
        m = MONEY.search(ticket.text)
        return int(m.group(1)) * 100 if m else 0
    return lesson.price_cents if lesson and lesson.stored_at <= clock.now() else 0


def _next_plan_id(db: Session) -> str:
    n = len(list(db.scalars(select(Plan.id)))) + 1
    while db.get(Plan, f"plan_{n}"):
        n += 1
    return f"plan_{n}"
