import os


class Config:
    # The fallback is for local development only; production must set SECRET_KEY.
    SECRET_KEY = os.environ.get("SECRET_KEY", "intelli-canvas-dev-secret")
    APP_ENV = os.environ.get("INTELLICANVAS_ENV", "development").lower()
    DEBUG = False
    TESTING = False
    MAX_FILE_SIZE = 10 * 1024 * 1024
    MAX_IMAGE_SIDE = 10000
    MAX_IMAGE_PIXELS = 25_000_000
    # Guards the whole request body (all files + form fields) against
    # memory-exhaustion uploads before any validation runs.
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024
    DATABASE_PATH = os.environ.get(
        "INTELLICANVAS_DATABASE_PATH", "instance/intellicanvas.sqlite3"
    )
    AUTH_COOKIE_NAME = os.environ.get("INTELLICANVAS_AUTH_COOKIE", "ic_session")
    AUTH_SESSION_TTL_SECONDS = int(
        os.environ.get("INTELLICANVAS_AUTH_TTL_SECONDS", 60 * 60 * 24 * 7)
    )
    AUTH_COOKIE_SECURE = os.environ.get("INTELLICANVAS_AUTH_COOKIE_SECURE", "0") == "1"
    AUTH_COOKIE_SAMESITE = "Lax"
    CSRF_ENABLED = os.environ.get("INTELLICANVAS_CSRF_ENABLED", "1") == "1"
    CSRF_COOKIE_NAME = os.environ.get("INTELLICANVAS_CSRF_COOKIE", "ic_csrf")
    CSRF_HEADER_NAME = os.environ.get("INTELLICANVAS_CSRF_HEADER", "X-CSRF-Token")
    RATE_LIMIT_ENABLED = os.environ.get("INTELLICANVAS_RATE_LIMIT_ENABLED", "1") == "1"
    RATE_LIMIT_RULES = {
        "register": {"limit": 5, "window_seconds": 60},
        "login": {"limit": 10, "window_seconds": 60},
        # Keep the default high enough for a normal editing session and the
        # browser suite; deployments can lower it through app configuration.
        "expensive": {"limit": 120, "window_seconds": 60},
    }


def validate_production_config(config: dict) -> None:
    if config.get("APP_ENV") != "production":
        return
    if (
        not config.get("SECRET_KEY")
        or config["SECRET_KEY"] == "intelli-canvas-dev-secret"
    ):
        raise RuntimeError("SECRET_KEY must be configured in production.")
    if not config.get("AUTH_COOKIE_SECURE"):
        raise RuntimeError("AUTH_COOKIE_SECURE must be enabled in production.")
    if int(config.get("AUTH_SESSION_TTL_SECONDS", 0)) <= 0:
        raise RuntimeError("AUTH_SESSION_TTL_SECONDS must be positive.")
