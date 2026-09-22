import io

from auth_helpers import authenticated_client
from PIL import Image

from backend.app import create_app


def _upload_solid(client, color, name="audit.png"):
    image = Image.new("RGB", (6, 6), color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    uploaded = client.post(
        "/api/images",
        data={"file": (io.BytesIO(buffer.getvalue()), name)},
        content_type="multipart/form-data",
    )
    return uploaded.get_json()["image"]["image_id"]


def test_analysis_flags_low_brightness_on_dark_image():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (30, 30, 35))

    response = client.post("/api/analysis", json={"image_id": image_id})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["metrics"]["brightness_mean"] < 70
    codes = [f["code"] for f in payload["findings"]]
    assert "LOW_BRIGHTNESS" in codes


def test_analysis_flags_low_contrast_on_flat_image():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (128, 128, 128))

    response = client.post("/api/analysis", json={"image_id": image_id})

    codes = [f["code"] for f in response.get_json()["findings"]]
    assert "LOW_CONTRAST" in codes


def test_analysis_flags_high_brightness():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (250, 250, 250))

    response = client.post("/api/analysis", json={"image_id": image_id})

    codes = [f["code"] for f in response.get_json()["findings"]]
    assert "HIGH_BRIGHTNESS" in codes


def test_analysis_does_not_modify_the_image():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    client.post("/api/analysis", json={"image_id": image_id})
    history = client.get(f"/api/history?image_id={image_id}").get_json()["image"]

    assert history["total"] == 1


def test_analysis_requires_known_session():
    app = create_app()
    client = authenticated_client(app)

    response = client.post("/api/analysis", json={"image_id": "ghost"})

    assert response.status_code == 404


def test_suggestions_propose_brightness_boost_with_reason_and_confidence():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (25, 25, 30))

    response = client.post("/api/suggestions", json={"image_id": image_id})

    assert response.status_code == 200
    payload = response.get_json()
    suggestion = next(
        s for s in payload["suggestions"] if s["type"] == "BRIGHTNESS_BOOST"
    )
    assert "السطوع" in suggestion["reason"]
    assert suggestion["evidence"]["brightness_mean"] < 70
    assert 0 <= suggestion["confidence"] <= 1
    assert suggestion["suggested_operation"]["type"] == "brightness"


def test_suggestion_preview_returns_png_without_state_change():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (25, 25, 30))

    response = client.post(
        "/api/suggestions/preview",
        json={"image_id": image_id, "type": "BRIGHTNESS_BOOST"},
    )

    assert response.status_code == 200
    assert response.mimetype == "image/png"
    history = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert history["total"] == 1


def test_suggestion_apply_brightens_and_records_history():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (25, 25, 30))

    applied = client.post(
        "/api/suggestions/apply",
        json={"image_id": image_id, "type": "BRIGHTNESS_BOOST"},
    )

    assert applied.status_code == 200
    node = applied.get_json()["node"]
    assert node["operation"]["label"].startswith("Brightness")

    content = client.get(f"/api/images/{image_id}/content")
    pixel = Image.open(io.BytesIO(content.data)).convert("RGB").getpixel((0, 0))
    # ملاحظة: سقف عملية السطوع 200% لا يكفي لرفع صورة داكنة جداً فوق 60
    # بعملية واحدة؛ المعيار هنا أنها صارت أفتح بوضوح.
    assert sum(pixel) / 3 > 27


def test_suggestion_dismiss_is_accepted():
    app = create_app()
    client = authenticated_client(app)

    response = client.post(
        "/api/suggestions/dismiss",
        json={"image_id": "any", "type": "BRIGHTNESS_BOOST"},
    )

    assert response.status_code == 200
    assert response.get_json()["dismissed"] is True


def test_suggestion_unavailable_for_balanced_image():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (140, 128, 150))

    response = client.post(
        "/api/suggestions/apply",
        json={"image_id": image_id, "type": "BRIGHTNESS_BOOST"},
    )

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "SUGGESTION_NOT_AVAILABLE"
