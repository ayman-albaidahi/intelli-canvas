"""Tests for GET /api/capabilities.

The value of this endpoint is that the schema it publishes is *the* contract a
client builds against, so the strongest thing we can assert is that every
published bound agrees with the validator that actually enforces it. A schema
that drifts from the validator is worse than no schema at all: the client would
send requests it believes are valid and the backend would reject them.
"""

from __future__ import annotations

import pytest

from backend.app import create_app
from backend.app.errors import InvalidRequestError
from backend.app.operations.registry import OPERATIONS


@pytest.fixture(scope="module")
def client():
    return create_app().test_client()


def test_capabilities_reports_every_operation(client):
    response = client.get("/api/capabilities")
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    # A new operation in the registry must surface here without a second edit.
    assert set(data["operations"]) == set(OPERATIONS)


def test_capabilities_leaks_no_internal_path(client):
    """The response describes the API surface only, never storage internals."""
    response = client.get("/api/capabilities")
    assert "path" not in response.data.decode()


@pytest.mark.parametrize("slug", sorted(OPERATIONS))
def test_published_schema_matches_validator(slug):
    """Every published bound must agree with the validator's real behaviour.

    Probing the validator at its declared edges catches the case where someone
    tightens ``validate`` and forgets ``param_schema`` (or vice versa) — the
    drift that would otherwise reach a production client.
    """
    spec = OPERATIONS[slug]
    schema = spec.param_schema

    if not schema:
        # Operations taking no parameters must still validate an empty payload.
        assert spec.validate({}) == {}
        return

    for key, contract in schema.items():
        if contract.get("required"):
            with pytest.raises(InvalidRequestError):
                spec.validate({key: None})
            continue

        low, high = contract["low"], contract["high"]
        default = contract["default"]

        # The declared default must validate. For an operation with a required
        # sibling parameter (morphology needs ``operation``), supply a valid one
        # so the optional parameter is what is actually exercised.
        payload = {key: default}
        for other, other_contract in schema.items():
            if other != key and other_contract.get("required"):
                payload[other] = other_contract["choices"][0]

        assert spec.validate(payload)[key] == default

        # Boundaries are inclusive.
        assert spec.validate({**payload, key: low})[key] == low
        assert spec.validate({**payload, key: high})[key] == high

        # Just outside the range must be rejected.
        with pytest.raises(InvalidRequestError):
            spec.validate({key: _below(low)})
        with pytest.raises(InvalidRequestError):
            spec.validate({key: _above(high, contract)})

        if contract.get("odd"):
            # An even value inside the range is still invalid for a kernel size.
            even = low + 1 if (low + 1) <= high and (low + 1) % 2 == 0 else low + 2
            if even <= high:
                with pytest.raises(InvalidRequestError):
                    spec.validate({key: even})


def _below(low):
    return low - 1


def _above(high, contract):
    step = 1 if contract["type"] == "integer" else 0.1
    return round(high + step, 10)


def test_published_choices_are_the_validator_choices():
    """A choice list that lags behind the validator misleads the client."""
    spec = OPERATIONS["morphology"]
    published = spec.param_schema["operation"]["choices"]

    accepted = []
    for choice in published:
        try:
            spec.validate({"operation": choice, "ksize": 3})
            accepted.append(choice)
        except InvalidRequestError:
            pass
    # Every published choice must actually be accepted.
    assert sorted(accepted) == sorted(published)
