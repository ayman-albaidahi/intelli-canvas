from pathlib import Path

from flask import Flask, request, send_from_directory

from .config import Config
from .routes import (
    analysis_bp,
    background_bp,
    health_bp,
    history_bp,
    images_bp,
    layers_bp,
    pipeline_bp,
    process_bp,
    transform_bp,
)
from .services.image_session_service import ImageSessionService


FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


def create_app() -> Flask:
    """Application factory for the IntelliCanvas backend."""
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
    app.config.from_object(Config)
    # Editor assets change between commits while a tab stays open; never let
    # the browser reuse cached HTML/CSS/JS in this development stage.
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    app.config["JSON_SORT_KEYS"] = False
    app.config["IMAGE_SESSIONS"] = {}
    app.config["IMAGE_SESSION_SERVICE"] = ImageSessionService(app.config["IMAGE_SESSIONS"])

    app.register_blueprint(health_bp)
    app.register_blueprint(images_bp)
    app.register_blueprint(transform_bp)
    app.register_blueprint(process_bp)
    app.register_blueprint(background_bp)
    app.register_blueprint(layers_bp)
    app.register_blueprint(history_bp)
    app.register_blueprint(pipeline_bp)
    app.register_blueprint(analysis_bp)

    @app.after_request
    def add_dev_cors_headers(response):
        origin = request.headers.get("Origin", "")
        allowed_origins = {"http://localhost:5500", "http://127.0.0.1:5500"}
        response.headers.setdefault("Access-Control-Allow-Origin", origin if origin in allowed_origins else "http://localhost:5500")
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        return response

    @app.get("/")
    def frontend_index():
        return app.send_static_file("index.html")

    @app.get("/editor-v2/")
    def editor_v2_index():
        return send_from_directory(FRONTEND_DIR / "editor-v2", "index.html")

    return app
