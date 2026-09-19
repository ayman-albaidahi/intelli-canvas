from backend.app import create_app


def test_root_editor_assets_resolve_under_editor_v2_base_path():
    app = create_app()
    client = app.test_client()

    page = client.get("/")

    assert page.status_code == 200
    assert b'<base href="/editor-v2/"' in page.data
    assert client.get("/editor-v2/css/tokens.css").status_code == 200
    assert client.get("/editor-v2/js/main.js").status_code == 200
    assert client.get("/editor-v2/js/canvas-manager.js").status_code == 200


def test_export_and_object_manager_include_layer_compositor():
    app = create_app()
    client = app.test_client()

    export_manager = client.get("/editor-v2/js/export-manager.js")
    api_client = client.get("/editor-v2/js/api-client.js")
    object_manager = client.get("/editor-v2/js/object-manager.js")

    assert export_manager.status_code == 200
    assert b"composite_layers" in api_client.data
    assert b"serializeLayers" in object_manager.data
