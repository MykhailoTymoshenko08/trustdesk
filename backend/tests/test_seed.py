from sqlalchemy import func, select

from app.models import Event, Lesson, Payment, Ticket, User
from seed.seed import seed


def test_seed_numbers(db):
    seed(db)
    assert db.scalar(select(func.count()).select_from(User)) == 60
    affected = db.scalar(select(func.count(func.distinct(Event.user_id))).where(Event.error_code == "ERR_TZ_SHIFT"))
    assert affected == 47
    assert db.scalar(select(func.count()).select_from(Lesson).where(Lesson.status == "missed")) == 19
    assert db.scalar(select(func.count()).select_from(Ticket)) == 10
    assert db.scalar(select(func.count()).select_from(Payment).where(Payment.id.like("pay_dup%"))) == 2


def test_seed_with_wave_has_12_incident_tickets(db):
    seed(db, with_wave=True)
    assert db.scalar(select(func.count()).select_from(Ticket)) == 22
