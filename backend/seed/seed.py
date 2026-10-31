"""builds the demo sqlite db deterministically: python -m seed.seed [--with-wave]"""
import json
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app import clock
from app.db import Base, SessionLocal, engine, init_db
from app.models import Event, Lesson, Payment, Subscription, Ticket, Tutor, User

DATA = Path(__file__).parent / "data"
N_USERS = 60
N_AFFECTED = 47  # u_001..u_047 hit ERR_TZ_SHIFT after v2.14
MISSED_USERS = [*range(1, 11), *range(13, 22)]  # 19 lessons already passed
RENEWING_USERS = range(3, 20)  # 17 subscriptions renewing within 14 days
LESSON_PRICE = 4500
SUB_PRICE = 8500
RELEASE = "v2.14"
ERROR_CODE = "ERR_TZ_SHIFT"

HOMEWORK_USERS = {48, 49, 51, 52}
DOUBLE_CHARGE_USER = 50
VIDEO_USER = 53


def uid(n: int) -> str:
    return f"u_{n:03d}"


class EventIds:
    def __init__(self) -> None:
        self.n = 0

    def next(self) -> str:
        self.n += 1
        return f"ev_{self.n:04d}"


def load_json(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def build_users(now: datetime) -> tuple[list[User], list[Tutor]]:
    names = load_json("names.json")
    users = [
        User(id=uid(i), name=names[i - 1], email=f"family{i}@example.com", free_lessons=0)
        for i in range(1, N_USERS + 1)
    ]
    tutors = [Tutor(id=f"tu_{i}", name=n) for i, n in enumerate(["Maria", "Oleksandr", "Iryna", "Taras"], 1)]
    return users, tutors


def hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def affected_rows(i: int, now: datetime, rng: random.Random, ids: EventIds):
    """lesson + events for one affected family"""
    missed = i in MISSED_USERS
    if missed:  # lesson earlier today, already passed
        requested = now.replace(hour=11, minute=0) - timedelta(minutes=30 * rng.randint(0, 3))
        reschedule_at = now.replace(hour=8, minute=0) + timedelta(minutes=rng.randint(0, 90))
    else:  # lesson in the next days
        requested = (now + timedelta(days=rng.randint(1, 6))).replace(hour=rng.randint(15, 19), minute=0)
        reschedule_at = now.replace(hour=9, minute=30) + timedelta(minutes=rng.randint(0, 120))
    stored = requested - timedelta(hours=1)
    lesson = Lesson(
        id=i, user_id=uid(i), tutor_id=f"tu_{rng.randint(1, 4)}", requested_at=requested, stored_at=stored,
        status="missed" if missed else "scheduled", price_cents=LESSON_PRICE,
    )
    events = [
        Event(id=ids.next(), user_id=uid(i), at=reschedule_at - timedelta(seconds=20), feature="lesson-reschedule",
              event="reschedule_requested", payload={"lesson": i, "new": hhmm(requested)}, release=RELEASE),
        Event(id=ids.next(), user_id=uid(i), at=reschedule_at, feature="lesson-reschedule", event="reschedule_ok",
              payload={"lesson": i, "new": hhmm(requested), "stored": hhmm(stored)},
              error_code=ERROR_CODE, release=RELEASE),
    ]
    return lesson, events


def normal_rows(i: int, now: datetime, rng: random.Random, ids: EventIds):
    """lesson + routine events for a family outside the incident"""
    lesson_at = (now + timedelta(days=rng.randint(1, 5))).replace(hour=rng.randint(15, 19), minute=0)
    lesson = Lesson(id=i, user_id=uid(i), tutor_id=f"tu_{rng.randint(1, 4)}", requested_at=lesson_at,
                    stored_at=lesson_at, status="scheduled", price_cents=LESSON_PRICE)
    events = [Event(id=ids.next(), user_id=uid(i), at=now - timedelta(hours=rng.randint(5, 40)),
                    feature="lesson-reschedule", event="reschedule_ok",
                    payload={"lesson": i, "new": hhmm(lesson_at), "stored": hhmm(lesson_at)}, release="v2.13")]
    if i in HOMEWORK_USERS:
        events.append(Event(
            id=ids.next(), user_id=uid(i), at=now - timedelta(hours=2), feature="homework",
            event="homework_view_empty", payload={"lesson_status": "in_progress", "tutor_completed": False}))
    if i == VIDEO_USER:
        events.append(Event(id=ids.next(), user_id=uid(i), at=now - timedelta(minutes=135), feature="lesson-video",
                            event="video_join_failed", payload={"attempts": 3}, error_code="ERR_WEBRTC_TIMEOUT"))
    return lesson, events


def build_money(now: datetime) -> tuple[list[Payment], list[Subscription], list[Event]]:
    payments, subs, events = [], [], []
    for i in range(1, N_USERS + 1):
        payments.append(Payment(id=f"pay_{i:03d}", user_id=uid(i), amount_cents=24000,
                                at=now - timedelta(days=20 + i % 7)))
        renews = now + (timedelta(days=3 + i % 10) if i in RENEWING_USERS else timedelta(days=30 + i % 15))
        subs.append(Subscription(id=f"sub_{i:03d}", user_id=uid(i), plan="monthly", price_cents=SUB_PRICE,
                                 renews_at=renews))
    # the one real double charge (isolated, not an incident)
    at = now - timedelta(hours=4)
    payments += [Payment(id="pay_dup_a", user_id=uid(DOUBLE_CHARGE_USER), amount_cents=18000, at=at),
                 Payment(id="pay_dup_b", user_id=uid(DOUBLE_CHARGE_USER), amount_cents=18000,
                         at=at + timedelta(seconds=4))]
    return payments, subs, events


def build_tickets(now: datetime, with_wave: bool) -> list[Ticket]:
    data = load_json("tickets.json")
    rows = [(f"t_{n:03d}", r) for n, r in enumerate(data["baseline"], 1)]
    if with_wave:
        rows += [(f"t_{n:03d}", r) for n, r in enumerate(data["wave"], 100)]
    return [
        Ticket(id=tid, user_id=r["user_id"], channel=r["channel"], text=r["text"],
               created_at=now + timedelta(minutes=r["offset_min"]), status="new")
        for tid, r in rows
    ]


def load_wave_tickets() -> list[dict]:
    """incident wave as plain dicts (user_id, channel, text) for /demo/wave"""
    return load_json("tickets.json")["wave"]


def seed(session: Session, with_wave: bool = False) -> None:
    now = clock.now()
    rng = random.Random(42)
    ids = EventIds()
    users, tutors = build_users(now)
    session.add_all([*users, *tutors])
    session.flush()
    for i in range(1, N_USERS + 1):
        build = affected_rows if i <= N_AFFECTED else normal_rows
        lesson, events = build(i, now, rng, ids)
        session.add(lesson)
        session.add_all(events)
    payments, subs, extra = build_money(now)
    session.add_all([*payments, *subs, *extra])
    session.add_all(build_tickets(now, with_wave))
    session.commit()


def reset_db(with_wave: bool = False) -> None:
    Base.metadata.drop_all(engine)
    init_db()
    with SessionLocal() as session:
        seed(session, with_wave)


if __name__ == "__main__":
    reset_db(with_wave="--with-wave" in sys.argv)
    print("seeded", engine.url)
