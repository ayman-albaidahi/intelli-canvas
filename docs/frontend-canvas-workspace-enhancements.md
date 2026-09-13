# Canvas Workspace Enhancements — IntelliCanvas

This stage turns the middle canvas into a stable, professional viewing workspace that stays independent of the side panels.

## Viewing controls

A floating toolbar pinned to the bottom of the canvas zone provides: zoom out, a live zoom percentage (click to reset to 100%), zoom in, Fit to screen, Fit width, 100%, 1:1 actual pixels, and fullscreen. The workspace header keeps Compare and Fit; the zoom cluster moved to the toolbar. Keyboard shortcuts: `+` / `-` zoom, `0` fit, `1` hundred percent (ignored while typing in inputs).

## Interaction

- **Zoom to cursor:** Ctrl/Cmd + wheel zooms around the pointer position; toolbar buttons zoom around the viewport center. Scale is clamped to 5%–800%.
- **Pan:** plain wheel scrolls vertically, Shift + wheel horizontally, and dragging the canvas pans with the pointer. Two-finger pinch zooms and pans on touch devices.
- **Pan clamp:** the image can never leave the workspace entirely — at least a 60px overlap with the viewport is preserved after every pan or zoom.
- **Tool cursors:** the canvas cursor follows the active tool (grab for Select, move for Move, crosshair for Crop/Brush/Eraser/Shapes, text for Text); dragging shows the grabbing cursor.
- **Image bounds:** every render fills the image rectangle with a light checkerboard (revealing transparency) and strokes it with a soft accent border.
- **Fullscreen:** the toolbar button requests fullscreen for the canvas zone; the canvas card expands to fill the screen, the view refits, and the toolbar stays available. Esc exits.
- A ResizeObserver keeps the canvas backing store in sync with layout changes (panel collapse, window resize, fullscreen).

## Layout stability

The editor grid keeps the tool rail, a flexible middle column, and a fixed 292px inspector, so inspector content can never compress the canvas; the inspector scrolls internally. Breakpoints at 1240px and 900px shrink the toolbar and hide the inspector on narrow screens. Middle-click no longer starts a drawing stroke, so it is free for future pan bindings.

## Adjustment preview sync

Because Python now performs the real processing, the local slider preview must not linger after a bake (it would double the applied effect on screen). Every successful **Apply … in Python** action resets its slider or checkbox to neutral and clears the preview filter, so the canvas shows exactly the baked result. The adjustments summary treats blur and sharpen (neutral at 0) correctly instead of flagging them active at their defaults.

## Verification

Open `http://localhost:5000/editor-v2/`, upload an image, and use the toolbar: zoom in/out, Fit, Width, 100%, 1:1, and fullscreen (the card must fill the screen). Ctrl + wheel must zoom around the pointer, plain wheel must pan without changing zoom, and extreme panning must stop with part of the image still visible. Applying brightness in Python must show "Brightness … processed by Python", reset the slider to 100, and return the summary to Neutral.
