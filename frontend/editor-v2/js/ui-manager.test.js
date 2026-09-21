import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// ui-manager resolves its element references at import time, so the markup has
// to be in the document before the module first evaluates. That rules out a
// static import at the top of this file.
const MARKUP = `
<aside class="inspector" id="inspector" aria-label="Inspector panels">
  <div class="inspector-tabs" role="tablist" aria-label="Editor surfaces">
    <button class="inspector-tab is-active" data-inspector="properties" role="tab">Properties</button>
    <button class="inspector-tab" data-inspector="layers" role="tab">Layers <span class="count-pill">0</span></button>
  </div>
  <section class="inspector-content" id="properties-panel">properties</section>
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

beforeAll(async () => {
  document.body.innerHTML = MARKUP;
  const ui = await import('./ui-manager.js');
  ({
    openInspectorDrawer,
    closeInspectorDrawer,
    toggleInspectorDrawer,
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
