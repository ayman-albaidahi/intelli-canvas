# Backend Brightness Processing — IntelliCanvas

PR #60 was confirmed merged into `main` before this stage began. This stage adds real brightness processing to the existing Python pipeline.

The endpoint is:

```text
POST /api/process/brightness
```

Request body:

```json
{
  "image_id": "...",
  "value": 150
}
```

The value is an integer from `0` to `200`, where `100` is neutral, values below `100` darken the image, and values above `100` brighten it. Pillow's `ImageEnhance.Brightness` applies the pixel operation. The result is saved in `backend/storage/processed`, the image session is updated, and the frontend reloads the processed content from the backend.

The editor exposes **Apply brightness in Python** directly below the brightness slider. The button sends the selected slider value, shows processing state, and reports success or failure. This remains separate from the existing local Canvas preview so the Python processing boundary is observable in DevTools Network and the Flask terminal.

## Verification

Open `http://localhost:5000/editor-v2/`, upload an image, choose a brightness value, and click the Python button. Confirm `POST /api/process/brightness` returns `200`, followed by the content request. The UI should report that brightness was processed by Python, and a new processed file should appear under `backend/storage/processed`.

## Contrast extension in PR #61

The same processing contract now also includes:

```text
POST /api/process/contrast
```

It accepts an integer `value` from `0` to `200`, with `100` as neutral. Pillow's `ImageEnhance.Contrast` applies the operation, saves a new processed PNG, updates the session, and returns result metadata. The editor exposes **Apply contrast in Python** below the contrast slider and reloads the backend result after the request completes.

The Network panel should show `POST /api/process/contrast` followed by `GET /api/images/{image_id}/content`. The Flask terminal and `backend/storage/processed` provide an additional confirmation that the operation ran in Python.

## Blur extension in PR #61

The shared process pipeline now also includes:

```text
POST /api/process/blur
```

It accepts an integer `value` from `0` to `20`, interpreted as the Gaussian blur radius in pixels. Pillow's `ImageFilter.GaussianBlur` applies the operation, saves a new processed PNG, updates the session, and returns result metadata. The editor exposes **Apply blur in Python** below the blur slider and reloads the backend result after processing.

## Sharpen extension in PR #61

The shared process pipeline now also includes:

```text
POST /api/process/sharpen
```

It accepts an integer `value` from `0` to `5`, with `0` neutral and `5` the strongest supported sharpening level. Pillow's `ImageEnhance.Sharpness` applies the operation, saves a new processed PNG, updates the session, and returns result metadata. The editor exposes **Apply sharpen in Python** below a new Sharpen control and reloads the backend result after processing.
