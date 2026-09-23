from copy import deepcopy
from pathlib import Path

from flask import Flask, request, send_from_directory

from .config import Config, validate_production_config
from .csrf import enforce_enabled_csrf, set_csrf_cookie
from .database import SQLiteSessionRepository
from .errors import register_error_handlers
from .rate_limit import InMemoryRateLimiter, enforce_rate_limit
from .routes import (
    analysis_bp,
    auth_bp,
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
from .services.auth_service import AuthService
from .services.background_service import BackgroundService
from .services.file_service import FileStorageService
from .services.geometry_service import GeometryService
from .services.history_comparison_service import HistoryComparisonService
from .services.image_io_service import ImageIOService
from .services.image_session_service import ImageSessionService
from .services.image_upload_service import ImageUploadService
from .services.layer_compositor_service import LayerCompositorService
from .services.pipeline_execution_service import PipelineExecutionService
from .services.pipeline_service import PipelineService
from .services.process_service import ProcessService
from .services.smart_crop_service import SmartCropService

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


def create_app(database_path: str | None = None, storage_root=None) -> Flask:
    """Application factory for the IntelliCanvas backend."""
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
    app.config.from_object(Config)
    app.config["RATE_LIMIT_RULES"] = deepcopy(app.config["RATE_LIMIT_RULES"])
    validate_production_config(app.config)
    # Editor assets change between commits while a tab stays open; never let
    # the browser reuse cached HTML/CSS/JS in this development stage.
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
    app.config["JSON_SORT_KEYS"] = False
    app.config["DATABASE_PATH"] = database_path or app.config["DATABASE_PATH"]
    app.config["IMAGE_SESSIONS"] = SQLiteSessionRepository(app.config["DATABASE_PATH"])
    app.config["AUTH_SERVICE"] = AuthService(
        app.config["IMAGE_SESSIONS"], app.config["AUTH_SESSION_TTL_SECONDS"]
    )
    app.config["IMAGE_SESSION_SERVICE"] = ImageSessionService(
        app.config["IMAGE_SESSIONS"]
    )
    app.config["FILE_STORAGE_SERVICE"] = FileStorageService(storage_root=storage_root)

    # Every service is constructed exactly once, here, and handed its
    # collaborators explicitly. A service built anywhere else used to silently
    # bind its own default storage root, which meant two services in the same
    # request could read and write through different roots; making storage a
    # required constructor argument keeps that from recurring.
    storage = app.config["FILE_STORAGE_SERVICE"]
    sessions = app.config["IMAGE_SESSION_SERVICE"]
    app.config["IMAGE_IO_SERVICE"] = ImageIOService(sessions, storage)
    app.config["PROCESS_SERVICE"] = ProcessService(sessions, storage)
    app.config["GEOMETRY_SERVICE"] = GeometryService(sessions, storage)
    app.config["BACKGROUND_SERVICE"] = BackgroundService(sessions, storage)
    app.config["SMART_CROP_SERVICE"] = SmartCropService(sessions, storage)
    app.config["PIPELINE_SERVICE"] = PipelineService(sessions)
    app.config["PIPELINE_EXECUTION_SERVICE"] = PipelineExecutionService(
        sessions, storage
    )
    app.config["HISTORY_COMPARISON_SERVICE"] = HistoryComparisonService(
        sessions, storage
    )
    app.config["IMAGE_UPLOAD_SERVICE"] = ImageUploadService(sessions, storage)
    app.config["LAYER_COMPOSITOR_SERVICE"] = LayerCompositorService(
        sessions, storage, app.config["IMAGE_SESSIONS"]
    )
    app.extensions["rate_limiter"] = InMemoryRateLimiter()
    register_error_handlers(app)

    @app.before_request
    def enforce_request_security():
        csrf_response = enforce_enabled_csrf()
        if csrf_response is not None:
            return csrf_response
        return enforce_rate_limit()

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
    app.register_blueprint(auth_bp)

    @app.after_request
    def add_csrf_cookie(response):
        return set_csrf_cookie(response)

    @app.after_request
    def add_dev_cors_headers(response):
        origin = request.headers.get("Origin", "")
        allowed_origins = {"http://localhost:5500", "http://127.0.0.1:5500"}
        if origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers.setdefault("Vary", "Origin")
            response.headers.setdefault(
                "Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token"
            )
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
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; "
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
        return app.send_static_file("index.html")

    @app.get("/editor")
    @app.get("/editor/")
    def editor_index():
        """Stable product entry point for the editor from the landing page."""
        return send_from_directory(FRONTEND_DIR / "editor-v2", "index.html")

    @app.get("/editor-v2/")
    def editor_v2_index():
        return send_from_directory(FRONTEND_DIR / "editor-v2", "index.html")

    return app
