# Audit Remediation — IntelliCanvas

Implements the first batch of the improvement register (REL-003, SEC-004/005/009, QA-001, SEC-006/007) plus user-facing message polish.

## Fixes
- **REL-003** — history entries now store their storage location; `goto(0)` after `clear_history` no longer forces `uploads` (previously returned 404 for the current state). Regression test included.
- **SEC-005** — Flask upgraded to 3.1.3 and Pillow to 11.3.0 (patched releases; `requirements.txt` updated and verified against the full suite).
- **SEC-004/009** — uploads now check header dimensions (max side 10000, max 25 megapixels) and run Pillow `verify()` before storage, rejecting decompression-bomb headers and truncated files with `INVALID_FILE`.

## CI and headers
- `.github/workflows/ci.yml`: pytest + ruff (pyflakes) + pip-audit on every push/PR, with `backend/requirements-dev.txt`.
- Strict CORS: `Access-Control-Allow-Origin` only for known origins, with `Vary: Origin`.
- CSP (`default-src 'self'`, blob images, no inline scripts), `Permissions-Policy`, and HSTS when serving over HTTPS. The error collector moved to an external script so it survives the CSP.

## User-facing messages
All editor messages addressed to the user no longer mention the implementation ("Adjustments applied", "Applied: brightness 150 — preview is up to date", "Removing the background…"); the actionable server-start hint remains only in the offline error.

## Verification
155/155 tests (including the clear/goto regression), ruff clean, and a live pass through the real UI: apply → history records → undo restores the original pixels → redo re-applies — with no "Python" wording visible anywhere.
