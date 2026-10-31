"""demo helpers: reseed and stream the incident wave"""
import threading
import time

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app import db as dbmod
from app.db import Base, get_db
from app.models import Ticket
from app.services import tickets as tsvc
from app.services.pipeline import process_ticket
from seed.seed import load_wave_tickets, seed

router = APIRouter(prefix="/demo", tags=["demo"])
_generation = 0  # bumped by reset so a running wave stops
_gen_lock = threading.Lock()


class WaveIn(BaseModel):
    count: int = Field(default=12, ge=1, le=12)
    interval_ms: int = Field(default=800, ge=0, le=60000)


def run_wave(factory: sessionmaker, count: int, interval_ms: int, generation: int) -> int:
    posted = 0
    for item in load_wave_tickets()[:count]:
        if generation != _generation:
            break
        with factory() as db:
            process_ticket(db, tsvc.create_ticket(db, item["user_id"], item["text"], item["channel"]))
        posted += 1
        time.sleep(interval_ms / 1000)
    return posted


def triage_baseline(factory: sessionmaker) -> int:
    """triage the seeded 'new' tickets so the inbox starts calm and classified"""
    with factory() as db:
        ids = [t.id for t in db.scalars(select(Ticket).where(Ticket.status == "new").order_by(Ticket.created_at))]
    for tid in ids:
        with factory() as db:
            ticket = db.get(Ticket, tid)
            if ticket and ticket.status == "new":
                process_ticket(db, ticket)
    from app.services.qa import score_pending_in_background

    score_pending_in_background(factory)  # judge the seeded human replies once tickets are triaged
    return len(ids)


@router.post("/reset")
def reset(background: BackgroundTasks, db: Session = Depends(get_db)):
    global _generation
    with _gen_lock:
        _generation += 1
    bind = db.get_bind()
    db.close()
    Base.metadata.drop_all(bind)
    Base.metadata.create_all(bind)
    with Session(bind) as s:
        seed(s)
    background.add_task(triage_baseline, sessionmaker(bind=bind, expire_on_commit=False))
    return {"ok": True}


@router.post("/wave")
def wave(body: WaveIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    background.add_task(run_wave, factory, body.count, body.interval_ms, _generation)
    return {"started": True}
