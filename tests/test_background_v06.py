import io

from auth_helpers import authenticated_client
from PIL import Image

from backend.app import create_app


def _upload_scene(client):
    image = Image.new("RGB", (8, 8), (0, 255, 0))
    for x in range(2, 6):
        for y in range(2, 6):
            image.putpixel((x, y), (255, 0, 0))
    source = io.BytesIO()
    image.save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "scene.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def test_replace_preview_is_non_destructive_and_supports_new_effect_parameters():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_scene(client)
    before = app.config["IMAGE_SESSION_SERVICE"].history(image_id)

    response = client.post(
        "/api/background/replace-preview",
        json={
            "image_id": image_id,
            "key_color": "#00ff00",
            "tolerance": 10,
            "background_color": "#0000ff",
            "background_blur": 4,
            "shadow": True,
            "shadow_opacity": 0.4,
            "shadow_blur": 8,
            "shadow_offset_y": 4,
        },
    )

    assert response.status_code == 200
    assert response.mimetype == "image/png"
    assert app.config["IMAGE_SESSION_SERVICE"].history(image_id) == before
    current = app.config["IMAGE_SESSION_SERVICE"].get_session(image_id)
    assert current["current_storage"] == "uploads"


def test_replace_with_effects_preserves_foreground_and_history_once():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_scene(client)

    response = client.post(
        "/api/background/replace",
        json={
            "image_id": image_id,
            "color": "#00ff00",
            "tolerance": 10,
            "background_color": "#0000ff",
            "background_scale": 1.5,
            "background_x": 2,
            "background_blur": 3,
            "shadow": True,
            "shadow_opacity": 0.3,
            "shadow_blur": 6,
            "shadow_offset_y": 2,
        },
    )

    assert response.status_code == 200
    history = app.config["IMAGE_SESSION_SERVICE"].history(image_id)
    assert history["total"] == 2
    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGBA")
    center = result.getpixel((3, 3))
    assert center[0] > 0
    assert center[2] > 0
    assert result.getpixel((0, 0))[3] == 255


def test_background_effect_parameters_are_validated():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_scene(client)

    response = client.post(
        "/api/background/replace-preview",
        json={
            "image_id": image_id,
            "color": "#00ff00",
            "background_color": "#0000ff",
            "background_blur": 41,
        },
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_MASK_PARAMS"
