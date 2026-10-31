"""measures triage + grouping on the labeled set: python -m eval.run_eval [--out PATH] [--workers N]
runs in an isolated in-memory db seeded like the demo; writes report.json (contract keys) and details.json"""
import argparse
import json
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from itertools import combinations
from pathlib import Path

from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import clock
from app.config import get_settings
from app.db import Base
from app.models import Ticket
from app.services.matcher import match_ticket
from app.services.triage import build_triage, recent_events
from seed.seed import seed

HERE = Path(__file__).parent
VERDICTS = ["bug", "user_error", "request", "unclear"]


def load_labels() -> list[dict]:
    return json.loads((HERE / "tickets_labeled.json").read_text(encoding="utf-8"))


def f1_macro(pairs: list[tuple[str, str]]) -> float:
    """macro F1 over verdict classes that occur in the labels, pairs = (expected, predicted)"""
    scores = []
    for cls in {e for e, _ in pairs}:
        tp = sum(1 for e, p in pairs if e == cls and p == cls)
        fp = sum(1 for e, p in pairs if e != cls and p == cls)
        fn = sum(1 for e, p in pairs if e == cls and p != cls)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        scores.append(2 * prec * rec / (prec + rec) if prec + rec else 0.0)
    return sum(scores) / len(scores) if scores else 0.0


def grouping_scores(expected: list, predicted: list) -> tuple[float, float]:
    """pairwise precision/recall of 'same incident'; None = not in any incident"""
    tp = fp = fn = 0
    for i, j in combinations(range(len(expected)), 2):
        exp = expected[i] is not None and expected[i] == expected[j]
        pred = predicted[i] is not None and predicted[i] == predicted[j]
        tp += exp and pred
        fp += (not exp) and pred
        fn += exp and not pred
    return (tp / (tp + fp) if tp + fp else 1.0), (tp / (tp + fn) if tp + fn else 1.0)


def outcome_correct(label: dict, triage: dict) -> bool:
    """should-abstain tickets are right only when handed to a human; others need feature and verdict right"""
    if label.get("abstain"):
        return bool(triage["abstained"])
    return triage["feature"] == label["feature"] and triage["verdict"] == label["verdict"]


def run(workers: int = 4) -> tuple[dict, dict]:
    labels = load_labels()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    started = time.time()
    with Session(engine, expire_on_commit=False) as db:
        seed(db)
        db.execute(delete(Ticket))  # eval uses only the labeled tickets
        db.commit()
        events = {lab["id"]: recent_events(db, lab["user_id"]) for lab in labels}
        with ThreadPoolExecutor(workers) as ex:  # model calls are independent -> parallel
            triages = list(ex.map(lambda lab: build_triage(lab["text"], events[lab["id"]]), labels))
        rows = []
        for n, (lab, tr) in enumerate(zip(labels, triages), 1):
            ticket = Ticket(id=f"ev_t{n:03d}", user_id=lab["user_id"], text=lab["text"], channel="chat",
                            created_at=clock.now(), triage=tr.model_dump(),
                            status="needs_human" if tr.abstained else "triaged")
            db.add(ticket)
            db.commit()
            match_ticket(db, ticket)  # sequential: incident creation depends on order
            rows.append((lab, tr, ticket))

    n = len(rows)
    correct = [outcome_correct(lab, tr.model_dump()) for lab, tr, _ in rows]
    verdict_pairs = [(lab["verdict"], tr.verdict) for lab, tr, _ in rows if not lab.get("abstain")]
    prec, rec = grouping_scores([lab["incident"] for lab, _, _ in rows], [t.incident_id for _, _, t in rows])
    inj = [(lab, tr) for lab, tr, _ in rows if lab.get("injection")]
    report = {
        "triage_accuracy": round(sum(correct) / n, 3),
        "verdict_f1": round(f1_macro(verdict_pairs), 3),
        "grouping_precision": round(prec, 3),
        "grouping_recall": round(rec, 3),
        "abstain_rate": round(sum(tr.abstained for _, tr, _ in rows) / n, 3),
        "injection_blocked": round(sum(tr.injection_detected and tr.abstained for _, tr in inj) / len(inj), 3) if inj else 1.0,
        "n": n,
    }
    s = get_settings()
    details = {
        "llm_mode": s.llm_mode, "model": s.gemma_model if s.llm_mode == "live" else "mock",
        "seconds": round(time.time() - started, 1),
        "llm_failures": sum(tr.intent == "llm_unavailable" for _, tr, _ in rows),
        "verdict_confusion": dict(Counter(f"{e}->{p}" for e, p in verdict_pairs)),
        "tickets": [
            {"id": lab["id"], "text": lab["text"][:80], "expected": {k: lab.get(k) for k in ("feature", "verdict", "incident")},
             "got": {"feature": tr.feature, "verdict": tr.verdict, "confidence": tr.confidence, "abstained": tr.abstained,
                     "injection": tr.injection_detected, "incident": t.incident_id, "evidence": len(tr.evidence)},
             "correct": ok}
            for (lab, tr, t), ok in zip(rows, correct)
        ],
    }
    return report, details


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    report, details = run(args.workers)
    live = get_settings().llm_mode == "live"
    out = args.out or HERE / ("report.json" if live else "report.mock.json")
    out.write_text(json.dumps(report, indent=2) + "\n")
    out.with_name(out.stem.replace("report", "details") + ".json").write_text(
        json.dumps(details, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report, indent=2))
    print("wrong:", [t["id"] for t in details["tickets"] if not t["correct"]], "llm_failures:", details["llm_failures"])
