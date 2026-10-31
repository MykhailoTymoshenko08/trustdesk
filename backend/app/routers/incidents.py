from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import Incident, Ticket
from app.schemas import DevCard, ExecuteIn, ExecuteOut, GotchaOut, IncidentOut, PlanOut
from app.services import devcard, executor, gotcha, incidents as isvc, planner, tickets as tsvc
from app.services.impact import silent_user_rows, ticket_authors

router = APIRouter(prefix="/incidents", tags=["incidents"])


def get_incident(db: Session, incident_id: str) -> Incident:
    inc = db.get(Incident, incident_id)
    if not inc:
        raise ApiError(404, "incident_not_found", f"incident {incident_id} not found")
    return inc


@router.get("", response_model=list[IncidentOut])
def list_incidents(db: Session = Depends(get_db)):
    return [isvc.to_out(db, i) for i in db.scalars(select(Incident).order_by(Incident.first_seen.desc()))]


@router.get("/{incident_id}")
def incident_detail(incident_id: str, db: Session = Depends(get_db)):
    inc = get_incident(db, incident_id)
    tickets = db.scalars(select(Ticket).where(Ticket.incident_id == inc.id).order_by(Ticket.created_at, Ticket.id))
    return {
        "incident": isvc.to_out(db, inc),
        "tickets": [tsvc.to_out(db, t) for t in tickets],
        "silent_users": silent_user_rows(db, inc.feature, inc.error_code or "", ticket_authors(db, inc.id)),
    }


@router.get("/{incident_id}/devcard", response_model=DevCard)
def incident_devcard(incident_id: str, db: Session = Depends(get_db)):
    return devcard.build_devcard(db, get_incident(db, incident_id))


@router.get("/{incident_id}/gotcha", response_model=GotchaOut)
def incident_gotcha(incident_id: str, db: Session = Depends(get_db)):
    """draft of a known-gotchas.md entry to append after the incident (review before committing)"""
    return gotcha.build_gotcha(db, get_incident(db, incident_id))


@router.post("/{incident_id}/plan", response_model=PlanOut)
def plan(incident_id: str, db: Session = Depends(get_db)):
    return planner.build_plan(db, get_incident(db, incident_id))


@router.post("/{incident_id}/execute", response_model=ExecuteOut)
def execute(incident_id: str, body: ExecuteIn, db: Session = Depends(get_db)):
    inc = get_incident(db, incident_id)
    from app.models import Plan

    stored = db.get(Plan, body.plan_id)
    if stored and stored.incident_id != inc.id:
        raise ApiError(400, "plan_mismatch", f"plan {body.plan_id} belongs to {stored.incident_id}")
    result = executor.execute_plan(db, body.plan_id, body.approved_by, list(body.include))
    if result.executed and inc.status == "open":
        inc.status = "mitigating"
        db.commit()
    return result
