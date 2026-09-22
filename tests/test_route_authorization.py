import base64
import io

from auth_helpers import authenticated_client
from PIL import Image

from backend.app import create_app


def _png_bytes():
    image = Image.new("RGB", (4, 4), (120, 60, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(client):
    response = client.post(
        "/api/images",
        data={"file": (io.BytesIO(_png_bytes()), "authorization.png", "image/png")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    return response.get_json()["image"]["image_id"]


def test_anonymous_image_route_is_rejected_before_resource_lookup():
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/api/transform/rotate",
        json={"image_id": "does-not-matter", "angle": 90},
    )

    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"


def test_second_user_cannot_read_or_mutate_image_scoped_routes():
    app = create_app()
    owner = authenticated_client(app, "route-owner@example.com")
    other = authenticated_client(app, "route-other@example.com")
    image_id = _upload(owner)
    data_url = "data:image/png;base64," + base64.b64encode(_png_bytes()).decode()
    layers = owner.put(
        "/api/layers",
        json={
            "image_id": image_id,
            "layers": [{"id": "asset-layer", "type": "image", "src": data_url}],
        },
    )
    assert layers.status_code == 200
    asset_id = layers.get_json()["layers"][0]["asset_id"]

    requests = [
        ("get", f"/api/images/{image_id}/content", {}),
        ("post", "/api/images/convert", {"image_id": image_id, "format": "png"}),
        ("post", "/api/images/export", {"image_id": image_id, "format": "png"}),
        ("get", "/api/layers", {"image_id": image_id}),
        ("post", "/api/layers/compose", {"image_id": image_id}),
        ("put", "/api/layers", {"image_id": image_id, "layers": []}),
        ("get", "/api/pipeline", {"image_id": image_id}),
        ("post", "/api/pipeline/preview", {"image_id": image_id}),
        ("post", "/api/history/undo", {"image_id": image_id}),
        ("get", "/api/history/current-file", {"image_id": image_id}),
        ("post", "/api/process/brightness", {"image_id": image_id, "value": 110}),
        ("post", "/api/process/histogram", {"image_id": image_id}),
        ("post", "/api/analysis", {"image_id": image_id}),
        ("post", "/api/suggestions", {"image_id": image_id}),
        ("post", "/api/background/remove", {"image_id": image_id}),
    ]

    for method, path, payload in requests:
        if method == "get":
            response = other.get(path, query_string=payload)
        else:
            response = getattr(other, method)(path, json=payload)
        assert response.status_code == 404, (
            method,
            path,
            response.get_data(as_text=True),
        )
        assert response.get_json()["error"]["code"] == "RESOURCE_NOT_FOUND"

    asset = other.get(
        f"/api/layers/assets/{asset_id}", query_string={"image_id": image_id}
    )
    assert asset.status_code == 404
    assert asset.get_json()["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_unknown_image_keeps_the_existing_not_found_contract():
    app = create_app()
    client = authenticated_client(app, "unknown-image@example.com")

    response = client.post(
        "/api/transform/rotate",
        json={"image_id": "missing-image", "angle": 90},
    )

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_SESSION_NOT_FOUND"
