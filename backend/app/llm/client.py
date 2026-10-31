"""gemma wrapper: prompt -> validated pydantic object, with retries, json repair and mock mode"""
import logging
import re
import threading
import time
from collections.abc import Callable
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.llm.jsonfix import json_candidates

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

TRANSPORT_RETRIES = 2
MAX_RATE_LIMIT_WAITS = 6
MAX_WAIT_S = 30.0
_RETRY_IN = re.compile(r"retry in ([\d.]+)s", re.I)


def rate_limit_delay(exc: Exception) -> float | None:
    """seconds to wait if the error is a 429 quota error, else None"""
    text = str(exc)
    if "429" not in text and "RESOURCE_EXHAUSTED" not in text:
        return None
    m = _RETRY_IN.search(text)
    return min(float(m.group(1)) + 1.0 if m else 15.0, MAX_WAIT_S)


class LLMUnavailable(Exception):
    """model could not produce a usable answer - callers hand the ticket to a human"""


class LLM(Protocol):
    def generate_json(self, prompt: str, schema: type[T]) -> T: ...
    def embed(self, texts: list[str]) -> list[list[float]]: ...


def _with_schema(prompt: str, schema: type[BaseModel]) -> str:
    return (
        f"{prompt}\n\nRespond with ONLY one JSON object (no markdown, no commentary) "
        f"that matches this JSON schema:\n{schema.model_json_schema()}"
    )


def _parse(text: str, schema: type[T]) -> tuple[T | None, str]:
    """first candidate that validates, else the validation error text"""
    candidates = json_candidates(text)
    if not candidates:
        return None, "no JSON object found in the answer"
    error = ""
    for value in candidates:
        try:
            return schema.model_validate(value), ""
        except ValidationError as exc:
            error = str(exc)
    return None, error


class GeminiLLM:
    """live mode: google-genai. never uses response_mime_type (gemma has no json mode)"""

    def __init__(self, complete: Callable[[str], str] | None = None, sleep: Callable[[float], None] = time.sleep):
        self._complete_fn = complete
        self._sleep = sleep
        self._client = None
        self._client_lock = threading.Lock()

    def _sdk(self):
        with self._client_lock:  # one shared client; concurrent creation closed clients under other threads
            if self._client is None:
                from google import genai
                from google.genai import types

                s = get_settings()
                if not s.gemini_api_key:
                    raise LLMUnavailable("GEMINI_API_KEY is not set")
                self._client = genai.Client(
                    api_key=s.gemini_api_key,
                    http_options=types.HttpOptions(timeout=int(s.llm_timeout_s * 1000)),
                )
            return self._client

    def _complete(self, prompt: str) -> str:
        if self._complete_fn:
            return self._complete_fn(prompt)
        from google.genai import types

        resp = self._sdk().models.generate_content(
            model=get_settings().gemma_model,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.1),
        )
        return resp.text or ""

    def _call(self, prompt: str) -> str:
        last: Exception | None = None
        attempt = waits = 0
        while attempt <= TRANSPORT_RETRIES:
            try:
                return self._complete(prompt)
            except LLMUnavailable:
                raise
            except Exception as exc:  # sdk raises many error types
                last = exc
                delay = rate_limit_delay(exc)
                if delay is not None and waits < MAX_RATE_LIMIT_WAITS:  # quota: wait as told, not a failure
                    waits += 1
                    log.info("rate limited, waiting %.0fs", delay)
                    self._sleep(delay)
                    continue
                log.warning("llm call failed (attempt %s): %s", attempt + 1, str(exc)[:200])
                if attempt < TRANSPORT_RETRIES:
                    self._sleep(2**attempt)
                attempt += 1
        raise LLMUnavailable(f"llm call failed: {str(last)[:200]}")

    def generate_json(self, prompt: str, schema: type[T]) -> T:
        full = _with_schema(prompt, schema)
        obj, error = _parse(self._call(full), schema)
        if obj is not None:
            return obj
        retry = (
            f"{full}\n\nYour previous answer was invalid: {error}\n"
            "Fix it and answer again with ONLY the JSON object."
        )
        obj, error = _parse(self._call(retry), schema)
        if obj is None:
            raise LLMUnavailable(f"invalid model output after retry: {error[:300]}")
        return obj

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        s = get_settings()
        last: Exception | None = None
        for attempt in range(TRANSPORT_RETRIES + 1):
            try:
                resp = self._sdk().models.embed_content(model=s.embed_model, contents=texts)
                return [list(e.values) for e in resp.embeddings]
            except LLMUnavailable:
                raise
            except Exception as exc:
                last = exc
                self._sleep(rate_limit_delay(exc) or 2**attempt) if attempt < TRANSPORT_RETRIES else None
        raise LLMUnavailable(f"embedding failed: {str(last)[:200]}")


_llm: LLM | None = None


def get_llm() -> LLM:
    global _llm
    if _llm is None:
        if get_settings().llm_mode == "mock":
            from app.llm.mock import MockLLM

            _llm = MockLLM()
        else:
            _llm = GeminiLLM()
    return _llm


def set_llm(llm: LLM | None) -> None:
    """override (tests) or reset to env-selected client"""
    global _llm
    _llm = llm
