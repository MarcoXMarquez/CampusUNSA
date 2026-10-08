import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import get_db
from app.core.redis import get_redis


@pytest.fixture
def mock_db_session():
    """Provides a mocked SQLAlchemy database session that simulates successful queries."""
    session = MagicMock()
    # Mock execute result
    session.execute.return_value = MagicMock()
    return session


@pytest.fixture
def mock_redis_client():
    """Provides a mocked Redis client that responds to ping."""
    client = MagicMock()
    client.ping.return_value = True
    return client


@pytest.fixture
def client(mock_db_session, mock_redis_client):
    """
    TestClient with dependency overrides for database and Redis.
    Ensures tests can run in isolation without requiring live database network sockets.
    """
    app.dependency_overrides[get_db] = lambda: mock_db_session
    app.dependency_overrides[get_redis] = lambda: mock_redis_client

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
