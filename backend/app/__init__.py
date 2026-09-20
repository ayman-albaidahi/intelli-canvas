from pathlib import Path

from flask import Flask, request, send_from_directory

from .config import Config
from .database import SQLiteSessionRepository
from .errors import register_error_handlers
from .routes import (
    analysis_bp,
    background_bp,
    capabilities_bp,
    explain_bp,
    health_bp,
    history_bp,
    images_bp,
    layers_bp,
    pipeline_bp,
    process_bp,
    suggestions_bp,
    transform_bp,
)
from .services.file_service import FileStorageService
from .services.image_session_service import ImageSessionService
from .services.layer_compositor_service import LayerCompositorService

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


def create_app(database_path: str | None = None) -> Flask:
    """Application factory for the IntelliCanvas backend."""
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
    app.config.from_object(Config)
    # Editor assets change between commits while a tab stays open; never let
    # the browser reuse cached HTML/CSS/JS in this development stage.
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    app.config["JSON_SORT_KEYS"] = False
    app.config["DATABASE_PATH"] = database_path or app.config["DATABASE_PATH"]
    app.config["IMAGE_SESSIONS"] = SQLiteSessionRepository(app.config["DATABASE_PATH"])
    app.config["IMAGE_SESSION_SERVICE"] = ImageSessionService(
        app.config["IMAGE_SESSIONS"]
    )
    app.config["FILE_STORAGE_SERVICE"] = FileStorageService()
    app.config["LAYER_COMPOSITOR_SERVICE"] = LayerCompositorService(
        app.config["IMAGE_SESSION_SERVICE"],
        app.config["FILE_STORAGE_SERVICE"],
        app.config["IMAGE_SESSIONS"],
    )
    register_error_handlers(app)

    app.register_blueprint(health_bp)
    app.register_blueprint(capabilities_bp)
    app.register_blueprint(images_bp)
    app.register_blueprint(transform_bp)
    app.register_blueprint(suggestions_bp)
    app.register_blueprint(process_bp)
    app.register_blueprint(background_bp)
    app.register_blueprint(layers_bp)
    app.register_blueprint(history_bp)
    app.register_blueprint(pipeline_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(explain_bp)

    @app.after_request
    def add_dev_cors_headers(response):
        origin = request.headers.get("Origin", "")
        allowed_origins = {"http://localhost:5500", "http://127.0.0.1:5500"}
        if origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers.setdefault("Vary", "Origin")
            response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
            response.headers.setdefault(
                "Access-Control-Allow-Methods", "GET, POST, OPTIONS"
            )
        return response

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        csp = (
            "default-src 'self'; img-src 'self' data: blob:; "
            "style-src 'self' 'unsafe-inline'; script-src 'self'; "
            "connect-src 'self'; object-src 'none'; base-uri 'self'"
        )
        response.headers.setdefault("Content-Security-Policy", csp)
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        if request.is_secure:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response

    @app.get("/")
    def frontend_index():
        # The legacy root frontend is retired; the editor is the product.
        return app.send_static_file("editor-v2/index.html")

    @app.get("/editor-v2/")
    def editor_v2_index():
        return send_from_directory(FRONTEND_DIR / "editor-v2", "index.html")

    return app
