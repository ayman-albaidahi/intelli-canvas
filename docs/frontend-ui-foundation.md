# Frontend UI Foundation — IntelliCanvas

## Scope

This change introduces an isolated, new frontend foundation at `frontend/editor-v2/`. It is intentionally independent from the existing frontend entry point and from all Flask/API code. Existing frontend files are not modified.

## Design direction

The first interface direction is a calm professional editor workspace using a rose-pink accent system. Light mode uses a soft warm neutral canvas with white surfaces; dark mode uses plum-charcoal surfaces with a brighter rose accent. The accent is reserved for selection, calls to action, focus, and status so the editor remains practical rather than decorative.

## Included in this stage

- Structured editor shell: top bar, tool rail, canvas workspace, inspector, and status bar.
- Light and dark themes using centralized CSS custom properties.
- Responsive fallback for narrower screens.
- Empty canvas onboarding state.
- Mock artboard state after selecting an image file; this is only a visual preview and does not process or upload the image.
- Initial UI state modules using native JavaScript ES modules.
- Basic tool selection, inspector tabs, zoom controls, theme persistence, keyboard shortcuts, and placeholder toasts.
- Placeholders for future comparison, adjustments, filters, background, history, pipeline, analysis, and layers stages.

## Intentionally excluded

- No backend changes.
- No API requests.
- No image-processing algorithms.
- No replacement of the current `frontend/index.html`.
- No final canvas rendering implementation yet.

## Verification

Open `frontend/editor-v2/index.html` through a local static server. The UI should render without external dependencies. Test theme switching, tool selection, inspector tabs, zoom controls, the file picker preview, and keyboard shortcuts (`V`, `B`, `C`, and `Ctrl/Cmd + O`).

## Next stage

Connect the file picker to a real HTML5 Canvas renderer, then add fit-to-screen, pan, and image transform state while keeping the same component boundaries.
