import pytest

from app.config import get_settings
from app.schemas import ActionProposal
from app.services.policy import PolicyEngine

engine = PolicyEngine.load(get_settings().policies_path)


@pytest.mark.parametrize(
    "action,params,kwargs,decision,rule",
    [
        ("send_message", {}, {}, "auto", "send_message_auto"),
        ("reschedule_lesson", {"to": "18:00"}, {}, "auto", "reschedule_auto"),
        ("grant_free_lesson", {"lessons": 1}, {}, "auto", "free_lesson_max_1"),
        ("grant_free_lesson", {"lessons": 2}, {}, "needs_approval", "free_lesson_over_limit"),
        ("grant_free_lesson", {"lessons": 0}, {}, "forbidden", "invalid_params"),
        ("grant_free_lesson", {"lessons": -1}, {}, "forbidden", "invalid_params"),
        ("grant_free_lesson", {}, {}, "forbidden", "invalid_params"),
        ("grant_free_lesson", {"lessons": "1"}, {}, "forbidden", "invalid_params"),
        ("grant_free_lesson", {"lessons": True}, {}, "forbidden", "invalid_params"),
        ("grant_free_lesson", {"lessons": 1}, {"bulk_users": 47}, "auto", "free_lesson_max_1"),
        ("refund", {"amount_cents": 100}, {}, "needs_approval", "refund_needs_approval"),
        ("refund", {"amount_cents": 100}, {"bulk_users": 21}, "needs_approval", "refund_needs_approval"),
        ("refund", {"amount_cents": 100}, {"injection_detected": True}, "forbidden", "injection_blocks_money"),
        ("grant_free_lesson", {"lessons": 1}, {"injection_detected": True}, "auto", "free_lesson_max_1"),
        ("delete_account", {}, {}, "forbidden", "unknown_action_forbidden"),
        ("", {}, {}, "forbidden", "unknown_action_forbidden"),
    ],
)
def test_table(action, params, kwargs, decision, rule):
    r = engine.evaluate(action, params, **kwargs)
    assert (r.decision, r.rule) == (decision, rule)


def test_bulk_rule_applies_to_money_actions_over_threshold(tmp_path):
    cfg = tmp_path / "p.yaml"
    cfg.write_text(
        "actions:\n  credit:\n    decision: auto\n    rule: credit_auto\n    money: true\n"
        "bulk:\n  max_users: 20\n  rule: bulk_money_over_20\n"
    )
    e = PolicyEngine.load(cfg)
    assert e.evaluate("credit", {}, bulk_users=20).decision == "auto"
    r = e.evaluate("credit", {}, bulk_users=21)
    assert (r.decision, r.rule) == ("needs_approval", "bulk_money_over_20")


def proposal(action, user, params=None):
    return ActionProposal(action=action, user_id=user, params=params or {}, idempotency_key=f"k:{user}:{action}")


def test_plan_counts_distinct_users_per_action_and_injection():
    plan = [proposal("send_message", f"u_{i}") for i in range(47)]
    plan += [proposal("grant_free_lesson", f"u_{i}", {"lessons": 1}) for i in range(47)]
    plan += [proposal("refund", "u_1", {"amount_cents": 4500}), proposal("refund", "u_55", {"amount_cents": 50000})]
    engine.evaluate_plan(plan, injected_users={"u_55"})
    assert engine.summarize(plan) == {"auto": 94, "needs_approval": 1, "forbidden": 1}
    assert plan[-1].policy.rule == "injection_blocks_money"


def test_deterministic():
    a = engine.evaluate("refund", {"amount_cents": 5})
    b = engine.evaluate("refund", {"amount_cents": 5})
    assert a == b
