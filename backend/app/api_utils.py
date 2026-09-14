"""Backward-compatible imports for route modules.

New code should import response helpers from ``backend.app.errors``.
"""

from .errors import error_response, register_error_handlers

__all__ = ["error_response", "register_error_handlers"]
