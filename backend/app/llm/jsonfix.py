"""tolerant json extraction for models without json mode"""
import json
import re
from typing import Any

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S | re.I)
_TRAILING_COMMA = re.compile(r",\s*([}\]])")
_QUOTES = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})


def _balanced_end(text: str, start: int) -> int | None:
    """index after the bracket matching text[start], respecting strings; None if unterminated"""
    stack, in_str, esc = [], False, False
    pairs = {"{": "}", "[": "]"}
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in pairs:
            stack.append(pairs[ch])
        elif ch in "}]":
            if not stack or stack.pop() != ch:
                return None
            if not stack:
                return i + 1
    return None


def _close_truncated(text: str) -> str:
    """append missing closers to a truncated object"""
    stack, in_str, esc = [], False, False
    for ch in text:
        if in_str:
            esc = (ch == "\\") and not esc
            if ch == '"' and not esc:
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]" and stack:
            stack.pop()
    return text + ('"' if in_str else "") + "".join(reversed(stack))


def _repair(chunk: str) -> str:
    chunk = chunk.translate(_QUOTES)
    chunk = _TRAILING_COMMA.sub(r"\1", chunk)
    chunk = re.sub(r"\bTrue\b", "true", chunk)
    chunk = re.sub(r"\bFalse\b", "false", chunk)
    chunk = re.sub(r"\bNone\b", "null", chunk)
    return chunk


def _try_load(chunk: str) -> Any | None:
    for candidate in (chunk, _repair(chunk)):
        try:
            return json.loads(candidate, strict=False)
        except json.JSONDecodeError:
            continue
    return None


def json_candidates(text: str) -> list[Any]:
    """every parseable json object/array in the text, in order of appearance"""
    fenced = _FENCE.findall(text)
    sources = [*fenced, text]
    found: list[Any] = []
    for src in sources:
        for m in re.finditer(r"[{\[]", src):
            end = _balanced_end(src, m.start())
            chunk = src[m.start():end] if end else _close_truncated(src[m.start():])
            value = _try_load(chunk)
            if value is not None:
                found.append(value)
                if end is None:
                    break
        if found:
            break
    return found
