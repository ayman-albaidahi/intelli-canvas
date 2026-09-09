# IntelliCanvas Icon System

The icon system uses one SVG sprite: `icons.svg`. Each reusable icon is defined as a `<symbol>` and referenced from HTML with an external SVG `<use>` element.

## Usage

```html
<svg class="icon icon--lg" aria-hidden="true" focusable="false">
  <use href="assets/icons/icons.svg#rotate-left"></use>
</svg>
```

For an icon-only interactive control, add an accessible label:

```html
<button class="icon-button" type="button" aria-label="Rotate left" title="Rotate left">
  <svg class="icon" aria-hidden="true" focusable="false">
    <use href="assets/icons/icons.svg#rotate-left"></use>
  </svg>
</button>
```

## Naming convention

Use lowercase kebab-case IDs. Keep IDs semantic and action-oriented, for example `rotate-left`, `flip-horizontal`, and `compare`.

## Current catalog

- Modes: `select`, `transform`, `process`, `draw`, `layers`, `analyze`
- Transform: `crop`, `resize`, `rotate-left`, `rotate-right`, `flip-horizontal`, `flip-vertical`, `reset`
- Workflow: `undo`, `redo`, `compare`, `export`
- Visual: `spark`

The sprite intentionally uses `currentColor`, so icons inherit color from their button state without duplicating SVG assets.
