import io

import pytest
from PIL import Image

from backend.app import create_app
from backend.app.routes import transform
from backend.app.services.file_service import FileStorageService


@pytest.fixture
def transform_context(tmp_path, monkeypatch):
    app = create_app()
    storage_service = FileStorageService(storage_root=tmp_path / "storage")
    monkeypatch.setattr(
        transform, "FileStorageService", lambda: storage_service
    )

    source = Image.new("RGB", (3, 2))
    source.putdata(
        [
            (255, 0, 0),
            (0, 255, 0),
            (0, 0, 255),
            (255, 255, 0),
            (255, 0, 255),
            (0, 255, 255),
        ]
    )
    source_buffer = io.BytesIO()
    source.save(source_buffer, format="PNG")
    source_buffer.seek(0)
    source_path = storage_service.save_file(source_buffer, "source.png")
    session = app.config["IMAGE_SESSION_SERVICE"].create_session(
        {
            "original_filename": "source.png",
            "stored_filename": source_path.name,
            "format": "png",
            "mime_type": "image/png",
            "size": source_path.stat().st_size,
        }
    )
    return app, storage_service, session, source_path


def post_transform(app, endpoint, image_id, **values):
    return app.test_client().post(
        endpoint,
        json={"image_id": image_id, **values},
    )


def assert_processed_image(storage_service, expected_size):
    files = list(storage_service.processed_dir.iterdir())
    assert len(files) == 1
    with Image.open(files[0]) as result:
        assert result.size == expected_size
        result.verify()


def read_pixels(path):
    with Image.open(path) as image:
        image = image.convert("RGB")
        return [
            image.getpixel((x, y))
            for y in range(image.height)
            for x in range(image.width)
        ]


@pytest.mark.parametrize("angle", [90, -90])
def test_rotate_ninety_degrees_swaps_dimensions(transform_context, angle):
    app, storage_service, session, source_path = transform_context
    original_bytes = source_path.read_bytes()

    response = post_transform(
        app, "/api/transform/rotate", session["image_id"], angle=angle
    )

    assert response.status_code == 200
    assert response.get_json()["image"]["width"] == 2
    assert response.get_json()["image"]["height"] == 3
    assert source_path.read_bytes() == original_bytes
    assert_processed_image(storage_service, (2, 3))
    expected_pixels = (
        [(255, 255, 0), (255, 0, 0), (255, 0, 255), (0, 255, 0),
         (0, 255, 255), (0, 0, 255)]
        if angle == 90
        else [(0, 0, 255), (0, 255, 255), (0, 255, 0), (255, 0, 255),
              (255, 0, 0), (255, 255, 0)]
    )
    assert (
        read_pixels(next(storage_service.processed_dir.iterdir()))
        == expected_pixels
    )


def test_rotate_180_degrees_preserves_dimensions(transform_context):
    app, storage_service, session, _ = transform_context

    response = post_transform(
        app, "/api/transform/rotate", session["image_id"], angle=180
    )

    assert response.status_code == 200
    result = response.get_json()["image"]
    assert (result["width"], result["height"]) == (3, 2)
    assert_processed_image(storage_service, (3, 2))
    assert read_pixels(next(storage_service.processed_dir.iterdir())) == [
        (0, 255, 255), (255, 0, 255), (255, 255, 0),
        (0, 0, 255), (0, 255, 0), (255, 0, 0),
    ]


@pytest.mark.parametrize("direction", ["horizontal", "vertical"])
def test_flip_preserves_dimensions_and_creates_valid_output(
    transform_context, direction
):
    app, storage_service, session, source_path = transform_context
    original_bytes = source_path.read_bytes()

    response = post_transform(
        app, "/api/transform/flip", session["image_id"], direction=direction
    )

    assert response.status_code == 200
    result = response.get_json()["image"]
    assert (result["width"], result["height"]) == (3, 2)
    assert source_path.read_bytes() == original_bytes
    assert_processed_image(storage_service, (3, 2))
    expected_pixels = (
        [(0, 0, 255), (0, 255, 0), (255, 0, 0), (0, 255, 255),
         (255, 0, 255), (255, 255, 0)]
        if direction == "horizontal"
        else [(255, 255, 0), (255, 0, 255), (0, 255, 255), (255, 0, 0),
              (0, 255, 0), (0, 0, 255)]
    )
    assert (
        read_pixels(next(storage_service.processed_dir.iterdir()))
        == expected_pixels
    )


def test_invalid_rotation_angle_is_rejected(transform_context):
    app, _, session, _ = transform_context

    response = post_transform(
        app, "/api/transform/rotate", session["image_id"], angle=45
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_ROTATION"


def test_invalid_flip_direction_is_rejected(transform_context):
    app, _, session, _ = transform_context

    response = post_transform(
        app, "/api/transform/flip", session["image_id"], direction="diagonal"
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FLIP_DIRECTION"


@pytest.mark.parametrize("endpoint, values", [
    ("/api/transform/rotate", {"angle": 90}),
    ("/api/transform/flip", {"direction": "horizontal"}),
])
def test_invalid_transform_payload_is_rejected(
    transform_context, endpoint, values
):
    app, _, _, _ = transform_context

    response = post_transform(app, endpoint, "", **values)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_IMAGE_ID"


def test_nonexistent_session_is_rejected(transform_context):
    app, _, _, _ = transform_context

    rotate_response = post_transform(
        app, "/api/transform/rotate", "missing", angle=90
    )
    flip_response = post_transform(
        app, "/api/transform/flip", "missing", direction="horizontal"
    )

    assert rotate_response.status_code == 404
    assert flip_response.status_code == 404
    assert (
        rotate_response.get_json()["error"]["code"]
        == "IMAGE_SESSION_NOT_FOUND"
    )
    assert (
        flip_response.get_json()["error"]["code"]
        == "IMAGE_SESSION_NOT_FOUND"
    )


def test_corrupted_source_image_is_rejected(transform_context):
    app, _, session, source_path = transform_context
    source_path.write_bytes(b"not an image")

    response = post_transform(
        app, "/api/transform/rotate", session["image_id"], angle=90
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "ROTATE_FAILED"


def test_transform_response_does_not_expose_storage_details(transform_context):
    app, storage_service, session, _ = transform_context

    response = post_transform(
        app, "/api/transform/flip", session["image_id"], direction="horizontal"
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert "stored_filename" not in payload["image"]
    assert "path" not in str(payload).lower()
    assert str(storage_service.storage_root) not in str(payload)
