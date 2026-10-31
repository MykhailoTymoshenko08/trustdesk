"""idempotent executor: applies policy-approved proposals, writes audit, supports rollback.
side effects are simulated with db rows. the executor never decides - policy already did"""
import logging

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import clock
from app.errors import ApiError
from app.models import Audit, Lesson, Message, Payment, Plan, User
from app.schemas import ActionProposal, AuditEntryOut, ExecuteOut, iso_z

log = logging.getLogger(__name__)
REVERSIBLE = {"grant_free_lesson", "reschedule_lesson"}


def audit_out(a: Audit) -> AuditEntryOut:
    return AuditEntryOut(id=a.id, at=iso_z(a.at), actor=a.actor, action=a.action, user_id=a.user_id,
                         incident_id=a.incident_id, params=a.params or {}, result=a.result,
                         reversible=a.reversible, rolled_back=a.rolled_back)


def _next_audit_id(db: Session) -> str:
    n = (db.scalar(select(func.count()).select_from(Audit)) or 0) + 300
    while db.get(Audit, f"a_{n + 1}"):
        n += 1
    return f"a_{n + 1}"


def _apply(db: Session, p: ActionProposal, incident_id: str | None) -> dict:
    """simulated side effect; returns undo info stored in audit params"""
    now = clock.now()
    if p.action == "send_message":
        db.add(Message(id=f"m_{_next_audit_id(db)}", user_id=p.user_id, incident_id=incident_id,
                       text=str(p.params.get("text", "")), at=now))
        return {}
    if p.action == "grant_free_lesson":
        user = db.get(User, p.user_id)
        if user is None:
            raise ValueError(f"unknown user {p.user_id}")
        user.free_lessons += int(p.params["lessons"])
        return {}
    if p.action == "reschedule_lesson":
        lesson = db.get(Lesson, int(p.params["lesson_id"]))
        if lesson is None or lesson.user_id != p.user_id:
            raise ValueError("lesson not found for user")
        prev = lesson.stored_at
        lesson.stored_at = lesson.requested_at
        return {"previous_stored_at": prev.isoformat()}
    if p.action == "refund":
        db.add(Payment(id=f"ref_{_next_audit_id(db)}", user_id=p.user_id, kind="refund", at=now,
                       amount_cents=-int(p.params["amount_cents"])))
        return {}
    raise ValueError(f"no executor for action {p.action}")


def _record(db: Session, p: ActionProposal, incident_id: str | None, actor: str, result: str,
            extra: dict | None = None, key: str | None = None) -> Audit:
    entry = Audit(id=_next_audit_id(db), at=clock.now(), actor=actor, action=p.action, user_id=p.user_id,
                  incident_id=incident_id, params={**p.params, **(extra or {})}, result=result,
                  idempotency_key=key, reversible=result == "ok" and p.action in REVERSIBLE)
    db.add(entry)
    return entry


def _run_one(db: Session, p: ActionProposal, incident_id: str | None, actor: str) -> Audit:
    """execute one proposal inside a savepoint. duplicate key -> skipped_duplicate entry"""
    if db.scalar(select(Audit.id).where(Audit.idempotency_key == p.idempotency_key)):
        return _commit_skip(db, p, incident_id, actor)
    try:
        with db.begin_nested():
            undo = _apply(db, p, incident_id)
            entry = _record(db, p, incident_id, actor, "ok", undo, key=p.idempotency_key)
            db.flush()
        return entry
    except IntegrityError:  # concurrent twin won the unique key
        return _commit_skip(db, p, incident_id, actor)
    except Exception as exc:  # simulated side effect failed - nothing partial is kept
        log.warning("action %s failed: %s", p.idempotency_key, exc)
        entry = _record(db, p, incident_id, actor, "failed", {"error": str(exc)[:200]})
        db.flush()
        return entry


def _commit_skip(db: Session, p: ActionProposal, incident_id: str | None, actor: str) -> Audit:
    entry = _record(db, p, incident_id, actor, "skipped_duplicate")
    db.flush()
    return entry


def execute_plan(db: Session, plan_id: str, approved_by: str, include: list[str]) -> ExecuteOut:
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise ApiError(404, "plan_not_found", f"plan {plan_id} not found")
    counts = {"ok": 0, "skipped_duplicate": 0, "failed": 0}
    skipped_policy, audit_ids = 0, []
    for raw in plan.proposals:
        p = ActionProposal.model_validate(raw)
        decision = p.policy.decision if p.policy else "forbidden"
        if decision == "forbidden" or decision not in include:
            skipped_policy += 1
            continue
        actor = "agent" if decision == "auto" else f"human:{approved_by}"
        entry = _run_one(db, p, plan.incident_id, actor)
        counts[entry.result] += 1
        audit_ids.append(entry.id)
    db.commit()
    return ExecuteOut(executed=counts["ok"], skipped_duplicate=counts["skipped_duplicate"],
                      skipped_policy=skipped_policy, failed=counts["failed"], audit_ids=audit_ids)


def rollback(db: Session, audit_id: str, by: str) -> AuditEntryOut:
    entry = db.get(Audit, audit_id)
    if entry is None:
        raise ApiError(404, "audit_not_found", f"audit entry {audit_id} not found")
    if entry.result != "ok" or not entry.reversible:
        raise ApiError(409, "not_reversible", f"{entry.action} cannot be rolled back")
    if entry.rolled_back:
        raise ApiError(409, "already_rolled_back", f"{audit_id} is already rolled back")
    if entry.action == "grant_free_lesson":
        user = db.get(User, entry.user_id)
        user.free_lessons = max(0, user.free_lessons - int(entry.params["lessons"]))
    elif entry.action == "reschedule_lesson":
        from datetime import datetime

        lesson = db.get(Lesson, int(entry.params["lesson_id"]))
        lesson.stored_at = datetime.fromisoformat(entry.params["previous_stored_at"])
    entry.rolled_back = True
    db.add(Audit(id=_next_audit_id(db), at=clock.now(), actor=f"human:{by}", action=f"rollback:{entry.action}",
                 user_id=entry.user_id, incident_id=entry.incident_id, params={"audit_id": entry.id},
                 result="ok", reversible=False))
    db.commit()
    return audit_out(entry)
