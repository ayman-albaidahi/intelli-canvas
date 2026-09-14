import pytest

from backend.app.config import Config


@pytest.fixture(autouse=True)
def use_in_memory_database(monkeypatch):
    monkeypatch.setattr(Config, "DATABASE_PATH", ":memory:")
