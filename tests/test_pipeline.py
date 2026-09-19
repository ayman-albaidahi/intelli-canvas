import io

from PIL import Image

from backend.app import create_app


def _image(client):
    source = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "pipeline.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def test_pipeline_get_put_and_node_crud():
    app = create_app()
    client = app.test_client()
    image_id = _image(client)

    empty = client.get(f"/api/pipeline?image_id={image_id}")
    assert empty.status_code == 200
    assert empty.get_json()["pipeline"]["nodes"] == []

    added = client.post(
        "/api/pipeline/nodes",
        json={
            "image_id": image_id,
            "operation": "brightness",
            "parameters": {"value": 120},
        },
    )
    assert added.status_code == 200
    pipeline = added.get_json()["pipeline"]
    node_id = pipeline["nodes"][0]["id"]
    assert pipeline["nodes"][0]["parameters"] == {"value": 120}
    assert pipeline["version"] == 2

    patched = client.patch(
        f"/api/pipeline/nodes/{node_id}",
        json={"image_id": image_id, "parameters": {"value": 140}},
    )
    assert patched.status_code == 200
    assert patched.get_json()["pipeline"]["nodes"][0]["parameters"] == {"value": 140}

    toggled = client.post(
        f"/api/pipeline/nodes/{node_id}/toggle", json={"image_id": image_id}
    )
    assert toggled.get_json()["pipeline"]["nodes"][0]["enabled"] is False

    put = client.put(
        "/api/pipeline",
        json={
            "image_id": image_id,
            "version": 9,
            "nodes": [
                {
                    "id": "a",
                    "operation": "grayscale",
                    "parameters": {},
                    "enabled": True,
                },
                {
                    "id": "b",
                    "operation": "blur",
                    "parameters": {"value": 3},
                    "enabled": True,
                },
            ],
        },
    )
    assert put.status_code == 200
    assert [node["id"] for node in put.get_json()["pipeline"]["nodes"]] == ["a", "b"]

    reordered = client.post(
        "/api/pipeline/reorder", json={"image_id": image_id, "node_id": "b", "order": 0}
    )
    assert [node["id"] for node in reordered.get_json()["pipeline"]["nodes"]] == [
        "b",
        "a",
    ]

    deleted = client.delete("/api/pipeline/nodes/a", json={"image_id": image_id})
    assert deleted.status_code == 200
    assert [node["id"] for node in deleted.get_json()["pipeline"]["nodes"]] == ["b"]


def test_pipeline_accepts_smart_crop_and_rejects_duplicate_ids_and_bad_enabled():
    app = create_app()
    client = app.test_client()
    image_id = _image(client)

    smart_crop = client.put(
        "/api/pipeline",
        json={
            "image_id": image_id,
            "nodes": [
                {
                    "id": "x",
                    "operation": "smart-crop",
                    "parameters": {"aspect_ratio": "1:1"},
                }
            ],
        },
    )
    assert smart_crop.status_code == 200

    invalid_crop = client.put(
        "/api/pipeline",
        json={
            "image_id": image_id,
            "nodes": [
                {
                    "id": "crop",
                    "operation": "smart-crop",
                    "parameters": {"aspect_ratio": "bad"},
                }
            ],
        },
    )
    assert invalid_crop.status_code == 400
    assert invalid_crop.get_json()["error"]["code"] == "INVALID_PIPELINE"

    duplicate = client.put(
        "/api/pipeline",
        json={
            "image_id": image_id,
            "nodes": [
                {"id": "x", "operation": "grayscale"},
                {"id": "x", "operation": "negative"},
            ],
        },
    )
    assert duplicate.status_code == 400

    bad_enabled = client.post(
        "/api/pipeline/nodes",
        json={"image_id": image_id, "operation": "grayscale", "enabled": "yes"},
    )
    assert bad_enabled.status_code == 400


def test_pipeline_is_session_scoped():
    app = create_app()
    client = app.test_client()
    image_id = _image(client)
    response = client.get("/api/pipeline?image_id=missing")
    assert response.status_code == 404
    created = client.post(
        "/api/pipeline/nodes", json={"image_id": image_id, "operation": "negative"}
    )
    assert created.status_code == 200
    assert (
        client.get(f"/api/pipeline?image_id={image_id}").get_json()["pipeline"][
            "nodes"
        ][0]["operation"]
        == "negative"
    )
