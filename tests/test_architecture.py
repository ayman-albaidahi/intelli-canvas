"""Architecture boundary tests.

These guard the layering that the restructuring established. They are cheap
to run and fail loudly the moment a service reaches back into Flask's request
handling or a route bypasses the dependency accessors to touch a repository.

Discovery walks the filesystem rather than ``pkgutil``: ``backend/app/services``
was once an implicit namespace package (no ``__init__.py``), and ``pkgutil``
silently skips those, so an earlier version of this file passed without ever
examining a single service. Enumerating ``*.py`` directly keeps the check honest
even if a package marker goes missing again.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import backend.app as app_package

# werkzeug.utils.secure_filename is a pure string-sanitizing helper with no
# HTTP coupling; services use it to keep user-supplied filenames off the
# filesystem path. Everything else in flask/werkzeug is request handling.
ALLOWED_WEB_IMPORTS = {"werkzeug.utils.secure_filename"}

LAYERS = ("services", "domain", "operations")


def _layer_sources() -> list[tuple[str, Path]]:
    """Every source file in a guarded layer, as ``(module name, path)``."""
    base = Path(app_package.__file__).parent
    sources: list[tuple[str, Path]] = []
    for layer in LAYERS:
        layer_dir = base / layer
        if not layer_dir.is_dir():
            pytest.fail(f"layer directory missing: {layer_dir}")
        for source in sorted(layer_dir.rglob("*.py")):
            if source.stem == "__init__":
                continue
            relative = source.relative_to(base)
            module = (
                f"{app_package.__name__}.{'.'.join(relative.with_suffix('').parts)}"
            )
            sources.append((module, source))
    return sources


def _imports_of(path: Path) -> set[tuple[str, str]]:
    """Resolve every ``from X import a, b`` and ``import X`` in a module.

    Returns (module, symbol) pairs; bare ``import X`` yields ("X", "").
    Only absolute imports are tracked — relative ones stay inside the package
    tree and are handled by the cycle check.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[tuple[str, str]] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                found.add((alias.name, ""))
        elif isinstance(node, ast.ImportFrom):
            if node.module and not node.level:  # absolute imports only
                for alias in node.names:
                    found.add((node.module, alias.name))
    return found


@pytest.fixture(scope="module")
def layer_sources() -> list[tuple[str, Path]]:
    sources = _layer_sources()
    if not sources:
        pytest.fail("no source files discovered under the guarded layers")
    return sources


def test_layers_are_discoverable(layer_sources):
    """The boundary checks are meaningless if a layer is invisible to them.

    Naming one module per layer keeps this honest: a missing ``__init__.py``
    or a renamed directory fails here instead of quietly reducing the other
    checks to tautologies.
    """
    modules = {name for name, _ in layer_sources}
    for layer, sentinel in (
        ("services", "file_service"),
        ("domain", "results"),
        ("operations", "registry"),
    ):
        assert any(
            m == f"{app_package.__name__}.{layer}.{sentinel}" for m in modules
        ), f"layer {layer!r} was not discovered (expected {sentinel}.py)"


def test_services_do_not_couple_to_http(layer_sources):
    """The domain and service layer must not depend on request handling.

    ``secure_filename`` is the one allowed exception: it sanitizes a string
    and carries no HTTP semantics. Any other flask/werkzeug symbol means a
    service has reached into the transport layer.
    """
    violations = []
    for name, path in layer_sources:
        for module, symbol in _imports_of(path):
            if module.split(".")[0] not in ("flask", "werkzeug"):
                continue
            if f"{module}.{symbol}" in ALLOWED_WEB_IMPORTS:
                continue
            violations.append(f"{name}: imports {module}.{symbol}")
    assert not violations, "HTTP layer leaked into services/domain:\n" + "\n".join(
        violations
    )


def test_services_do_not_import_routes(layer_sources):
    """Dependency direction is routes -> services, never the reverse."""
    routes_prefix = f"{app_package.__name__}.routes"
    violations = [
        f"{name}: imports {module}"
        for name, path in layer_sources
        for module, _ in _imports_of(path)
        if module == routes_prefix or module.startswith(routes_prefix + ".")
    ]
    assert not violations, "A service imports the routes layer:\n" + "\n".join(
        violations
    )


def test_routes_do_not_construct_repositories():
    """Routes resolve collaborators through the dependency accessors.

    Reaching into the SQLite repository directly bypasses the seam tests rely
    on to inject an isolated storage root.
    """
    routes_dir = Path(app_package.__file__).parent / "routes"
    violations = []
    for source in routes_dir.glob("*.py"):
        tree = ast.parse(source.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.ImportFrom)
                and node.module
                and "database" in node.module
            ):
                violations.append(f"{source.name}: imports {node.module}")
    assert not violations, "Route imports the repository directly:\n" + "\n".join(
        violations
    )


def test_service_dependency_graph_is_acyclic(layer_sources):
    """No module in the guarded layers may depend on itself transitively.

    Uses a white/grey/black DFS rather than checking only paths back to the
    start node: a cycle between two deeper modules would otherwise be missed
    once their shared ancestor had been visited.
    """
    names = {name for name, _ in layer_sources}
    graph: dict[str, set[str]] = {}
    for name, path in layer_sources:
        graph[name] = {m for m, _ in _imports_of(path) if m in names}

    WHITE, GREY, BLACK = 0, 1, 2
    color: dict[str, int] = dict.fromkeys(graph, WHITE)

    def find_cycle(node: str) -> str | None:
        color[node] = GREY
        for dependency in graph.get(node, ()):
            if color[dependency] == GREY:
                return f"{node} -> {dependency}"
            if color[dependency] == WHITE:
                if found := find_cycle(dependency):
                    return found
        color[node] = BLACK
        return None

    for node in graph:
        if color[node] == WHITE:
            if cycle := find_cycle(node):
                pytest.fail(f"import cycle in the service/domain graph: {cycle}")


def test_every_registered_operation_has_a_route():
    """Adding an operation to the registry must surface as an endpoint.

    This is the open/closed guarantee in test form: a new OperationSpec that
    forgets to stay consistent with the URL map is caught here rather than
    silently 404ing in production.
    """
    from backend.app import create_app
    from backend.app.operations.registry import OPERATIONS

    app = create_app()
    urls = {rule.rule for rule in app.url_map.iter_rules()}
    missing = [
        slug
        for slug, operation in OPERATIONS.items()
        if operation.produces_image and f"/api/process/{slug}" not in urls
    ]
    assert not missing, f"registered operations have no route: {sorted(missing)}"
