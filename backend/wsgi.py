"""WSGI entry point for production servers (gunicorn, uWSGI).

The development server in ``backend/run.py`` must never serve production
traffic. Import this module from a real WSGI server instead::

    gunicorn --workers 4 --bind 127.0.0.1:5000 backend.wsgi:app

Production configuration is validated at import time by ``create_app``:
running with ``INTELLICANVAS_ENV=production`` but no real ``SECRET_KEY`` or
without a secure auth cookie raises immediately instead of silently falling
back to the development defaults.
"""

from backend.app import create_app
from backend.app.config import Config

app = create_app(Config.DATABASE_PATH)
