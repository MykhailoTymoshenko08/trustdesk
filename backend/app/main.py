"""fastapi app"""
import threading
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app import errors
from app.config import get_settings
from app.db import SessionLocal, init_db
from app.models import User
from app.routers import demo, incidents, misc, tickets

api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict:
    return {"ok": True, "llm_mode": get_settings().llm_mode}


for r in (tickets.router, incidents.router, misc.router, demo.router):
    api.include_router(r)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """create tables; seed the demo data on first start"""
    from seed.seed import seed

    init_db()
    with SessionLocal() as db:
        fresh = db.scalar(select(User.id).limit(1)) is None
        if fresh:
            seed(db)
    if fresh:  # classify the seeded inbox without blocking startup
        threading.Thread(target=demo.triage_baseline, args=(SessionLocal,), daemon=True).start()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="TrustDesk", lifespan=lifespan)
    errors.install(app)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.include_router(api)
    return app


app = create_app()
