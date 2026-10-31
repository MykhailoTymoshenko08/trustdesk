"""pydantic contract - mirrors docs/PLAN.md section 3 (+ internal llm drafts)"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

Verdict = Literal["bug", "user_error", "request", "unclear"]
TicketStatus = Literal["new", "triaged", "in_incident", "resolved", "needs_human"]


class Evidence(BaseModel):
    type: Literal["log", "doc"]
    ref: str
    text: str


class Triage(BaseModel):
    intent: str
    feature: str
    verdict: Verdict
    confidence: float = Field(ge=0, le=1)
    abstained: bool = False
    evidence: list[Evidence] = []
    suggested_reply: str = ""
    injection_detected: bool = False


class TriageDraft(BaseModel):
    """what the model is asked to return; evidence refs are resolved and validated by code"""

    intent: str
    feature: str
    verdict: Verdict
    confidence: float = Field(ge=0, le=1)
    evidence_refs: list[str] = []
    suggested_reply: str = ""


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    user_name: str
    channel: str
    text: str
    created_at: datetime
    status: TicketStatus
    incident_id: str | None = None
    triage: Triage | None = None

    @field_serializer("created_at")
    def _iso(self, v: datetime) -> str:
        return v.isoformat() + "Z"


class ImpactBreakdown(BaseModel):
    missed_lessons_value_cents: int
    renewals_at_risk_cents: int


class Impact(BaseModel):
    affected_users: int
    silent_users: int
    reporting_users: int
    missed_lessons: int
    money_at_risk_cents: int
    breakdown: ImpactBreakdown


PolicyDecisionName = Literal["auto", "needs_approval", "forbidden"]


class PolicyResult(BaseModel):
    decision: PolicyDecisionName
    rule: str


class ActionProposal(BaseModel):
    action: str
    user_id: str
    params: dict = {}
    reason: str = ""
    policy: PolicyResult | None = None
    idempotency_key: str


class SameRootCause(BaseModel):
    same: bool
    reason: str = ""


class ReplyTemplate(BaseModel):
    """apology text with {name} and {lesson_time} placeholders"""

    body: str


def iso_z(v: datetime) -> str:
    return v.isoformat() + "Z"


class IncidentSignal(BaseModel):
    error_code: str | None
    release: str | None


class IncidentOut(BaseModel):
    id: str
    title: str
    feature: str
    signal: IncidentSignal
    status: Literal["open", "mitigating", "resolved"]
    ticket_count: int
    first_seen: str
    last_seen: str
    impact: Impact


class AuditEntryOut(BaseModel):
    id: str
    at: str
    actor: str
    action: str
    user_id: str
    incident_id: str | None
    params: dict
    result: Literal["ok", "skipped_duplicate", "failed"]
    reversible: bool
    rolled_back: bool


class PlanOut(BaseModel):
    plan_id: str
    proposals: list[ActionProposal]
    summary: dict[str, int]


class ExecuteIn(BaseModel):
    plan_id: str
    approved_by: str = Field(min_length=1)
    include: list[Literal["auto", "needs_approval"]] = ["auto", "needs_approval"]


class ExecuteOut(BaseModel):
    executed: int
    skipped_duplicate: int
    skipped_policy: int  # forbidden, or decision class not in `include`
    failed: int
    audit_ids: list[str]


class RollbackIn(BaseModel):
    by: str = Field(min_length=1)


class DevCard(BaseModel):
    feature: str
    entry_points: list[dict]
    repro_steps: list[str]
    release: str | None
    impact: Impact
    markdown: str


class QaJudgement(BaseModel):
    """what the model returns when judging an agent reply; the final score is computed by code"""

    accuracy: int = Field(ge=0, le=100)
    empathy: int = Field(ge=0, le=100)
    resolved: bool
    issues: list[str] = []
    better_reply: str = ""


class QaScoreIn(BaseModel):
    ticket_id: str
    agent_reply: str = Field(min_length=1, max_length=4000)


class QaVerdict(QaJudgement):
    score: int = Field(ge=0, le=100)


class QaEntry(QaVerdict):
    id: str
    ticket_id: str
    agent: str
    ticket_text: str
    agent_reply: str
