from flask import Flask

from .config import Config
from .routes import health_bp


def create_app() -> Flask:
    """Application factory for the IntelliCanvas backend."""
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config["JSON_SORT_KEYS"] = False

    app.register_blueprint(health_bp)

    return app
