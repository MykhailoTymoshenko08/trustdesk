import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from sqlalchemy import func, select

from app import clock
from app.models import Incident, Ticket
from app.services import tickets as tsvc
from app.services.pipeline import process_ticket
from seed.seed import load_wave_tickets, seed


def post(db, user_id, text):
    return process_ticket(db, tsvc.create_ticket(db, user_id, text))


def test_wave_ends_in_one_incident_homework_does_not(db, features):
    seed(db)
    for w in load_wave_tickets():
        post(db, w["user_id"], w["text"])
    assert db.scalar(select(func.count()).select_from(Incident)) == 1
    inc = db.scalar(select(Incident))
    assert (inc.feature, inc.error_code, inc.release) == ("lesson-reschedule", "ERR_TZ_SHIFT", "v2.14")
    assert db.scalar(select(func.count()).select_from(Ticket).where(Ticket.incident_id == inc.id)) == 12
    for t in db.scalars(select(Ticket).where(Ticket.id <= "t_010")):
        assert t.incident_id is None, t.text


def test_isolated_double_charge_and_video_are_not_incidents(db, features):
    seed(db)
    t1 = post(db, "u_050", "Мене двічі списали за пакет, верніть гроші")
    t2 = post(db, "u_053", "Не можу зайти у відеоурок")
    assert t1.incident_id is None and t2.incident_id is None
    assert db.scalar(select(func.count()).select_from(Incident)) == 0


def test_incident_times_follow_log_signal(db, features):
    seed(db)
    post(db, "u_001", "Перенесла на 18:00, а стоїть 17:00")
    inc = db.scalar(select(Incident))
    assert inc.first_seen < inc.last_seen <= clock.now()


def test_concurrent_tickets_create_one_incident(tmp_path, features):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db import Base

    engine = create_engine(f"sqlite:///{tmp_path / 't.db'}", connect_args={"check_same_thread": False, "timeout": 30})
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, expire_on_commit=False)
    with maker() as s:
        seed(s)

    def run(w):
        with maker() as s:
            post(s, w["user_id"], w["text"])

    with ThreadPoolExecutor(6) as ex:
        list(ex.map(run, load_wave_tickets()))
    with maker() as s:
        assert s.scalar(select(func.count()).select_from(Incident)) == 1
        assert s.scalar(select(func.count()).select_from(Ticket).where(Ticket.incident_id == "inc_1")) == 12
