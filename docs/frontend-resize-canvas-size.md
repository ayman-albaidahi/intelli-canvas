# Resize and Canvas Size — IntelliCanvas

## Scope

This stage adds a frontend resize workflow on top of the merged Canvas, transform, and interactive crop stages. It uses only HTML, CSS, JavaScript, and the native Canvas API.

## Included

The top bar now includes a Resize action that opens a focused dialog with width, height, and Maintain aspect ratio controls. Width and height values stay synchronized while the ratio option is enabled. Applying the dialog updates the canvas document dimensions, fits the result into the workspace, and updates the status bar dimensions. The resize operation creates an Undo snapshot through the existing canvas history.

The UI is implemented in `resize-tool.js`; document dimensions and rendering behavior remain owned by `canvas-manager.js`.

## Verification

Open `frontend/editor-v2/index.html` through a local static server and choose an image. Open Resize, change the width, verify the height follows when aspect ratio is locked, then apply. Confirm the status bar updates, the image remains visible, and Undo restores the prior dimensions. Disable the ratio option and confirm width and height can be edited independently. Test Cancel and the existing crop, rotate, flip, zoom, and pan behavior.

## Limitation

This stage changes the working document dimensions used by the frontend preview; it does not yet export a newly encoded raster file. Export encoding and file download will be added after the layer and comparison foundations are in place.
