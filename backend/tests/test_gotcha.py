import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from seed.seed import seed


@pytest.fixture
def client(db, features):
    seed(db)
    app.dependency_overrides[get_db] = lambda: db
    c = TestClient(app)
    c.post("/api/demo/reset")
    c.post("/api/demo/wave", json={"count": 12, "interval_ms": 0})
    yield c
    app.dependency_overrides.clear()


def test_gotcha_draft_has_signature_release_and_support_answer(client):
    g = client.get("/api/incidents/inc_1/gotcha").json()
    assert g["file"] == "docs/features/lesson-reschedule/known-gotchas.md"
    for needle in ("ERR_TZ_SHIFT", "v2.14", "47 families", "Symptom", "How support should answer"):
        assert needle in g["diff"]


def test_gotcha_falls_back_when_model_is_down(client):
    from app.llm import LLMUnavailable, set_llm

    class Down:
        def generate_json(self, prompt, schema):
            raise LLMUnavailable("down")

    set_llm(Down())
    g = client.get("/api/incidents/inc_1/gotcha").json()
    assert "ERR_TZ_SHIFT" in g["diff"] and "escalate" in g["diff"]


def test_gotcha_unknown_incident(client):
    assert client.get("/api/incidents/nope/gotcha").status_code == 404
