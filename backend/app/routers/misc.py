"""audit, eval, metrics"""
import json
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Audit, Incident, Ticket
from app.schemas import AuditEntryOut, RollbackIn
from app.services import executor

router = APIRouter(tags=["misc"])
EVAL_REPORT = Path(__file__).resolve().parents[2] / "eval" / "report.json"
MANUAL_MINUTES_PER_TICKET = 6  # assumption: average human handle time for a ticket


@router.get("/audit", response_model=list[AuditEntryOut])
def audit(incident_id: str | None = None, db: Session = Depends(get_db)):
    q = select(Audit).order_by(Audit.at.desc(), Audit.id.desc())
    if incident_id:
        q = q.where(Audit.incident_id == incident_id)
    return [executor.audit_out(a) for a in db.scalars(q)]


@router.post("/audit/{audit_id}/rollback", response_model=AuditEntryOut)
def rollback(audit_id: str, body: RollbackIn, db: Session = Depends(get_db)):
    return executor.rollback(db, audit_id, body.by)


@router.get("/eval")
def eval_report():
    """metrics written by eval/run_eval.py (T14); zeros with n=0 until it has run"""
    if EVAL_REPORT.is_file():
        return json.loads(EVAL_REPORT.read_text())
    return {"triage_accuracy": 0, "verdict_f1": 0, "grouping_precision": 0, "grouping_recall": 0,
            "abstain_rate": 0, "injection_blocked": 0, "n": 0}


@router.get("/metrics")
def metrics(db: Session = Depends(get_db)):
    total = db.scalar(select(func.count()).select_from(Ticket)) or 0
    handled = db.scalar(select(func.count()).select_from(Ticket).where(
        Ticket.status.in_(["triaged", "in_incident", "resolved"]))) or 0
    pct = round(100 * handled / total, 1) if total else 0.0
    return {
        "tickets_total": total,
        "auto_resolved_pct": pct,
        "avg_handle_time_saved_min": round(MANUAL_MINUTES_PER_TICKET * pct / 100, 1),
        "incidents_open": db.scalar(select(func.count()).select_from(Incident).where(Incident.status != "resolved")) or 0,
    }
