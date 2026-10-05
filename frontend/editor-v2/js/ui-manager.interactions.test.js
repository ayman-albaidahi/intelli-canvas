import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// ui-manager resolves #inspector, the scrim and the toggle at import time
// (see the drawer spec for why that rules out a top-level static import),
// so the full markup below must exist before the module is first loaded —
// initUI's bindings for drawer/toggle/scrim go through those module
// constants and would otherwise point at detached nodes.
const MARKUP = `
<button class="tab-scroll-button" data-tab-scroll="prev">‹</button>
<div class="inspector-tabs" role="tablist">
  <button data-inspector="edit" role="tab" class="is-active">Edit</button>
  <button data-inspector="layers" role="tab">Layers</button>
  <button data-inspector="insights" role="tab">Insights</button>
  <button data-inspector="history" role="tab">History</button>
  <button data-inspector="pipeline" role="tab">Pipeline</button>
</div>
<button class="tab-scroll-button" data-tab-scroll="next">›</button>
<aside id="inspector">
  <section id="edit-panel" class="inspector-content">
    <div class="inspector-quick-actions" data-contextual-actions>
      <button class="quick-action" data-panel="adjustments" data-context="image">Adjust</button>
      <button class="quick-action" data-panel="smart-crop" data-context="image">Smart Crop</button>
      <button class="quick-action" data-panel="drawing" data-context="brush">Draw</button>
      <button class="quick-action" data-panel="history">History</button>
      <button class="quick-action" data-panel="pipeline">Pipeline</button>
      <button class="quick-action" data-panel="insights">Intelligence</button>
      <button class="quick-action" data-panel="shortcuts">Shortcuts</button>
      <button class="quick-action" data-panel="recipe">Recipe</button>
    </div>
    <details id="adjustments-accordion" class="panel-accordion"></details>
    <details id="smart-crop-accordion" class="panel-accordion"></details>
    <details id="background-accordion" class="panel-accordion"></details>
    <details id="pipeline-accordion" class="panel-accordion"></details>
  </section>
  <section id="layers-panel" class="inspector-content" hidden></section>
  <section id="insights-panel" class="inspector-content" hidden></section>
  <section id="history-panel" class="inspector-content" hidden></section>
  <section id="pipeline-panel" class="inspector-content" hidden></section>
</aside>
<div id="inspector-scrim" hidden></div>
<button data-action="inspector-toggle" aria-expanded="false"></button>
<div class="tool-rail">
  <button data-tool="select" class="is-active" aria-pressed="true"></button>
  <button data-tool="brush" aria-pressed="false"></button>
  <button data-tool="crop" aria-pressed="false"></button>
</div>
<button id="error-retry"></button>
<button id="error-dismiss"></button>
<div class="avatar"></div>
<button data-action="help">Help</button>
<div id="shortcuts-dialog" class="dialog-backdrop" hidden><h2>Keyboard</h2><button id="shortcuts-cancel"></button><button id="shortcuts-cancel-secondary"></button></div>
<div id="help-dialog" class="dialog-backdrop" hidden><h2>Help</h2><button id="help-cancel"></button><button id="help-cancel-secondary"></button></div>
<div id="toast"></div>`;

let ui;
const mqChangeListeners = [];

beforeAll(async () => {
  document.body.innerHTML = MARKUP;
  // jsdom ships neither scrollIntoView nor scrollBy, both of which the
  // tab scroller and focusPanel reach for.
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  Element.prototype.scrollBy = function scrollBy() {};
  window.matchMedia = () => ({
    matches: false,
    addEventListener: (_type, fn) => { mqChangeListeners.push(fn); },
    removeEventListener: () => {},
  });
  ui = await import('./ui-manager.js');
  ui.initUI();
});

describe('ui-manager — interactions', () => {
  const toast = () => document.getElementById('toast').textContent;

  beforeEach(() => {
    ui.setEditorReady(true);
    document.querySelectorAll('[data-tool]').forEach((b) => {
      b.classList.remove('is-active');
      b.setAttribute('aria-pressed', 'false');
    });
    document.querySelector('[data-tool="select"]').classList.add('is-active');
  });

  describe('lazy panel activation', () => {
    it('fires the registered activator when a panel opens, exactly once', () => {
      const calls = vi.fn();
      ui.onPanelOpened('insights', calls);
      ui.switchInspector('insights');
      expect(calls).toHaveBeenCalledOnce();
      ui.switchInspector('insights');
      ui.switchInspector('insights');
      expect(calls).toHaveBeenCalledOnce(); // one-shot: mount runs once
    });

    it('an async activator that fails toasts instead of stranding an empty panel', async () => {
      ui.onPanelOpened('insights', async () => {
        throw new Error('chunk failed');
      });
      ui.switchInspector('insights');
      await vi.waitFor(() => expect(toast()).toContain('Could not load the insights panel: chunk failed'));
    });

    it('a synchronously throwing activator is caught the same way', () => {
      ui.onPanelOpened('pipeline', () => {
        throw new Error('bad module');
      });
      expect(() => ui.switchInspector('pipeline')).not.toThrow();
      expect(toast()).toContain('bad module');
    });

    it('opening an accordion directly also arms its lazy mount', () => {
      const calls = vi.fn();
      ui.onPanelOpened('background', calls);
      const section = document.getElementById('background-accordion');
      section.open = true;
      section.dispatchEvent(new Event('toggle'));
      expect(calls).toHaveBeenCalledOnce();
    });
  });

  describe('tool selection', () => {
    it('clicking a tool marks it active, mirrors aria-pressed, and toasts', () => {
      document.querySelector('[data-tool="brush"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const brush = document.querySelector('[data-tool="brush"]');
      expect(brush.classList.contains('is-active')).toBe(true);
      expect(brush.getAttribute('aria-pressed')).toBe('true');
      expect(document.querySelector('[data-tool="select"]').getAttribute('aria-pressed')).toBe('false');
      expect(toast()).toBe('Brush tool selected');
    });
  });

  describe('quick actions', () => {
    it('the shortcuts button opens the shortcuts dialog', () => {
      document.querySelector('[data-panel="shortcuts"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('shortcuts-dialog').hidden).toBe(false);
      document.getElementById('shortcuts-cancel').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('shortcuts-dialog').hidden).toBe(true);
    });

    it('the avatar also opens it, and the secondary cancel closes it', () => {
      document.querySelector('.avatar').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('shortcuts-dialog').hidden).toBe(false);
      document.getElementById('shortcuts-cancel-secondary').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('shortcuts-dialog').hidden).toBe(true);
    });

    it('a ready-panel action switches to Edit and flashes the accordion', () => {
      document.querySelector('[data-panel="adjustments"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const section = document.getElementById('adjustments-accordion');
      expect(section.open).toBe(true);
      expect(section.classList.contains('is-flash')).toBe(true);
      // closeOtherAccordions ran: the pipeline accordion is closed again
      expect(document.getElementById('pipeline-accordion').open).toBe(false);
    });

    it('a history quick action switches the inspector tab', () => {
      document.querySelector('[data-panel="history"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('history-panel').hidden).toBe(false);
      expect(document.getElementById('edit-panel').hidden).toBe(true);
    });

    it('an unbuilt panel action is inert with a message', () => {
      const button = document.querySelector('[data-panel="recipe"]');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(toast()).toBe('Recipe arrives in a later stage');
    });
  });

  describe('switchInspector', () => {
    it('blocks non-Edit tabs until the editor is ready', () => {
      ui.switchInspector('edit');
      ui.setEditorReady(false);
      ui.switchInspector('layers');
      expect(document.getElementById('layers-panel').hidden).toBe(true);
      expect(document.getElementById('edit-panel').hidden).toBe(false);
      // Edit remains reachable
      ui.switchInspector('edit');
      expect(document.getElementById('edit-panel').hidden).toBe(false);
      ui.setEditorReady(true);
    });

    it('selecting a tab toggles aria-selected and the roving tabindex', () => {
      ui.switchInspector('layers');
      const layersTab = document.querySelector('[data-inspector="layers"]');
      const editTab = document.querySelector('[data-inspector="edit"]');
      expect(layersTab.getAttribute('aria-selected')).toBe('true');
      expect(layersTab.getAttribute('tabindex')).toBe('0');
      expect(editTab.getAttribute('aria-selected')).toBe('false');
      expect(editTab.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('keyboard tablist', () => {
    it('ArrowRight focuses and activates the next tab; End jumps to the last', () => {
      const tabs = [...document.querySelectorAll('[data-inspector]')];
      tabs[0].focus();
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');

      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    });

    it('ArrowLeft wraps from the first tab to the last', () => {
      const tabs = [...document.querySelectorAll('[data-inspector]')];
      tabs[0].focus();
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    });

    it('keys not handled by the tablist do nothing', () => {
      const tabs = [...document.querySelectorAll('[data-inspector]')];
      tabs[0].focus();
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      expect(document.activeElement).toBe(tabs[0]);
    });
  });

  describe('mobile drawer', () => {
    it('the toggle button opens and closes it', () => {
      const toggle = document.querySelector('[data-action="inspector-toggle"]');
      const inspector = document.getElementById('inspector');
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(inspector.classList.contains('is-open')).toBe(true);
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(inspector.classList.contains('is-open')).toBe(false);
    });

    it('a scrim tap closes it', () => {
      const scrim = document.getElementById('inspector-scrim');
      const inspector = document.getElementById('inspector');
      scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(inspector.classList.contains('is-open')).toBe(false);
    });

    it('Escape closes an open drawer', () => {
      ui.openInspectorDrawer();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.getElementById('inspector').classList.contains('is-open')).toBe(false);
    });
  });

  describe('contextual action visibility', () => {
    it('the crop context keeps image actions visible but hides other contexts', async () => {
      const { setState } = await import('./app-state.js');
      const adjust = document.querySelector('[data-panel="adjustments"]');
      const draw = document.querySelector('[data-panel="drawing"]');
      setState({ editorReady: true, hasImage: true, activeTool: 'crop' });
      expect(adjust.hidden).toBe(false); // crop borrows the image actions
      expect(draw.hidden).toBe(true);
      setState({ activeTool: 'select', hasImage: true, editorReady: true });
      expect(draw.hidden).toBe(true); // select = image context, brush hidden
      setState({ activeTool: 'brush', hasImage: true, editorReady: true });
      expect(draw.hidden).toBe(false);
      expect(adjust.hidden).toBe(true); // brush hides the image-only actions
      setState({ activeTool: 'select', hasImage: true, editorReady: true });
    });
  });

  describe('media query change', () => {
    it('a viewport returning to desktop closes an open drawer', () => {
      ui.openInspectorDrawer();
      expect(document.getElementById('inspector').classList.contains('is-open')).toBe(true);
      for (const fn of mqChangeListeners) fn({ matches: false });
      expect(document.getElementById('inspector').classList.contains('is-open')).toBe(false);
    });
  });

  describe('transient busy controls', () => {
    it('processing disables every tool/action and restores prior state after', async () => {
      const { setState } = await import('./app-state.js');
      const brush = document.querySelector('[data-tool="brush"]');
      const retry = document.getElementById('error-retry');
      setState({ processing: { active: true, operation: 'Grain', progress: null, cancellable: false } });
      expect(brush.disabled).toBe(true);
      expect(retry.disabled).toBe(false); // error controls are exempt
      setState({ processing: { active: false, operation: null, progress: null, cancellable: false } });
      expect(brush.disabled).toBe(false);
    });

    it('a control already disabled by pre-upload stays disabled after the pass', async () => {
      const { setState } = await import('./app-state.js');
      const brush = document.querySelector('[data-tool="brush"]');
      brush.disabled = true; // simulates setEditorReady(false)
      setState({ processing: { active: true, operation: 'X', progress: null, cancellable: false } });
      setState({ processing: { active: false, operation: null, progress: null, cancellable: false } });
      expect(brush.disabled).toBe(true);
    });
  });

  describe('withBusy', () => {
    it('runs without a button instead of blocking', async () => {
      const result = await ui.withBusy(null, 'msg', async () => 7);
      expect(result).toBe(7);
    });

    it('refuses a second operation while one is active', async () => {
      const { setState } = await import('./app-state.js');
      setState({ processing: { active: true, operation: 'busy', progress: null, cancellable: false } });
      const btn = document.createElement('button');
      const fn = vi.fn();
      expect(await ui.withBusy(btn, 'x', fn)).toBe(null);
      expect(fn).not.toHaveBeenCalled();
      setState({ processing: { active: false, operation: null, progress: null, cancellable: false } });
    });

    it('marks the button, runs, and restores everything on success', async () => {
      const btn = document.createElement('button');
      btn.innerHTML = '<b>Go</b>';
      btn.setAttribute('aria-label', 'go somewhere');
      const status = document.createElement('span');
      const result = await ui.withBusy(btn, 'Graining', async () => 'done', { status });
      expect(result).toBe('done');
      expect(btn.innerHTML).toBe('<b>Go</b>');
      expect(btn.getAttribute('aria-label')).toBe('go somewhere');
      expect(btn.disabled).toBe(false);
      expect(btn.hasAttribute('aria-busy')).toBe(false);
      expect(status.textContent).toBe('Graining…');
    });

    it('on failure reports, restores the button, and returns null', async () => {
      const btn = document.createElement('button');
      const result = await ui.withBusy(btn, 'Boom', async () => {
        throw new Error('kaboom');
      });
      expect(result).toBe(null);
      expect(btn.disabled).toBe(false);
      expect(btn.hasAttribute('aria-busy')).toBe(false);
    });

    it('drops a pre-existing aria-label when none was there', async () => {
      const btn = document.createElement('button');
      await ui.withBusy(btn, 'Plain', async () => {});
      expect(btn.hasAttribute('aria-label')).toBe(false);
    });
  });

  describe('tab scroller', () => {
    it('shows the scroll buttons only when the strip overflows', () => {
      const strip = document.querySelector('.inspector-tabs');
      Object.defineProperty(strip, 'scrollWidth', { value: 1000, configurable: true });
      Object.defineProperty(strip, 'clientWidth', { value: 300, configurable: true });
      strip.scrollLeft = 0;
      strip.dispatchEvent(new Event('scroll'));
      const prev = document.querySelector('[data-tab-scroll="prev"]');
      const next = document.querySelector('[data-tab-scroll="next"]');
      expect(prev.hidden).toBe(false);
      expect(prev.disabled).toBe(true); // at the start
      expect(next.disabled).toBe(false);
      strip.scrollLeft = 700; // fully scrolled: 700+300 >= 999
      strip.dispatchEvent(new Event('scroll'));
      expect(next.disabled).toBe(true);
      expect(prev.disabled).toBe(false);
    });

    it('scroll buttons move the strip left and right', () => {
      const strip = document.querySelector('.inspector-tabs');
      const spy = vi.spyOn(strip, 'scrollBy');
      document.querySelector('[data-tab-scroll="next"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
      spy.mockClear();
      document.querySelector('[data-tab-scroll="prev"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(spy).toHaveBeenCalledWith({ left: expect.any(Number), behavior: 'smooth' });
      const arg = spy.mock.calls[0][0];
      expect(arg.left).toBeLessThan(0);
    });
  });

  describe('misc chrome', () => {
    it('help opens and closes through both cancel paths', () => {
      document.querySelector('[data-action="help"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('help-dialog').hidden).toBe(false);
      document.getElementById('help-cancel').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('help-dialog').hidden).toBe(true);
      document.querySelector('[data-action="help"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('help-cancel-secondary').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('help-dialog').hidden).toBe(true);
    });

    it('error controls retry and dismiss without throwing', async () => {
      const { setState } = await import('./app-state.js');
      setState({ error: { active: true, code: 'X', message: 'x', operation: 'x', retryable: false } });
      expect(() => document.getElementById('error-dismiss').dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
      expect(() => document.getElementById('error-retry').dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
      setState({ error: null });
    });
  });
});
