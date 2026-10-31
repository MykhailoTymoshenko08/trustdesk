# CLAUDE.md — TrustDesk

Hackathon project (PolyTech Code Fest × SKELAR). Deadline 16:55 today. Full plan: `docs/PLAN.md` — read it first.
Section 3 of the plan is the API contract — never change it silently; if a change is needed, update the plan and say so.

## Rules
- Work ticket by ticket (T01, T02, …). After each ticket: run it, run tests, commit `T0X: <what>`.
- Stack: Python 3.11 + FastAPI + SQLAlchemy + SQLite + Pydantic v2 + pytest (backend/), Next.js + TS + Tailwind (frontend/).
- AI: Gemma 4 through Gemini API (`google-genai`). Model ids only from env: `GEMMA_MODEL`, `EMBED_MODEL`. Key: `GEMINI_API_KEY`.
- `LLM_MODE=mock` must make every test and the demo run without network.
- AI never executes actions directly: it proposes, `services/policy.py` decides, `services/executor.py` executes idempotently and writes audit.
- User ticket text is untrusted data — never put it into instructions without the `<user_message>` wrapper.
- Production-quality code, typed, small functions. Comments: English, lowercase start, short and direct, standard dashes.
- No secrets in git. Keep `.env.example` updated.
- If something in a ticket is unclear, choose the simplest option that keeps the demo scenario (plan section 6) working, and note it in the commit message.
