# IntelliCanvas API Endpoints

This document describes the currently implemented Flask API. The API returns JSON for successful metadata responses and errors unless an endpoint explicitly returns image or file content.

## Common response shape

Successful JSON responses use:

```json
{"success": true, "image": {}}
```

Errors use:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation."
  }
}
```

## Health and frontend

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Returns API availability. |
| GET | `/` | Serves the Editor V2 application. |
| GET | `/editor-v2/` | Serves the Editor V2 application explicitly. |

## Images

| Method | Path | Body or query | Purpose |
|---|---|---|---|
| POST | `/api/images` | Multipart field `file` | Validates and uploads a supported image. |
| GET | `/api/images/<image_id>/content` | Path parameter | Returns the current image bytes. |
| POST | `/api/images/convert` | JSON: `image_id`, `format` | Converts the current image to a supported format. |
| POST | `/api/images/export` | JSON: `image_id`, `format`, optional `quality`, `width`, `height` | Returns an exported image download. |

Supported source formats are PNG, JPEG/JPG, WEBP, and BMP. Uploads are validated by content, extension, file size, and image dimensions.

## Transformations

All transformation endpoints accept JSON with `image_id`.

| Method | Path | Additional fields | Purpose |
|---|---|---|---|
| POST | `/api/transform/crop` | Crop coordinates and dimensions | Crops the current image. |
| POST | `/api/transform/resize` | `width`, `height`, `lock_aspect_ratio` | Resizes the image. One dimension may be inferred when aspect ratio is locked. |
| POST | `/api/transform/rotate` | `angle`: `90`, `-90`, or `180` | Rotates the image. |
| POST | `/api/transform/flip` | `direction`: `horizontal` or `vertical` | Flips the image. |

## Image processing

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/process/grayscale` | Converts the current image to grayscale. |
| POST | `/api/process/brightness` | Adjusts brightness using a validated value. |
| POST | `/api/process/contrast` | Adjusts contrast using a validated value. |
| POST | `/api/process/blur` | Applies blur using a validated value. |
| POST | `/api/process/sharpen` | Applies sharpening using a validated value. |
| POST | `/api/process/saturation` | Adjusts color saturation using a validated value. |
| POST | `/api/process/negative` | Inverts image colors. |
| POST | `/api/process/adjustments` | Applies a validated batch of supported adjustments. |

## Backgrounds

| Method | Path | Body or query | Purpose |
|---|---|---|---|
| POST | `/api/background/mask-preview` | JSON with `image_id` and background parameters | Returns a PNG mask preview. |
| POST | `/api/background/remove` | JSON with `image_id` and background parameters | Removes a selected background color. |
| POST | `/api/background/replace` | JSON with `image_id` and one replacement target | Replaces the background with a solid color or library asset. |
| GET | `/api/background/backgrounds` | None | Lists available background assets. |
| POST | `/api/background/backgrounds` | Multipart image field | Uploads a background asset. |

## History

| Method | Path | Body or query | Purpose |
|---|---|---|---|
| GET | `/api/history?image_id=<id>` | Query `image_id` | Returns operation history and current state. |
| POST | `/api/history/undo` | JSON: `image_id` | Moves to the previous history state. |
| POST | `/api/history/redo` | JSON: `image_id` | Reapplies the next history state. |
| POST | `/api/history/goto` | JSON: `image_id`, `index` | Jumps to a history state. |
| POST | `/api/history/clear` | JSON: `image_id` | Clears history while keeping the current state. |
| GET | `/api/history/current-file?image_id=<id>` | Query `image_id` | Returns metadata for the current file. |

## Layers, pipeline, and analysis

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/layers` | Reads or updates the current layer API payload. |
| GET/POST | `/api/pipeline` | Reads or updates the processing pipeline payload. |
| POST | `/api/analysis` | Runs the currently implemented image analysis operation. |

## Operational limits

The backend enforces request, file, image-side, pixel-count, and export-dimension limits. Clients should display the returned error `code` and `message` rather than exposing internal paths or exception details.

## Local development

From the repository root:

```bash
python -m pip install -r backend/requirements-dev.txt
pytest -q
python backend/run.py
```

The preferred editor URL is:

```text
http://localhost:5000/editor-v2/
```

The root URL `/` serves the same editor and resolves its assets through the Editor V2 base path.

## Scope note

This document describes the endpoints currently present in the codebase. Advanced requirements such as histogram processing, edge detection, morphological operations, and intelligent assistance are not represented as implemented endpoints yet.
