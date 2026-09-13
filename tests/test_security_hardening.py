import io

from PIL import Image

from backend.app import create_app


def _png_bytes(color=(200, 100, 50), size=(4, 4)):
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(client, content=None, filename="audit.png"):
    content = content if content is not None else _png_bytes()
    response = client.post(
        "/api/images",
        data={"file": (io.BytesIO(content), filename)},
        content_type="multipart/form-data",
    )
    return response


def test_upload_rejects_spoofed_mime_with_text_payload():
    app = create_app()
    client = app.test_client()

    response = _upload(client, content=b"this is definitely not an image payload")

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE"


def test_upload_accepts_real_image_content_with_any_supported_extension():
    app = create_app()
    client = app.test_client()

    response = _upload(client, filename="renamed.jpg")

    assert response.status_code == 200


def test_security_headers_are_present():
    app = create_app()
    client = app.test_client()

    response = client.get("/api/health")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


def test_root_serves_the_editor():
    app = create_app()
    client = app.test_client()

    response = client.get("/")

    assert response.status_code == 200
    assert b"editor-v2" in response.data or b"IntelliCanvas" in response.data


def test_export_rejects_dimension_bomb():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client).get_json()["image"]["image_id"]

    response = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "png", "width": 20000, "height": 20000},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_DIMENSIONS"


def test_export_rejects_megapixel_overflow():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client).get_json()["image"]["image_id"]

    response = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "png", "width": 8000, "height": 7999},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_DIMENSIONS"


def test_export_accepts_reasonable_dimensions():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client).get_json()["image"]["image_id"]

    response = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "png", "width": 4000, "height": 2000},
    )

    assert response.status_code == 200


def test_upload_rejects_header_dimension_bomb():
    app = create_app()
    client = app.test_client()
    real = _png_bytes()
    forged = real[:16] + (16000).to_bytes(4, "big") + (16000).to_bytes(4, "big") + real[24:]

    response = _upload(client, content=forged, filename="bomb.png")

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE"


def test_upload_rejects_truncated_image():
    app = create_app()
    client = app.test_client()
    real = _png_bytes()

    response = _upload(client, content=real[: len(real) // 2], filename="truncated.png")

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE"
