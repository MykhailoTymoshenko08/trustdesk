"""fastapi app"""
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict:
    return {"ok": True, "llm_mode": get_settings().llm_mode}


def create_app() -> FastAPI:
    app = FastAPI(title="TrustDesk")
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )
    app.include_router(api)
    return app


app = create_app()
