"""Application services: the business logic between routes and storage.

Routes translate HTTP into calls here; repositories and the pixel operations
live below. The layer depends only inward — never on Flask's request handling
and never back up to the routes. ``tests/test_architecture.py`` enforces both
directions, so a service that reaches for ``request`` or ``jsonify`` fails the
build rather than silently eroding the boundary.

This file itself is load-bearing for that test: without it, ``services`` falls
back to an implicit namespace package, which ``pkgutil.walk_packages`` does not
discover, so the layer would be skipped and the boundary checks would pass
without ever examining a service.
"""
