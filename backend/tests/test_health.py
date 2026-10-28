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
    """Asserts that /health returns HTTP 503 and generic message without exposing internal exceptions."""
    mock_db_session.execute.side_effect = Exception("Connection refused to PostgreSQL socket at 172.18.0.2:5432")

    response = client.get("/api/v1/health")
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    data = response.json()
    assert data["status"] == "degraded"
    assert data["services"]["database"] == "unhealthy: connection failed"
    # Ensure sensitive connection details are never leaked
    assert "172.18.0.2" not in str(data)
    assert "socket" not in str(data)


def test_health_check_redis_failure(client, mock_redis_client):
    """Asserts that /health returns HTTP 503 and generic message without exposing Redis internal stack."""
    mock_redis_client.ping.side_effect = Exception("Redis connection timeout to redis://default:secret@10.0.0.1:6379")

    response = client.get("/api/v1/health")
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    data = response.json()
    assert data["status"] == "degraded"
    assert data["services"]["redis"] == "unhealthy: connection failed"
    # Ensure credentials and IPs are never leaked
    assert "secret" not in str(data)
    assert "10.0.0.1" not in str(data)
