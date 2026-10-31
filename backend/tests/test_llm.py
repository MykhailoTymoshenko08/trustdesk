import pytest
from pydantic import BaseModel

from app.llm.client import GeminiLLM, LLMUnavailable
from app.llm.jsonfix import json_candidates
from app.llm.mock import MockLLM


class Out(BaseModel):
    a: int
    b: str


def test_extract_fenced_json():
    assert json_candidates('sure!\n```json\n{"a": 1, "b": "x"}\n```')[0] == {"a": 1, "b": "x"}


def test_repair_trailing_comma_and_python_literals():
    assert json_candidates("{'a': 1,}".replace("'", '"'))[0] == {"a": 1}
    assert json_candidates('{"a": True, "b": None,}')[0] == {"a": True, "b": None}


def test_thinking_text_with_braces_before_json():
    out = json_candidates('I think {maybe} this: {"a": 2, "b": "y"} done')
    assert {"a": 2, "b": "y"} in out


def test_truncated_json_is_closed():
    assert json_candidates('{"a": 3, "b": "cut')[0] == {"a": 3, "b": "cut"}


def llm(*answers):
    it = iter(answers)
    prompts = []

    def complete(p):
        prompts.append(p)
        a = next(it)
        if isinstance(a, Exception):
            raise a
        return a

    return GeminiLLM(complete=complete, sleep=lambda s: None), prompts


def test_validation_error_retried_once_with_error_appended():
    client, prompts = llm('{"a": "nope", "b": "x"}', '{"a": 1, "b": "x"}')
    assert client.generate_json("hi", Out) == Out(a=1, b="x")
    assert "previous answer was invalid" in prompts[1] and "a" in prompts[1]


def test_two_invalid_answers_raise_unavailable():
    client, _ = llm("garbage", "still garbage")
    with pytest.raises(LLMUnavailable):
        client.generate_json("hi", Out)


def test_transport_errors_retried_then_unavailable():
    client, prompts = llm(RuntimeError("503"), RuntimeError("503"), RuntimeError("503"))
    with pytest.raises(LLMUnavailable):
        client.generate_json("hi", Out)
    assert len(prompts) == 3


def test_transport_error_then_success():
    client, _ = llm(RuntimeError("503"), '{"a": 1, "b": "z"}')
    assert client.generate_json("hi", Out).b == "z"


def test_mock_embed_is_deterministic_and_normalised():
    v1, v2 = MockLLM().embed(["час уроку"]), MockLLM().embed(["час уроку"])
    assert v1 == v2 and abs(sum(x * x for x in v1[0]) - 1) < 1e-9
