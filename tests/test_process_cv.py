import io

import pytest
from PIL import Image

from backend.app import create_app


def _upload_png(client, pixels=None, size=(9, 9), name="cv-source.png"):
    image = Image.new("RGB", size)
    if pixels is not None:
        image.putdata(pixels)
    source = io.BytesIO()
    image.save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, name)},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    return response.get_json()["image"]["image_id"]


def _edge_pixels(size=(9, 9)):
    return [
        (255, 255, 255) if x >= size[0] // 2 else (0, 0, 0)
        for _y in range(size[1])
        for x in range(size[0])
    ]


def test_histogram_returns_rgb_bins_without_mutating_the_session():
    app = create_app()
    client = app.test_client()
    image_id = _upload_png(client, pixels=[(255, 0, 10), (0, 20, 30)], size=(2, 1))
    before = app.config["IMAGE_SESSION_SERVICE"].get_session(image_id)

    response = client.post("/api/process/histogram", json={"image_id": image_id})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert "image" not in payload
    assert set(payload["histogram"]) == {"r", "g", "b"}
    assert all(len(bins) == 256 for bins in payload["histogram"].values())
    assert payload["histogram"]["r"][0] == 1
    assert payload["histogram"]["r"][255] == 1
    assert payload["histogram"]["g"][0] == 1
    assert payload["histogram"]["g"][20] == 1
    after = app.config["IMAGE_SESSION_SERVICE"].get_session(image_id)
    assert after["current_filename"] == before["current_filename"]


@pytest.mark.parametrize(
    "endpoint,payload,operation",
    [
        ("sobel", {"ksize": 3}, "sobel"),
        ("laplacian", {}, "laplacian"),
        ("median-filter", {"ksize": 3}, "median-filter"),
        ("morphology", {"operation": "erode", "ksize": 3}, "morphology"),
        ("gamma", {"value": 1.5}, "gamma"),
        ("threshold", {"value": 128}, "threshold"),
    ],
)
def test_cv_transform_endpoints_process_the_current_image(endpoint, payload, operation):
    client = create_app().test_client()
    image_id = _upload_png(client, pixels=_edge_pixels())

    response = client.post(f"/api/process/{endpoint}", json={"image_id": image_id, **payload})

    assert response.status_code == 200
    result = response.get_json()["image"]
    assert result["operation"] == operation
    assert result["format"] == "png"
    assert result["width"] == 9
    assert result["height"] == 9
    assert "path" not in result
    content = client.get(f"/api/images/{image_id}/content")
    assert content.status_code == 200
    assert Image.open(io.BytesIO(content.data)).convert("RGB").size == (9, 9)


def test_sobel_returns_visible_edges_as_rgb():
    client = create_app().test_client()
    image_id = _upload_png(client, pixels=_edge_pixels())

    assert client.post("/api/process/sobel", json={"image_id": image_id}).status_code == 200

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    pixels = result.get_flattened_data()
    assert max(pixel[0] for pixel in pixels) > 0
    assert all(pixel[0] == pixel[1] == pixel[2] for pixel in pixels)


@pytest.mark.parametrize(
    "endpoint,payload,code",
    [
        ("histogram", {}, "INVALID_IMAGE_ID"),
        ("sobel", {"ksize": 2}, "INVALID_SOBEL_KSIZE"),
        ("laplacian", {}, "INVALID_IMAGE_ID"),
        ("median-filter", {"ksize": 4}, "INVALID_MEDIAN_KSIZE"),
        ("morphology", {"operation": "gradient"}, "INVALID_MORPHOLOGY_OPERATION"),
        ("morphology", {"operation": "erode", "ksize": 16}, "INVALID_MORPHOLOGY_KSIZE"),
        ("gamma", {"value": 0.05}, "INVALID_GAMMA"),
        ("threshold", {"value": 256}, "INVALID_THRESHOLD"),
    ],
)
def test_cv_endpoints_reject_invalid_parameters(endpoint, payload, code):
    client = create_app().test_client()
    request_payload = {"image_id": "placeholder", **payload} if endpoint not in {"histogram", "laplacian"} else payload
    if "image_id" in request_payload:
        request_payload["image_id"] = _upload_png(client)

    response = client.post(f"/api/process/{endpoint}", json=request_payload)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == code


@pytest.mark.parametrize(
    "endpoint,payload",
    [
        ("histogram", {}),
        ("sobel", {"ksize": 3}),
        ("laplacian", {}),
        ("median-filter", {"ksize": 3}),
        ("morphology", {"operation": "open", "ksize": 3}),
        ("gamma", {"value": 1.2}),
        ("threshold", {"value": 128}),
    ],
)
def test_cv_endpoints_reject_unknown_sessions(endpoint, payload):
    client = create_app().test_client()

    response = client.post(
        f"/api/process/{endpoint}", json={"image_id": "missing", **payload}
    )

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_SESSION_NOT_FOUND"
