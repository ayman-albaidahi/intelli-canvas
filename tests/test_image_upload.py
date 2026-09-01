import io

from backend.app import create_app


def test_upload_image_returns_metadata_and_session_id():
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/api/images",
        data={"file": (io.BytesIO(b"PNGDATA"), "sample.png")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["image"]["image_id"]
    assert payload["image"]["original_filename"] == "sample.png"
    assert payload["image"]["mime_type"] == "image/png"
    assert payload["image"]["size"] == len(b"PNGDATA")
    assert payload["image"]["format"] == "png"
    assert "stored_filename" not in payload["image"]
    assert "storage" not in str(payload)


def test_missing_file_returns_400():
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/api/images",
        data={},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert response.get_json()["success"] is False
    assert response.get_json()["error"]["code"] == "INVALID_REQUEST"


def test_unsupported_extension_is_rejected():
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/api/images",
        data={"file": (io.BytesIO(b"text"), "document.txt")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert response.get_json()["success"] is False
    assert response.get_json()["error"]["code"] == "INVALID_FILE"


def test_unsafe_filename_is_rejected():
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/api/images",
        data={"file": (io.BytesIO(b"PNGDATA"), "../../escape.png")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_uploads_create_unique_image_ids_and_session_records():
    app = create_app()
    client = app.test_client()

    first = client.post(
        "/api/images",
        data={"file": (io.BytesIO(b"PNGDATA"), "duplicate.png")},
        content_type="multipart/form-data",
    )
    second = client.post(
        "/api/images",
        data={"file": (io.BytesIO(b"PNGDATA"), "duplicate.png")},
        content_type="multipart/form-data",
    )

    assert first.status_code == 200
    assert second.status_code == 200

    first_payload = first.get_json()["image"]
    second_payload = second.get_json()["image"]
    assert first_payload["image_id"] != second_payload["image_id"]

    stored_sessions = app.config["IMAGE_SESSIONS"]
    assert len(stored_sessions) == 2


def test_app_session_state_is_isolated_between_app_instances():
    app1 = create_app()
    app2 = create_app()

    response = app1.test_client().post(
        "/api/images",
        data={"file": (io.BytesIO(b"PNGDATA"), "first.png")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    assert len(app1.config["IMAGE_SESSIONS"]) == 1
    assert len(app2.config["IMAGE_SESSIONS"]) == 0
    assert app1.config["IMAGE_SESSIONS"] is not app2.config["IMAGE_SESSIONS"]
