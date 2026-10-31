"""env settings"""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    gemini_api_key: str = ""
    gemma_model: str = ""
    embed_model: str = ""
    llm_mode: Literal["live", "mock"] = "mock"
    llm_timeout_s: float = 60.0
    database_url: str = f"sqlite:///{BACKEND_DIR / 'app.db'}"
    features_dir: Path = BACKEND_DIR.parent / "docs" / "features"
    policies_path: Path = BACKEND_DIR / "policies.yaml"
    triage_confidence_threshold: float = 0.6


@lru_cache
def get_settings() -> Settings:
    return Settings()
