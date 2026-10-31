"""fastapi app"""
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import errors
from app.config import get_settings
from app.db import init_db
from app.routers import tickets

api = APIRouter(prefix="/api")
api.include_router(tickets.router)


@api.get("/health")
def health() -> dict:
    return {"ok": True, "llm_mode": get_settings().llm_mode}


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="TrustDesk")
    errors.install(app)
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )
    app.include_router(api)
    return app


app = create_app()
