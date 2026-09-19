from __future__ import annotations


class ResourceExceededError(RuntimeError):
    """Raised when a bounded image operation exceeds its time budget."""
