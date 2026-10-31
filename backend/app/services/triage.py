"""ticket triage: events + docs -> validated Triage. the model proposes, code validates evidence"""
import re
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.llm import LLMUnavailable, get_llm
from app.llm.prompts import build_triage_prompt
from app.models import Event, Ticket
from app.schemas import Evidence, Triage, TriageDraft
from app.services import docs_loader

EVENT_LIMIT = 20
INJECTION_PATTERNS = [re.compile(p, re.I) for p in (
    r"ignore\s+(all\s+)?(the\s+)?(previous|prior|above|your)?\s*(rules|instructions|prompts?)",
    r"disregard\s+(all\s+)?(previous|prior|the)?\s*(rules|instructions)",
    r"forget\s+(all\s+)?(your|previous)\s+(rules|instructions)",
    r"you\s+are\s+now\s+(in\s+)?(admin|developer|dan|god)",
    r"(admin|developer|system)\s+mode",
    r"system\s+prompt",
    r"(ігноруй|проігноруй|забудь)\s+(?:(?:всі|усі|попередні|свої)\s+)*(правила|інструкції)",
)]
SAFE_HANDOVER_REPLY = "Thank you for your message. A support specialist will review your request."


def detect_injection(text: str) -> bool:
    return any(p.search(text) for p in INJECTION_PATTERNS)


def format_event(ev: Event) -> str:
    payload = " ".join(f"{k}={v}" for k, v in (ev.payload or {}).items())
    err = f" {ev.error_code}" if ev.error_code else ""
    return f"{ev.at:%Y-%m-%d %H:%M} feature={ev.feature} {ev.event} {payload}{err}".strip()


def recent_events(db: Session, user_id: str) -> list[Event]:
    q = select(Event).where(Event.user_id == user_id).order_by(Event.at.desc()).limit(EVENT_LIMIT)
    return list(db.scalars(q))


def resolve_evidence(refs: list[str], events: dict[str, str], docs: dict[str, str]) -> list[Evidence]:
    """keep only refs that exist; text always comes from our data, never from the model"""
    out, seen = [], set()
    for ref in refs:
        ref = ref.strip().strip("[]")
        if ref in seen:
            continue
        seen.add(ref)
        if ref in events:
            out.append(Evidence(type="log", ref=ref, text=events[ref]))
        elif ref in docs:
            out.append(Evidence(type="doc", ref=ref, text=docs[ref]))
    return out


def _handover(intent: str) -> Triage:
    return Triage(intent=intent, feature="unknown", verdict="unclear", confidence=0.0, abstained=True,
                  suggested_reply=SAFE_HANDOVER_REPLY)


def build_triage(user_text: str, events: list[Event]) -> Triage:
    threshold = get_settings().triage_confidence_threshold
    injected = detect_injection(user_text)
    ev_map = {e.id: format_event(e) for e in events}
    chunks = docs_loader.load_chunks()
    doc_map = {c.ref: c.text for c in chunks}
    prompt = build_triage_prompt(user_text, list(ev_map.items()), list(doc_map.items()))
    try:
        draft: TriageDraft = get_llm().generate_json(prompt, TriageDraft)
    except LLMUnavailable:
        result = _handover("llm_unavailable")
        result.injection_detected = injected
        return result
    evidence = resolve_evidence(draft.evidence_refs, ev_map, doc_map)
    confidence = draft.confidence
    if draft.verdict in ("bug", "user_error") and not evidence:
        confidence = min(confidence, threshold - 0.1)  # a verdict without proof is a guess
    abstained = confidence < threshold or injected
    return Triage(
        intent=draft.intent, feature=draft.feature, verdict=draft.verdict, confidence=round(confidence, 2),
        abstained=abstained, evidence=evidence,
        suggested_reply=SAFE_HANDOVER_REPLY if injected else draft.suggested_reply,
        injection_detected=injected,
    )


def triage_ticket(db: Session, ticket: Ticket) -> Triage:
    """runs triage, stores it on the ticket. abstain/failure -> needs_human"""
    triage = build_triage(ticket.text, recent_events(db, ticket.user_id))
    ticket.triage = triage.model_dump()
    ticket.status = "needs_human" if triage.abstained else "triaged"
    db.commit()
    return triage
