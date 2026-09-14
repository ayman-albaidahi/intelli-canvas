import io
import time

from PIL import Image

from backend.app import create_app


def test_cached_pipeline_execution_avoids_render_and_stays_fast(monkeypatch):
    app = create_app()
    storage = app.config["FILE_STORAGE_SERVICE"]
    for cache_file in storage.processed_dir.glob("pipeline-cache-*.png"):
        cache_file.unlink()
    client = app.test_client()
    source = io.BytesIO()
    Image.new("RGB", (256, 256), (80, 120, 160)).save(source, format="PNG")
    source.seek(0)
    image_id = client.post("/api/images", data={"file": (source, "performance.png")}, content_type="multipart/form-data").get_json()["image"]["image_id"]
    pipeline = [{"id": "brightness", "operation": "brightness", "parameters": {"value": 120}, "enabled": True}]

    first_start = time.perf_counter()
    first = client.post("/api/pipeline/apply", json={"image_id": image_id, "nodes": pipeline})
    first_duration = time.perf_counter() - first_start
    assert first.status_code == 200
    assert first_duration < 5.0

    def fail_render(*args, **kwargs):
        raise AssertionError("cached execution should not render the pipeline")

    from backend.app.services import pipeline_execution_service
    monkeypatch.setattr(pipeline_execution_service.PipelineExecutionService, "_render", staticmethod(fail_render))
    cached_start = time.perf_counter()
    cached = client.post("/api/pipeline/apply", json={"image_id": image_id, "nodes": pipeline})
    cached_duration = time.perf_counter() - cached_start

    assert cached.status_code == 200
    assert cached.get_json()["image"]["cache_hit"] is True
    assert cached_duration < 1.5
