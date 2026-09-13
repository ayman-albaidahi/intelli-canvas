# Security Hardening — IntelliCanvas

Remediation of the security audit findings. No feature changes.

## Upload content validation
Uploads are now verified by **magic bytes**, not by the client-declared content type: a text/script payload named `.png` with a spoofed `image/png` type is rejected with `INVALID_FILE`. Real image content is accepted under any supported extension (a JPEG saved as `.png` still works). Dangerous path-style filenames (`../../x.png`) are rejected at the API boundary with `INVALID_FILE` — the service-level sanitizer remains as a second layer.

## Request size limit
`MAX_CONTENT_LENGTH = 50 MB` is enforced by Flask, so oversized request bodies are rejected with 413 before being read into memory (the audit's 30MB probe previously consumed the full body before validation).

## Export dimension bomb
Export dimensions are capped at 8000 per side and 24 total megapixels (`INVALID_DIMENSIONS`), preventing a single request from allocating gigabytes.

## Deployment defaults
`run.py` binds to `127.0.0.1` with the debugger off unless `FLASK_HOST` / `FLASK_PORT` / `FLASK_DEBUG=1` are set in the environment. `SECRET_KEY` reads from the environment with an explicit dev-only fallback.

## Security headers
Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.

## XSS
All user-controlled strings interpolated into HTML (layer names, history operations, library background names) are escaped through a shared `escapeHtml` helper; a hostile layer name such as `<img src=x onerror=…>` renders as inert text. The upload hint now states the real 10 MB limit.

## Verification
10 new tests (152 total) cover spoofed-MIME rejection, extension-agnostic content acceptance, security headers, root serving the editor, dimension-bomb rejection at both the side and megapixel limits, and non-image rejection with an image extension. Verified live: the spoofed upload probe now returns 400 `INVALID_FILE`, and the security headers appear on API responses.
