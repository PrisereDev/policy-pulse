"""
Shared pytest fixtures for backend tests.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

# Register models on Base before create_all
from app.models import user, analysis_job, analysis_result  # noqa: F401


@pytest.fixture
def sqlite_engine():
    """In-memory SQLite for isolated tests (no PostgreSQL required)."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture
def db_session(sqlite_engine):
    session = sessionmaker(bind=sqlite_engine)()
    yield session
    session.close()


@pytest.fixture
def client(db_session):
    """FastAPI TestClient with DB dependency pointing at the test session."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    from fastapi.testclient import TestClient

    yield TestClient(app)
    app.dependency_overrides.clear()
