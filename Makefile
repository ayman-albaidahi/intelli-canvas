# IntelliCanvas — unified development entry point.
#
# Targets mirror the CI pipeline (.github/workflows/ci.yml) so a green
# `make check` means a green CI run.
#
# Requires GNU Make (Linux, macOS, WSL). On shells without make, run the
# underlying commands directly from each recipe below.

PYTHON ?= python
NPM    ?= npx

.PHONY: help install dev test test-py test-js test-e2e lint format audit check clean

help:  ## Show the available targets
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*##"}; {printf "%-11s %s\n", $$1, $$2}'

install:  ## Install backend + frontend dependencies
	$(PYTHON) -m pip install -r backend/requirements-dev.txt
	npm install

dev:  ## Start the development server on 127.0.0.1:5000
	$(PYTHON) backend/run.py

test-py:  ## Run the backend suite (pytest)
	$(PYTHON) -m pytest -q

test-js:  ## Run the frontend unit suite (Vitest)
	$(NPM) vitest run

test-e2e:  ## Run the browser suite (Playwright); needs `make install` first
	$(NPM) playwright install --with-deps chromium
	$(NPM) playwright test

test: test-py test-js  ## Run backend + frontend unit suites

lint:  ## Lint the backend (Ruff); frontend linting lands with the quality gate
	$(PYTHON) -m ruff check backend tests

format:  ## Format the backend in place (Ruff)
	$(PYTHON) -m ruff format backend tests
	$(PYTHON) -m ruff check --fix backend tests

audit:  ## Scan Python dependencies for known vulnerabilities (pip-audit)
	$(PYTHON) -m pip-audit -r backend/requirements.txt --strict

# Mirrors the CI backend + frontend jobs. Browser tests are separate
# (`make test-e2e`) because they need the Playwright browser download.
check:  ## Full quality gate: compile + lint + format-check + unit tests
	$(PYTHON) -m compileall -q backend
	$(PYTHON) -m ruff check backend tests
	$(PYTHON) -m ruff format --check backend tests
	$(PYTHON) -m pytest -q
	$(NPM) vitest run

clean:  ## Remove generated caches and test artifacts
	rm -rf .pytest_cache .ruff_cache .mypy_cache test-results
	find . -type d -name '__pycache__' -prune -exec rm -rf {} +
