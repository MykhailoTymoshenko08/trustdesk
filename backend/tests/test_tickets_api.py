import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from seed.seed import seed


@pytest.fixture
def client(db, features):
    seed(db)
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_post_ticket_runs_triage(client):
    r = client.post("/api/tickets", json={"user_id": "u_001", "text": "Перенесла на 18:00, а стоїть 17:00", "channel": "chat"})
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "in_incident" and body["incident_id"] == "inc_1" and body["triage"]["verdict"] == "bug"
    assert body["created_at"].endswith("Z") and body["user_name"] == "Olena K."


def test_list_filter_and_get(client):
    assert len(client.get("/api/tickets").json()) == 10
    assert client.get("/api/tickets/t_001").status_code == 200


def test_errors_use_contract_format(client):
    r = client.get("/api/tickets/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "ticket_not_found"
    assert client.post("/api/tickets", json={"user_id": "zzz", "text": "x"}).json()["error"]["code"] == "user_not_found"
    assert client.post("/api/tickets", json={}).json()["error"]["code"] == "validation_error"


def test_retriage(client):
    r = client.post("/api/tickets/t_001/retriage")
    assert r.json()["triage"]["feature"] == "homework"
