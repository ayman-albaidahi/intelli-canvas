import io

from PIL import Image

from backend.app import create_app


def _image(client):
    source = io.BytesIO()
    Image.new("RGB", (8, 8), (40, 40, 40)).save(source, format="PNG")
    source.seek(0)
    response = client.post("/api/images", data={"file": (source, "pipeline-run.png")}, content_type="multipart/form-data")
    return response.get_json()["image"]["image_id"]


def _pipeline(client, image_id):
    response = client.put("/api/pipeline", json={"image_id": image_id, "version": 2, "nodes": [{"id": "brightness", "operation": "brightness", "parameters": {"value": 150}, "enabled": True}, {"id": "disabled", "operation": "negative", "parameters": {}, "enabled": False}]})
    assert response.status_code == 200


def test_pipeline_preview_is_read_only_and_uses_fixed_source():
    app = create_app()
    client = app.test_client()
    image_id = _image(client)
    _pipeline(client, image_id)
    history_before = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    current_before = client.get(f"/api/images/{image_id}/content").data

    preview = client.post("/api/pipeline/preview", json={"image_id": image_id})

    assert preview.status_code == 200
    assert preview.mimetype == "image/png"
    assert Image.open(io.BytesIO(preview.data)).size == (8, 8)
    assert client.get(f"/api/history?image_id={image_id}").get_json()["image"] == history_before
    assert client.get(f"/api/images/{image_id}/content").data == current_before


def test_pipeline_apply_records_one_history_entry_and_hits_cache():
    app = create_app()
    client = app.test_client()
    for cache_file in app.config["FILE_STORAGE_SERVICE"].processed_dir.glob("pipeline-cache-*.png"):
        cache_file.unlink()
    image_id = _image(client)
    _pipeline(client, image_id)
    before = client.get(f"/api/history?image_id={image_id}").get_json()["image"]

    first = client.post("/api/pipeline/apply", json={"image_id": image_id})
    assert first.status_code == 200
    first_image = first.get_json()["image"]
    assert first_image["cache_hit"] is False
    assert first_image["source_history_index"] == 0
    after_first = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert after_first["total"] == before["total"] + 1
    assert after_first["entries"][-1]["operation"] == "Apply pipeline"
    assert after_first["entries"][-1]["parameters"]["pipeline_hash"] == first_image["pipeline_hash"]

    second = client.post("/api/pipeline/apply", json={"image_id": image_id})
    assert second.status_code == 200
    assert second.get_json()["image"]["cache_hit"] is True
    after_second = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert after_second["total"] == after_first["total"] + 1
    assert after_second["entries"][-1]["parameters"]["source_history_index"] == 0


def test_pipeline_apply_can_use_explicit_nodes_without_persisting_definition():
    app = create_app()
    client = app.test_client()
    image_id = _image(client)
    response = client.post("/api/pipeline/apply", json={"image_id": image_id, "nodes": [{"id": "negative", "operation": "negative", "parameters": {}, "enabled": True}]})
    assert response.status_code == 200
    saved = client.get(f"/api/pipeline?image_id={image_id}").get_json()["pipeline"]
    assert saved["nodes"] == []
    assert client.get(f"/api/history?image_id={image_id}").get_json()["image"]["total"] == 2
