# Frontend Canvas Workspace — IntelliCanvas

## Scope

This stage extends the merged `frontend/editor-v2/` foundation with a native HTML5 Canvas workspace. The existing backend and API remain untouched.

## Included

The file picker now loads a local image into a real canvas through `FileReader` and `Image`. The canvas calculates a fit scale for the artboard, renders the image with `CanvasRenderingContext2D`, and keeps the zoom percentage in the shared application state. The zoom controls and mouse wheel update the canvas scale, while pointer drag pans the image. The Fit control restores a centered fit-to-artboard view. The canvas resizes with the artboard and accounts for device pixel ratio.

## Files

The new behavior lives in `frontend/editor-v2/js/canvas-manager.js`. The editor entry point and shell now connect the canvas element to the existing UI. Canvas-specific interaction styling is kept in `frontend/editor-v2/css/components.css`.

## Boundaries

This is still a local preview stage. It does not upload files, call Flask, apply image-processing operations, or persist image edits. Those responsibilities will be added behind service modules after the interaction model is stable.

## Verification

Open `frontend/editor-v2/index.html` through a local static server. Choose a PNG, JPG, WEBP, or BMP file. Confirm that the image is rendered in the artboard, the zoom percentage changes through the controls or mouse wheel, the image can be panned with pointer drag, and Fit restores the centered view. Resize the browser and confirm the canvas remains aligned with the artboard.

## Next stage

Add client-side transform commands (rotate, flip, crop selection) with undo/redo snapshots while preserving the same canvas manager boundary.
