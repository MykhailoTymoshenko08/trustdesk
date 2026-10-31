from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.llm import LLMUnavailable
from app.models import Ticket
from app.schemas import QaEntry, QaScoreIn, QaVerdict
from app.services import qa

router = APIRouter(prefix="/qa", tags=["qa"])


@router.post("/score", response_model=QaVerdict)
def score(body: QaScoreIn, db: Session = Depends(get_db)):
    ticket = db.get(Ticket, body.ticket_id)
    if not ticket:
        raise ApiError(404, "ticket_not_found", f"ticket {body.ticket_id} not found")
    try:
        return qa.score_reply(ticket, body.agent_reply)
    except LLMUnavailable:
        raise ApiError(503, "llm_unavailable", "the model could not judge this reply, try again")


@router.get("", response_model=list[QaEntry])
def list_qa(db: Session = Depends(get_db)):
    return qa.list_entries(db)
