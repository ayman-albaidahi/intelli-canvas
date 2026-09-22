import os


class Config:
    # The fallback is for local development only; production must set SECRET_KEY.
    SECRET_KEY = os.environ.get("SECRET_KEY", "intelli-canvas-dev-secret")
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
