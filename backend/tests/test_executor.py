from sqlalchemy import func, select

from app.models import Audit, Plan, User
from app.schemas import ActionProposal, PolicyResult
from app.services.executor import execute_plan, rollback
from seed.seed import seed


def plan_with(db, *props):
    db.add(Plan(id="plan_x", incident_id="inc_x", created_at=__import__("datetime").datetime(2026, 1, 1),
                proposals=[p.model_dump() for p in props]))
    db.commit()


def prop(action, user, params, decision="auto", key=None):
    return ActionProposal(action=action, user_id=user, params=params, idempotency_key=key or f"inc_x:{user}:{action}",
                          policy=PolicyResult(decision=decision, rule="r"))


def test_same_plan_twice_changes_nothing(db):
    seed(db)
    plan_with(db, prop("grant_free_lesson", "u_001", {"lessons": 1}))
    a = execute_plan(db, "plan_x", "m", ["auto"])
    b = execute_plan(db, "plan_x", "m", ["auto"])
    assert (a.executed, b.executed, b.skipped_duplicate) == (1, 0, 1)
    assert db.get(User, "u_001").free_lessons == 1


def test_failed_action_is_audited_and_leaves_no_partial_state(db):
    seed(db)
    plan_with(db, prop("grant_free_lesson", "u_nope", {"lessons": 1}), prop("grant_free_lesson", "u_002", {"lessons": 1}))
    r = execute_plan(db, "plan_x", "m", ["auto"])
    assert (r.executed, r.failed) == (1, 1)
    assert db.scalar(select(func.count()).select_from(Audit).where(Audit.result == "failed")) == 1


def test_forbidden_and_unapproved_classes_never_run(db):
    seed(db)
    plan_with(db, prop("refund", "u_055", {"amount_cents": 50000}, "forbidden"),
              prop("refund", "u_007", {"amount_cents": 4500}, "needs_approval"))
    r = execute_plan(db, "plan_x", "m", ["auto"])
    assert r.executed == 0 and r.skipped_policy == 2
    r = execute_plan(db, "plan_x", "m", ["auto", "needs_approval"])
    assert r.executed == 1 and r.skipped_policy == 1
    entry = db.scalar(select(Audit).where(Audit.action == "refund", Audit.result == "ok"))
    assert entry.actor == "human:m" and entry.user_id == "u_007"


def test_rollback_free_lesson(db):
    seed(db)
    plan_with(db, prop("grant_free_lesson", "u_003", {"lessons": 1}))
    execute_plan(db, "plan_x", "m", ["auto"])
    entry = db.scalar(select(Audit).where(Audit.action == "grant_free_lesson"))
    assert rollback(db, entry.id, "m").rolled_back
    assert db.get(User, "u_003").free_lessons == 0
