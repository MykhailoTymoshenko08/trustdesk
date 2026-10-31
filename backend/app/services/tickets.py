"""ticket persistence helpers"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock
from app.models import Ticket, User
from app.schemas import TicketOut, Triage


def to_out(db: Session, t: Ticket) -> TicketOut:
    user = db.get(User, t.user_id)
    return TicketOut(
        id=t.id, user_id=t.user_id, user_name=user.name if user else t.user_id, channel=t.channel, text=t.text,
        created_at=t.created_at, status=t.status, incident_id=t.incident_id,
        triage=Triage.model_validate(t.triage) if t.triage else None,
    )


def next_ticket_id(db: Session) -> str:
    n = db.scalar(select(func.count()).select_from(Ticket)) or 0
    while db.get(Ticket, f"t_{n + 1:03d}"):
        n += 1
    return f"t_{n + 1:03d}"


def create_ticket(db: Session, user_id: str, text: str, channel: str = "chat") -> Ticket:
    ticket = Ticket(id=next_ticket_id(db), user_id=user_id, text=text, channel=channel,
                    created_at=clock.now(), status="new")
    db.add(ticket)
    db.commit()
    return ticket
