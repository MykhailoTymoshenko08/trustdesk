"""deterministic policy engine: loads policies.yaml, decides auto | needs_approval | forbidden"""
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from app.config import get_settings
from app.schemas import ActionProposal, PolicyDecisionName, PolicyResult

_RANK: dict[str, int] = {"auto": 0, "needs_approval": 1, "forbidden": 2}


class ActionRule(BaseModel):
    decision: PolicyDecisionName
    rule: str
    money: bool = False
    max_params: dict[str, int] = Field(default_factory=dict)
    over_limit_decision: PolicyDecisionName = "needs_approval"
    over_limit_rule: str = "over_limit"


class BulkRule(BaseModel):
    max_users: int = 20
    rule: str = "bulk_money_over_limit"


class InjectionRule(BaseModel):
    forbid_money_actions: bool = True
    rule: str = "injection_blocks_money"


class PolicyConfig(BaseModel):
    actions: dict[str, ActionRule]
    bulk: BulkRule = BulkRule()
    injection: InjectionRule = InjectionRule()


def _worse(a: PolicyResult, b: PolicyResult) -> PolicyResult:
    return b if _RANK[b.decision] > _RANK[a.decision] else a


class PolicyEngine:
    def __init__(self, config: PolicyConfig):
        self.config = config

    @classmethod
    def load(cls, path: Path) -> "PolicyEngine":
        return cls(PolicyConfig.model_validate(yaml.safe_load(Path(path).read_text(encoding="utf-8"))))

    def evaluate(
        self, action: str, params: dict | None = None, *, bulk_users: int = 1, injection_detected: bool = False
    ) -> PolicyResult:
        """decide one proposal. bulk_users = distinct users receiving this action in the same plan"""
        rule = self.config.actions.get(action)
        if rule is None:
            return PolicyResult(decision="forbidden", rule="unknown_action_forbidden")
        params = params or {}
        result = PolicyResult(decision=rule.decision, rule=rule.rule)
        for key, limit in rule.max_params.items():
            value = params.get(key)
            if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                return PolicyResult(decision="forbidden", rule="invalid_params")
            if value > limit:
                result = _worse(result, PolicyResult(decision=rule.over_limit_decision, rule=rule.over_limit_rule))
        if rule.money and bulk_users > self.config.bulk.max_users:
            result = _worse(result, PolicyResult(decision="needs_approval", rule=self.config.bulk.rule))
        if rule.money and injection_detected and self.config.injection.forbid_money_actions:
            result = _worse(result, PolicyResult(decision="forbidden", rule=self.config.injection.rule))
        return result

    def evaluate_plan(self, proposals: list[ActionProposal], injected_users: set[str] | None = None) -> list[ActionProposal]:
        """sets .policy on every proposal; bulk rule counts distinct users per money action"""
        injected = injected_users or set()
        users_per_action: dict[str, set[str]] = defaultdict(set)
        for p in proposals:
            users_per_action[p.action].add(p.user_id)
        for p in proposals:
            p.policy = self.evaluate(
                p.action, p.params, bulk_users=len(users_per_action[p.action]),
                injection_detected=p.user_id in injected,
            )
        return proposals

    @staticmethod
    def summarize(proposals: list[ActionProposal]) -> dict[str, int]:
        out = {"auto": 0, "needs_approval": 0, "forbidden": 0}
        for p in proposals:
            if p.policy:
                out[p.policy.decision] += 1
        return out


@lru_cache
def get_policy() -> PolicyEngine:
    return PolicyEngine.load(get_settings().policies_path)
