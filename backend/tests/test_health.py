from fastapi import status


def test_root_endpoint(client):
    """Asserts that root discovery endpoint returns project metadata and documentation links."""
    response = client.get("/")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "project" in data
    assert "docs_url" in data
    assert "health_url" in data


def test_health_check_healthy(client):
    """Asserts that /health returns HTTP 200 and healthy status when all services respond."""
    response = client.get("/api/v1/health")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "healthy"
    assert data["services"]["database"] == "healthy"
    assert data["services"]["redis"] == "healthy"
    assert data["version"] == "1.0.0"


def test_health_check_database_failure(client, mock_db_session):
    """Asserts that /health returns HTTP 503 when the database fails to execute query."""
    mock_db_session.execute.side_effect = Exception("Connection refused to PostgreSQL socket")

    response = client.get("/api/v1/health")
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    data = response.json()
    assert data["status"] == "degraded"
    assert "unhealthy" in data["services"]["database"]


def test_health_check_redis_failure(client, mock_redis_client):
    """Asserts that /health returns HTTP 503 when Redis fails to respond to ping."""
    mock_redis_client.ping.side_effect = Exception("Redis connection timeout")

    response = client.get("/api/v1/health")
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    data = response.json()
    assert data["status"] == "degraded"
    assert "unhealthy" in data["services"]["redis"]
