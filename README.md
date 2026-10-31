# TrustDesk

An AI support agent you can actually trust: groups tickets into incidents, calculates the cost of a bug,
warns silent affected users and resolves everything with one audited bulk action.

See `docs/PLAN.md` for the plan and API contract.

## Backend quick start

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example .env        # LLM_MODE=mock works without a key
python -m seed.seed            # builds app.db
uvicorn app.main:app --reload  # http://localhost:8000/api/health
pytest
```

License: MIT
