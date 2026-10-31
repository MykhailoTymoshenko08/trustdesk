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
