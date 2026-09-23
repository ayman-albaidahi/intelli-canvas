from backend.app import create_app


def test_root_serves_landing_page_and_editor_has_stable_entry_point():
    app = create_app()
    client = app.test_client()

    page = client.get("/")

    assert page.status_code == 200
    assert b"IntelliCanvas" in page.data
    assert b'href="/editor"' in page.data
    editor = client.get("/editor")
    assert editor.status_code == 200
    assert b'<base href="/editor-v2/"' in editor.data
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
