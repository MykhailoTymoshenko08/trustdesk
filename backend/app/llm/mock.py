"""deterministic offline llm: keyword fixtures so tests and the demo run without network"""
import hashlib
import math
import re
from typing import TypeVar

from pydantic import BaseModel

from app.schemas import ReplyTemplate, SameRootCause, TriageDraft

T = TypeVar("T", bound=BaseModel)

RESCHEDULE = ("перен", "reschedul", "відклада", "розклад", "переїх")
TIME_WRONG = re.compile(r"\d{1,2}[:.]\d{2}|\bчас\b|раніше|wrong time|\d\s?(pm|am)", re.I)
HOMEWORK = ("домашк", "домашнє", "дз", "homework")
PAYMENTS = ("списал", "двічі", "charged", "refund", "платіж", "гроші", "верніть")
VIDEO = ("відео", "video")

REPLIES = {
    "bug": {
        "uk": "Дякуємо, що написали, і вибачте за незручності. Ми знайшли проблему на нашому боці та вже її виправляємо. "
              "Ми повернемося до вас із рішенням щодо пропущеного уроку.",
        "en": "Thank you for reaching out and sorry for the trouble. We found a problem on our side and are fixing it. "
              "We will get back to you about the missed lesson.",
    },
    "user_error": {
        "uk": "Дякуємо за звернення! Домашнє завдання з'являється після того, як репетитор відмітить урок завершеним. "
              "Будь ласка, перевірте розділ через кілька хвилин.",
        "en": "Thanks for reaching out! Homework appears once the tutor marks the lesson as completed. "
              "Please check again in a few minutes.",
    },
    "request": {
        "uk": "Дякуємо за запитання! Наш менеджер скоро надішле вам відповідь.",
        "en": "Thanks for your question! A teammate will send you the answer shortly.",
    },
    "unclear": {
        "uk": "Дякуємо за повідомлення! Розкажіть, будь ласка, детальніше, що сталося.",
        "en": "Thanks for your message! Could you tell us a bit more about what happened?",
    },
}


def _lang(text: str) -> str:
    return "uk" if re.search(r"[а-яіїєґ]", text, re.I) else "en"


def _section(prompt: str, tag: str) -> str:
    m = re.search(rf"<{tag}>\n(.*?)\n</{tag}>", prompt, re.S)
    return m.group(1) if m else ""


def _refs(block: str) -> list[tuple[str, str]]:
    return [(m.group(1), m.group(2)) for m in re.finditer(r"^\[([^\]]+)\] (.*)$", block, re.M)]


def _classify(msg: str) -> tuple[str, str]:
    """(feature, intent) from keywords"""
    low = msg.lower()
    two_times = len(re.findall(r"\d{1,2}[:.]\d{2}", low)) >= 2
    if (any(k in low for k in RESCHEDULE) and TIME_WRONG.search(low)) or two_times:
        return "lesson-reschedule", "lesson_time_wrong_after_reschedule"
    if any(k in low for k in HOMEWORK):
        return "homework", "homework_not_visible"
    if any(k in low for k in PAYMENTS):
        return "payments", "double_charge" if any(k in low for k in ("двічі", "twice", "double")) else "refund_request"
    if any(k in low for k in VIDEO):
        return "lesson-video", "cannot_join_video"
    if any(k in low for k in ("додати", "скільки коштує", "how much", "how do i")):
        return "general", "general_question"
    return "general", "unknown"


def mock_triage(prompt: str) -> TriageDraft:
    msg = _section(prompt, "user_message")
    events, docs = _refs(_section(prompt, "events")), _refs(_section(prompt, "docs"))
    feature, intent = _classify(msg)
    lang = _lang(msg)

    def draft(verdict: str, conf: float, refs: list[str]) -> TriageDraft:
        return TriageDraft(intent=intent, feature=feature, verdict=verdict, confidence=conf,
                           evidence_refs=refs, suggested_reply=REPLIES[verdict][lang])

    err_events = [r for r, t in events if "ERR_" in t and feature_matches(t, feature)]
    if feature == "lesson-reschedule":
        if err_events:
            doc = _pick(docs, "lesson-reschedule/", "utc")
            return draft("bug", 0.93, err_events[:2] + doc)
        return draft("unclear", 0.45, [])
    if feature == "homework":
        empty = [r for r, t in events if "homework_view_empty" in t][:1]
        doc = _pick(docs, "homework/", "visible", "complete")
        return draft("user_error", 0.9 if doc else 0.7, empty + doc)
    if feature == "payments":
        if intent == "double_charge":
            return draft("bug", 0.82, [r for r, t in events if "payment_charged" in t][:2])
        return draft("request", 0.55, [])
    if feature == "lesson-video":
        return draft("bug", 0.75, err_events[:1])
    if intent == "general_question":
        return draft("request", 0.8, [])
    return draft("unclear", 0.3, [])


def _pick(docs: list[tuple[str, str]], prefix: str, *keywords: str) -> list[str]:
    """first doc ref under prefix matching the earliest keyword"""
    for kw in keywords:
        for ref, text in docs:
            if ref.startswith(prefix) and kw in text.lower():
                return [ref]
    return []


def feature_matches(event_text: str, feature: str) -> bool:
    return f"feature={feature}" in event_text or "feature=" not in event_text


def mock_template(prompt: str) -> ReplyTemplate:
    return ReplyTemplate(body=(
        "Вітаємо, {name}! Через помилку в нашому оновленні час вашого перенесеного уроку ({lesson_time}) "
        "міг відображатися невірно. Ми вже виправили проблему, а за незручності додали вам безкоштовний урок. "
        "Вибачте, що так сталося."))


def mock_same_cause(prompt: str) -> SameRootCause:
    texts = re.findall(r"<user_message>\n(.*?)\n</user_message>", prompt, re.S)
    same = len(texts) >= 2 and all(_classify(t)[0] == "lesson-reschedule" for t in texts[:2])
    return SameRootCause(same=same, reason="mock keyword match")


def _embed_one(text: str, dim: int = 64) -> list[float]:
    vec = [0.0] * dim
    for tok in re.findall(r"\w+", text.lower()):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0 if (h >> 8) & 1 else -1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class MockLLM:
    def generate_json(self, prompt: str, schema: type[T]) -> T:
        if schema is TriageDraft:
            return mock_triage(prompt)  # type: ignore[return-value]
        if schema is SameRootCause:
            return mock_same_cause(prompt)  # type: ignore[return-value]
        if schema is ReplyTemplate:
            return mock_template(prompt)  # type: ignore[return-value]
        raise NotImplementedError(f"no mock fixture for {schema.__name__}")

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [_embed_one(t) for t in texts]
