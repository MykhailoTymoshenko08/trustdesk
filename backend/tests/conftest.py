import os

os.environ["LLM_MODE"] = "mock"
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base


@pytest.fixture
def db():
    """fresh in-memory db per test"""
    from app import models  # noqa: F401

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        yield session


@pytest.fixture
def features(monkeypatch):
    """tiny docs fixture so tests do not depend on docs/features"""
    from pathlib import Path

    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "features_dir", Path(__file__).parent / "fixtures" / "features")


@pytest.fixture
def no_features(monkeypatch, tmp_path):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "features_dir", tmp_path / "missing")


@pytest.fixture(autouse=True)
def reset_llm():
    from app.llm import set_llm

    set_llm(None)
    yield
    set_llm(None)
