# Frontend Layer System — IntelliCanvas

## Scope

This stage adds the first usable layer-management foundation on top of the merged canvas, transform, crop, and resize stages. It remains a pure HTML, CSS, and JavaScript implementation.

## Included

The Layers inspector now maintains a frontend layer collection. Loading an image creates an Image layer. Users can add empty Shape layers, select a layer, toggle visibility, rename a layer through the layer action button, and inspect a live layer count. The selected layer receives a clear rose-tinted state, while the empty state disappears as soon as a layer is present.

Layer state and rendering of the inspector are isolated in `layer-manager.js`. This creates a stable boundary for later object layers, z-order controls, opacity editing, and true multi-layer Canvas compositing.

## Verification

Open the editor through a local static server, switch to Layers, load an image, and confirm an Image layer appears. Add multiple empty layers, select them, rename one through the ellipsis control, toggle visibility, and verify the count. Confirm the existing crop, resize, rotate, flip, zoom, and pan controls remain available.

## Limitation

The current stage manages layer metadata and interaction state; empty layers are not yet composited into the Canvas. True object rendering and z-order compositing will be added with the drawing and shapes stage.
