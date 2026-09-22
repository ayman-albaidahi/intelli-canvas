import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// ui-manager resolves its element references at import time, so the markup has
// to be in the document before the module first evaluates. That rules out a
// static import at the top of this file.
const MARKUP = `
<aside class="inspector" id="inspector" aria-label="Inspector panels">
  <div class="inspector-tabs" role="tablist" aria-label="Editor surfaces">
    <button class="inspector-tab is-active" data-inspector="edit" role="tab">Edit</button>
    <button class="inspector-tab" data-inspector="layers" role="tab">Layers <span class="count-pill">0</span></button>
    <button class="inspector-tab" data-inspector="insights" role="tab">Insights</button>
  </div>
  <section class="inspector-content" id="edit-panel">edit</section>
  <section class="inspector-content" id="layers-panel" hidden>layers</section>
</aside>
<div id="inspector-scrim" class="inspector-scrim" hidden></div>
<button class="view-button inspector-toggle" data-action="inspector-toggle" aria-expanded="false" aria-controls="inspector">▦ Panels</button>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

let openInspectorDrawer;
let closeInspectorDrawer;
let toggleInspectorDrawer;
let inspector;
let scrim;
let toggle;
let setEditorReady;

beforeAll(async () => {
  document.body.innerHTML = MARKUP;
  const ui = await import('./ui-manager.js');
  ({
    openInspectorDrawer,
    closeInspectorDrawer,
    toggleInspectorDrawer,
    setEditorReady,
  } = ui);
  inspector = document.querySelector('#inspector');
  scrim = document.querySelector('#inspector-scrim');
  toggle = document.querySelector('[data-action="inspector-toggle"]');
});

beforeEach(() => {
  closeInspectorDrawer();
});

describe('inspector drawer', () => {
  it('opens by adding is-open, revealing the scrim, and reporting aria-expanded', () => {
    openInspectorDrawer();

    expect(inspector.classList.contains('is-open')).toBe(true);
    expect(scrim.hasAttribute('hidden')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes by removing is-open, hiding the scrim, and clearing aria-expanded', () => {
    openInspectorDrawer();
    closeInspectorDrawer();

    expect(inspector.classList.contains('is-open')).toBe(false);
    expect(scrim.hasAttribute('hidden')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles between the two states', () => {
    toggleInspectorDrawer();
    expect(inspector.classList.contains('is-open')).toBe(true);

    toggleInspectorDrawer();
    expect(inspector.classList.contains('is-open')).toBe(false);
  });

  it('moves focus into the drawer when it opens and back to the toggle when it closes', () => {
    openInspectorDrawer();
    expect(inspector.contains(document.activeElement)).toBe(true);

    closeInspectorDrawer();
    expect(document.activeElement).toBe(toggle);
  });

  it('is a no-op when the inspector element is absent', () => {
    document.body.innerHTML = '';

    expect(() => {
      openInspectorDrawer();
      closeInspectorDrawer();
      toggleInspectorDrawer();
    }).not.toThrow();
  });
});

describe('pre-upload progressive disclosure', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button data-inspector="edit"></button>
      <button data-inspector="insights"></button>
      <button data-tool="brush" data-requires-image title="Brush (B)"></button>
      <button data-action="zoom-in" data-requires-image title="Zoom in"></button>
    `;
  });

  it('disables image tools and non-properties tabs before upload', () => {
    setEditorReady(false);

    expect(document.querySelector('[data-tool="brush"]').disabled).toBe(true);
    expect(document.querySelector('[data-action="zoom-in"]').disabled).toBe(true);
    expect(document.querySelector('[data-inspector="insights"]').disabled).toBe(true);
    expect(document.body.dataset.editorReady).toBe('false');
  });

  it('enables image tools and Insights after upload readiness', () => {
    setEditorReady(true);

    expect(document.querySelector('[data-tool="brush"]').disabled).toBe(false);
    expect(document.querySelector('[data-action="zoom-in"]').disabled).toBe(false);
    expect(document.querySelector('[data-inspector="insights"]').disabled).toBe(false);
    expect(document.body.dataset.editorReady).toBe('true');
  });

  it('appends the pre-upload hint and restores the original title when ready', () => {
    // Toggling readiness is not one-shot: an image can be removed and another
    // loaded, so the hint has to come and go without accumulating or losing the
    // authored label.
    setEditorReady(false);
    expect(document.querySelector('[data-tool="brush"]').title).toBe('Brush (B) — Upload an image first');

    setEditorReady(true);
    expect(document.querySelector('[data-tool="brush"]').title).toBe('Brush (B)');

    // A second round must land on the same strings.
    setEditorReady(false);
    expect(document.querySelector('[data-tool="brush"]').title).toBe('Brush (B) — Upload an image first');
    setEditorReady(true);
    expect(document.querySelector('[data-tool="brush"]').title).toBe('Brush (B)');
  });

  it('keeps a titleless control annotated rather than prefixed with an empty label', () => {
    // A control with no authored title still needs a readable hint.
    setEditorReady(false);
    expect(document.querySelector('[data-action="zoom-in"]').title).toBe('Zoom in — Upload an image first');
  });
});

describe('contextual Edit state', () => {
  it('maps editor situations to focused inspector contexts', async () => {
    const { getInspectorContext } = await import('./ui-manager.js');
    expect(getInspectorContext({ ready: false })).toBe('canvas');
    expect(getInspectorContext({ ready: true, activeTool: 'select' })).toBe('image');
    expect(getInspectorContext({ ready: true, activeTool: 'select', selectedObjectId: 'layer-1' })).toBe('layer');
    expect(getInspectorContext({ ready: true, activeTool: 'brush' })).toBe('tool');
    expect(getInspectorContext({ ready: true, activeTool: 'crop' })).toBe('crop');
  });
});
