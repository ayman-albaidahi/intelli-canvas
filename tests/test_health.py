from backend.app import create_app


def test_create_app_builds_and_health_endpoint_is_ok():
    app = create_app()
    client = app.test_client()

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {
        "success": True,
        "message": "IntelliCanvas API is running",
    }
