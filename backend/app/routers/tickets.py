from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import Ticket, User
from app.schemas import TicketOut
from app.services import tickets as svc
from app.services.triage import triage_ticket

router = APIRouter(prefix="/tickets", tags=["tickets"])


class TicketIn(BaseModel):
    user_id: str
    text: str = Field(min_length=1, max_length=5000)
    channel: Literal["chat", "email"] = "chat"


def _get(db: Session, ticket_id: str) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise ApiError(404, "ticket_not_found", f"ticket {ticket_id} not found")
    return ticket


@router.get("", response_model=list[TicketOut])
def list_tickets(status: str | None = None, incident_id: str | None = None, db: Session = Depends(get_db)):
    q = select(Ticket).order_by(Ticket.created_at.desc(), Ticket.id.desc())
    if status:
        q = q.where(Ticket.status == status)
    if incident_id:
        q = q.where(Ticket.incident_id == incident_id)
    return [svc.to_out(db, t) for t in db.scalars(q)]


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: str, db: Session = Depends(get_db)):
    return svc.to_out(db, _get(db, ticket_id))


@router.post("", response_model=TicketOut, status_code=201)
def create(body: TicketIn, db: Session = Depends(get_db)):
    if not db.get(User, body.user_id):
        raise ApiError(404, "user_not_found", f"user {body.user_id} not found")
    ticket = svc.create_ticket(db, body.user_id, body.text, body.channel)
    triage_ticket(db, ticket)
    return svc.to_out(db, ticket)


@router.post("/{ticket_id}/retriage", response_model=TicketOut)
def retriage(ticket_id: str, db: Session = Depends(get_db)):
    ticket = _get(db, ticket_id)
    triage_ticket(db, ticket)
    return svc.to_out(db, ticket)
