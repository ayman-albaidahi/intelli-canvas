import os
import sys

if __package__ in (None, ""):
    project_root = os.path.abspath(os.path.join
                                   (os.path.dirname(__file__), ".."))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from backend.app import create_app
    from backend.app.config import Config
else:
    from .app import create_app
    from .app.config import Config


app = create_app(Config.DATABASE_PATH)


if __name__ == "__main__":
    # Secure defaults: loopback only and the debugger off unless explicitly
    # enabled. Never run exposed to a network with FLASK_DEBUG=1.
    app.run(
        host=os.environ.get("FLASK_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
