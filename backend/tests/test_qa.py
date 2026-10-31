import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.models import Ticket
from app.services.triage import triage_ticket
from seed.seed import seed
from sqlalchemy import select


@pytest.fixture
def client(db, features):
    seed(db)
    for t in db.scalars(select(Ticket)):  # triage the baseline inbox like /demo/reset does
        triage_ticket(db, t)
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_qa_list_scores_good_rude_and_wrong_replies(client):
    rows = {r["id"]: r for r in client.get("/api/qa").json()}
    good, rude, wrong = rows["qa_1"], rows["qa_2"], rows["qa_3"]
    assert good["score"] >= 80 and good["resolved"] and not good["issues"]
    assert rude["empathy"] < 30 and rude["score"] < 50 and rude["issues"]
    assert wrong["accuracy"] < 40 and wrong["empathy"] >= 70 and wrong["issues"]
    assert good["score"] > wrong["score"] > rude["score"] or good["score"] > rude["score"]
    assert all(0 <= r["score"] <= 100 and r["better_reply"] for r in rows.values())


def test_score_endpoint_and_errors(client):
    r = client.post("/api/qa/score", json={"ticket_id": "t_001", "agent_reply": "Дякуємо! Домашнє з'явиться, коли репетитор завершить урок."})
    assert r.status_code == 200 and r.json()["score"] >= 80
    assert client.post("/api/qa/score", json={"ticket_id": "nope", "agent_reply": "x"}).json()["error"]["code"] == "ticket_not_found"
    assert client.post("/api/qa/score", json={"ticket_id": "t_001", "agent_reply": ""}).status_code == 422


def test_llm_failure_gives_503(client):
    from app.llm import LLMUnavailable, set_llm

    class Down:
        def generate_json(self, prompt, schema):
            raise LLMUnavailable("down")

    set_llm(Down())
    r = client.post("/api/qa/score", json={"ticket_id": "t_001", "agent_reply": "hello"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "llm_unavailable"
