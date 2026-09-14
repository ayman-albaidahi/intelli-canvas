from backend.app import create_app


def _metadata():
    return {
        "original_filename": "persistent.png",
        "stored_filename": "persistent.png",
        "format": "png",
        "mime_type": "image/png",
        "size": 123,
    }


def test_sessions_history_and_layers_survive_app_restart(tmp_path):
    database_path = tmp_path / "intellicanvas.sqlite3"
    app_one = create_app(str(database_path))
    service_one = app_one.config["IMAGE_SESSION_SERVICE"]
    session = service_one.create_session(_metadata())
    image_id = session["image_id"]
    service_one.save_layers(image_id, [{"id": "o1", "type": "shape", "name": "Saved"}])
    service_one.update_current_image(image_id, "processed.png", operation="Resize 2x2")

    app_two = create_app(str(database_path))
    service_two = app_two.config["IMAGE_SESSION_SERVICE"]
    restored = service_two.get_session(image_id)

    assert restored is not None
    assert restored["current_filename"] == "processed.png"
    assert restored["history_index"] == 1
    assert restored["history"][1]["operation"] == "Resize 2x2"
    assert restored["layers"] == [{"id": "o1", "type": "shape", "name": "Saved"}]


def test_database_path_is_created_and_schema_is_initialized(tmp_path):
    database_path = tmp_path / "nested" / "runtime.sqlite3"
    app = create_app(str(database_path))

    assert database_path.exists()
    assert len(app.config["IMAGE_SESSIONS"]) == 0
