# Phase 4 — Background Studio — IntelliCanvas

This stage adds color-mask background removal and replacement, processed end-to-end by Python.

## Backend

New `BackgroundService` with four operations on the current session image, all pure Pillow (fast C ops, no extra dependencies):

- `POST /api/background/mask-preview` — returns the grayscale mask as a PNG (white = keep, black = remove); the session is not modified.
- `POST /api/background/remove` — builds the mask and writes a transparent PNG; the session points to the result.
- `POST /api/background/replace` — removes, then composites the foreground over a solid color or a library background (`ImageOps.fit` cover-crop).
- `GET /api/backgrounds` + `POST /api/backgrounds` — the product background library stored in `storage/backgrounds`.

The mask uses the max-channel (Chebyshev) distance from the picked color, thresholded by `tolerance` (0–100), cleaned by `smooth` morphological opening iterations (0–5), edge-softened by `feather` Gaussian blur (0–25), and optionally inverted. Parameters are validated per-field (`INVALID_MASK_PARAMS`), replacement targets require exactly one of `background_color` / `background_name`, and outputs follow the bounded base-stem filename scheme.

## Editor — Background studio panel

A new inspector accordion exposes the full workflow: pick a key color directly from the image (eyedropper samples the base image through the live view transform), tolerance/feather/smooth sliders with live values, invert toggle, a mask preview overlay drawn through the canvas transform, Remove background, and replacement via solid color, the library picker, or an uploaded backdrop. Operations show progress in the status bar, reload the Python result, and clear the overlay.

## Verification

12 new backend tests (128 total) cover transparent removal, inverted keeps, solid and library replacement, mask preview, library upload/listing, per-field validation, unknown sessions and bounded filenames. Verified live through the real UI: eyedropper picks #1e60d0 from the backdrop, Remove makes the backdrop transparent while the red subject stays opaque, Replace with solid green and with a library image composites correctly, and mask preview/clear work through the overlay.
