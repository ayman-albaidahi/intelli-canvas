from pathlib import Path

from flask import Flask

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
    app = Flask(
        __name__,
        static_folder=str(FRONTEND_DIR),
        static_url_path="",
    )
    app.config.from_object(Config)
    app.config["JSON_SORT_KEYS"] = False
    app.config["IMAGE_SESSIONS"] = {}
    app.config["IMAGE_SESSION_SERVICE"] = ImageSessionService(
        app.config["IMAGE_SESSIONS"]
    )

    app.register_blueprint(health_bp)
    app.register_blueprint(images_bp)
    app.register_blueprint(transform_bp)
    app.register_blueprint(process_bp)
    app.register_blueprint(background_bp)
    app.register_blueprint(layers_bp)
    app.register_blueprint(history_bp)
    app.register_blueprint(pipeline_bp)
    app.register_blueprint(analysis_bp)

    @app.get("/")
    def frontend_index():
        return app.send_static_file("index.html")

    return app
