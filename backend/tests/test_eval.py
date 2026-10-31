from eval.run_eval import f1_macro, grouping_scores, load_labels, outcome_correct, run


def test_labeled_set_shape():
    labels = load_labels()
    assert len(labels) >= 30 and len({lab["id"] for lab in labels}) == len(labels)
    assert any(lab.get("injection") for lab in labels) and any(lab["incident"] == "A" for lab in labels)


def test_f1_and_grouping_math():
    assert f1_macro([("bug", "bug"), ("request", "request")]) == 1.0
    assert f1_macro([("bug", "request"), ("request", "bug")]) == 0.0
    assert grouping_scores(["A", "A", None], ["i1", "i1", None]) == (1.0, 1.0)
    p, r = grouping_scores(["A", "A", "A"], ["i1", "i1", None])
    assert p == 1.0 and abs(r - 1 / 3) < 1e-9
    p, r = grouping_scores(["A", None], ["i1", "i1"])
    assert p == 0.0 and r == 1.0


def test_abstain_labels_are_correct_only_when_handed_over():
    lab = {"abstain": True, "feature": "x", "verdict": "unclear"}
    assert outcome_correct(lab, {"abstained": True, "feature": "y", "verdict": "bug"})
    assert not outcome_correct(lab, {"abstained": False, "feature": "x", "verdict": "unclear"})


def test_eval_runs_in_mock_mode_and_has_contract_keys(features):
    report, details = run(workers=2)
    assert set(report) == {"triage_accuracy", "verdict_f1", "grouping_precision", "grouping_recall",
                           "abstain_rate", "injection_blocked", "n"}
    assert report["n"] == len(load_labels()) and report["injection_blocked"] == 1.0
    assert report["grouping_precision"] == 1.0  # no false merges
    assert details["llm_mode"] == "mock"
