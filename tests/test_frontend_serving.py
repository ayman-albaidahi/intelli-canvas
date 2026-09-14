from backend.app import create_app


def test_root_editor_assets_resolve_under_editor_v2_base_path():
    app = create_app()
    client = app.test_client()

    page = client.get("/")

    assert page.status_code == 200
    assert b'<base href="/editor-v2/"' in page.data
    assert client.get("/editor-v2/css/tokens.css").status_code == 200
    assert client.get("/editor-v2/js/main.js").status_code == 200
    assert client.get("/editor-v2/js/error-collector.js").status_code == 200
