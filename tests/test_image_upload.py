import io

from PIL import Image

from backend.app import create_app


def _png_bytes():
    image = Image.new("RGB", (4, 4), (120, 60, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(client, content, filename, content_type="image/png", part_type="image/png"):
    return client.post(
        "/api/images",
        data={"file": (io.BytesIO(content), filename, part_type)},
        content_type="multipart/form-data",
    )


def test_upload_image_returns_metadata_and_session_id():
    app = create_app()
    client = app.test_client()
    content = _png_bytes()

    response = _upload(client, content, "sample.png")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["image"]["image_id"]
    assert payload["image"]["original_filename"] == "sample.png"
    assert payload["image"]["mime_type"] == "image/png"
    assert payload["image"]["size"] == len(content)
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

    response = _upload(client, _png_bytes(), "document.txt")

    assert response.status_code == 400
    assert response.get_json()["success"] is False
    assert response.get_json()["error"]["code"] == "INVALID_FILE"


def test_non_image_content_with_image_extension_is_rejected():
    app = create_app()
    client = app.test_client()

    response = _upload(client, b"definitely not an image payload", "innocent.png")

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE"


def test_unsafe_file_path_is_rejected():
    app = create_app()
    client = app.test_client()

    response = _upload(client, _png_bytes(), "../../escape.png")

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE"


def test_uploads_create_unique_image_ids_and_session_records():
    app = create_app()
    client = app.test_client()

    first = _upload(client, _png_bytes(), "duplicate.png")
    second = _upload(client, _png_bytes(), "duplicate.png")

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
        data={"file": (io.BytesIO(_png_bytes()), "first.png")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    assert len(app1.config["IMAGE_SESSIONS"]) == 1
    assert len(app2.config["IMAGE_SESSIONS"]) == 0
    assert app1.config["IMAGE_SESSIONS"] is not app2.config["IMAGE_SESSIONS"]
