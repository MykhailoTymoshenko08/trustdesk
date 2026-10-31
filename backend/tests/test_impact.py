import json
from datetime import timedelta
from pathlib import Path

from app import clock
from app.services.impact import compute_impact, silent_user_rows
from seed.seed import seed

WAVE = json.loads((Path(__file__).parents[1] / "seed/data/tickets.json").read_text())["wave"]
AUTHORS = {t["user_id"] for t in WAVE}


def test_numbers_match_seed(db):
    seed(db)
    impact = compute_impact(db, "lesson-reschedule", "ERR_TZ_SHIFT", AUTHORS)
    assert (impact.affected_users, impact.silent_users, impact.reporting_users) == (47, 35, 12)
    assert impact.missed_lessons == 19
    assert impact.breakdown.missed_lessons_value_cents == 85500
    assert impact.breakdown.renewals_at_risk_cents == 144500
    assert impact.money_at_risk_cents == 230000


def test_no_signal_means_zero_impact(db):
    seed(db)
    impact = compute_impact(db, "homework", "ERR_NONE", set())
    assert impact.affected_users == 0 and impact.money_at_risk_cents == 0


def test_author_outside_signal_is_not_a_reporting_user(db):
    seed(db)
    impact = compute_impact(db, "lesson-reschedule", "ERR_TZ_SHIFT", AUTHORS | {"u_060"})
    assert impact.reporting_users == 12 and impact.silent_users == 35


def test_renewals_outside_window_are_ignored(db):
    seed(db)
    later = clock.now() + timedelta(days=20)
    impact = compute_impact(db, "lesson-reschedule", "ERR_TZ_SHIFT", AUTHORS, now=later)
    assert impact.breakdown.renewals_at_risk_cents != 144500


def test_silent_rows(db):
    seed(db)
    rows = silent_user_rows(db, "lesson-reschedule", "ERR_TZ_SHIFT", AUTHORS)
    assert len(rows) == 35 and {"id", "name", "last_error_at"} == set(rows[0])
