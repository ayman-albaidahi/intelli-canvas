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
| POST | `/api/images/export` | JSON: `image_id`, `format`, optional `quality`, `width`, `height`, `composite_layers` | Returns an exported image download; when `composite_layers` is true, persisted visible layers are rendered first. |

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
| POST | `/api/background/replace-preview` | JSON with `image_id`, mask parameters, one replacement target, and optional blur/scale/offset/shadow fields | Returns a non-destructive PNG replacement preview. |
| POST | `/api/background/replace` | JSON with `image_id` and one replacement target | Replaces the background with a solid color or library asset; optional blur, scale, offsets, and foreground shadow are supported. |
| GET | `/api/background/backgrounds` | None | Lists available background assets. |
| GET | `/api/background/backgrounds/catalog` | None | Lists background metadata including category, dimensions, and thumbnail URL. |
| GET | `/api/background/backgrounds/<name>/thumbnail` | Path background name | Returns a generated 320×200 JPEG thumbnail. |
| POST | `/api/background/backgrounds` | Multipart image field and optional `category` | Uploads a background asset and stores its category metadata. |

## History

| Method | Path | Body or query | Purpose |
|---|---|---|---|
| GET | `/api/history?image_id=<id>` | Query `image_id` | Returns operation history and current state. |
| POST | `/api/history/undo` | JSON: `image_id` | Moves to the previous history state. |
| POST | `/api/history/redo` | JSON: `image_id` | Reapplies the next history state. |
| POST | `/api/history/goto` | JSON: `image_id`, `index` | Jumps to a history state. |
| POST | `/api/history/clear` | JSON: `image_id` | Clears history while keeping the current state. |
| GET | `/api/history/current-file?image_id=<id>` | Query `image_id` | Returns metadata for the current file. |
| GET | `/api/history/content/<image_id>/<index>` | Path image and History index | Returns the image bytes for a specific History state. |
| GET | `/api/history/compare?image_id=<id>&from=<index>&to=<index>` | Query source and target indices | Returns read-only Before/After metadata and content URLs. |
| POST | `/api/history/diff` | JSON: `image_id`, `from_index`, `to_index`, optional `mode`, `threshold` | Returns a read-only PNG difference map. |

## Layers, pipeline, analysis, and suggestions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/layers?image_id=<id>` | Returns the persisted layers for the image session in z-order. |
| PUT | `/api/layers` | Persists validated image, shape, text, and brush layers. Image data URLs are moved to session-scoped file assets. |
| GET | `/api/layers/assets/<asset_id>` | Returns a persisted layer image asset after session ownership validation through the layer payload. |
| POST | `/api/layers/compose` | Renders visible layers over the current base image and returns the composed PNG metadata. |
| GET | `/api/pipeline?image_id=<id>` | Returns the persisted pipeline and ordered nodes for an image session. |
| PUT | `/api/pipeline` | Replaces the complete validated pipeline node list. |
| POST | `/api/pipeline/nodes` | Adds a supported processing node. |
| PATCH | `/api/pipeline/nodes/<node_id>` | Updates node operation, parameters, or enabled state. |
| DELETE | `/api/pipeline/nodes/<node_id>` | Deletes a pipeline node. |
| POST | `/api/pipeline/nodes/<node_id>/toggle` | Enables or disables a node. |
| POST | `/api/pipeline/reorder` | Moves a node to a zero-based order index. |
| POST | `/api/analysis` | Returns image metrics and brightness/contrast findings. |
| POST | `/api/analysis/export-report` | Downloads the analysis result as `analysis.json`. |
| POST | `/api/suggestions` | Returns explainable suggestions derived from analysis findings. |
| POST | `/api/suggestions/preview` | Returns a PNG preview without changing image history. |
| POST | `/api/suggestions/apply` | Applies a suggestion and records the operation in history. |
| POST | `/api/suggestions/dismiss` | Accepts dismissal of a suggestion. |

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

This document describes endpoints currently present in the codebase. The broader architectural and requirements documents remain the source of planned capabilities and historical design intent. Current implementation status, verification totals, and dependency notes are maintained in [`docs/current/system-status.md`](current/system-status.md).
