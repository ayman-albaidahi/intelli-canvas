"""Reusable request-parameter validators.

Every helper raises :class:`~backend.app.errors.InvalidRequestError` when the
value is unacceptable, so callers get a single uniform error path instead of
hand-rolled ``isinstance`` ladders. Booleans are rejected for numeric fields
because ``bool`` is a subclass of ``int`` in Python and would otherwise slip
through ``isinstance(x, int)`` checks unnoticed.
"""

from __future__ import annotations

from typing import Any, Sequence

from .errors import InvalidRequestError


def require_int(
    value: Any,
    *,
    low: int | None = None,
    high: int | None = None,
    name: str = "value",
    code: str | None = None,
) -> int:
    """Return ``value`` as an int within an inclusive range."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise InvalidRequestError(f"{name} must be an integer.", code=code)
    if low is not None and value < low:
        raise InvalidRequestError(
            f"{name} must be an integer from {low} to {high}.", code=code
        )
    if high is not None and value > high:
        raise InvalidRequestError(
            f"{name} must be an integer from {low} to {high}.", code=code
        )
    return value


def require_number(
    value: Any,
    *,
    low: float | None = None,
    high: float | None = None,
    name: str = "value",
    code: str | None = None,
) -> float:
    """Return ``value`` as an int or float within an inclusive range."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidRequestError(f"{name} must be a number.", code=code)
    if low is not None and value < low:
        raise InvalidRequestError(
            f"{name} must be a number from {low} to {high}.", code=code
        )
    if high is not None and value > high:
        raise InvalidRequestError(
            f"{name} must be a number from {low} to {high}.", code=code
        )
    return value


def require_str(
    value: Any,
    *,
    allow_empty: bool = False,
    name: str = "value",
    empty_code: str | None = None,
) -> str:
    """Return ``value`` as a non-empty string unless emptiness is allowed.

    ``empty_code`` overrides the error code reported for an empty string, so
    fields with a dedicated contract (e.g. ``image_id``) can keep their own
    code while the generic message stays reusable.
    """
    if not isinstance(value, str):
        raise InvalidRequestError(f"{name} must be a string.")
    if not allow_empty and not value.strip():
        raise InvalidRequestError(f"A valid {name} is required.", code=empty_code)
    return value


def require_choice(
    value: Any, choices: Sequence[Any], *, name: str = "value", code: str | None = None
) -> Any:
    """Return ``value`` only if it is one of ``choices``."""
    if value not in choices:
        allowed = ", ".join(str(choice) for choice in choices)
        raise InvalidRequestError(f"{name} must be one of: {allowed}.", code=code)
    return value


def require_odd_int(
    value: Any,
    *,
    low: int | None = None,
    high: int | None = None,
    name: str = "value",
    code: str | None = None,
) -> int:
    """Return ``value`` as an odd integer within an inclusive range."""
    number = require_int(value, low=low, high=high, name=name, code=code)
    if number % 2 == 0:
        raise InvalidRequestError(f"{name} must be an odd integer.", code=code)
    return number


def require_dict(value: Any, *, name: str = "payload") -> dict[str, Any]:
    """Return ``value`` as a dict, rejecting anything else."""
    if not isinstance(value, dict):
        raise InvalidRequestError(f"{name} must be a JSON object.")
    return value
