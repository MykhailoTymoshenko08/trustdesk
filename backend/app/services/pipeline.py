"""ticket -> triage -> incident matching"""
from sqlalchemy.orm import Session

from app.models import Ticket
from app.services.matcher import match_ticket
from app.services.triage import triage_ticket


def process_ticket(db: Session, ticket: Ticket) -> Ticket:
    triage_ticket(db, ticket)
    match_ticket(db, ticket)
    return ticket
