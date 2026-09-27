import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ComparisonTool } from './comparison-tool.js';

// The comparison slider draws the same image twice — raw, and with the
// live adjustments filter — and reveals the edited half by clip-path. The
// maths worth pinning in jsdom is the state machine (toggle gating, slider
// -> clip geometry) and the canvas sizing; the pixel drawing is driven by
// the browser suite. getContext returns a recording no-op context.

function fixture() {
  document.body.innerHTML = `
    <button data-action="compare">Compare</button>
    <div id="comparison-view" hidden style="width: 500px; height: 400px">
      <div class="stack">
        <canvas id="comparison-original"></canvas>
        <canvas id="comparison-edited"></canvas>
      </div>
      <span id="comparison-handle"></span>
    </div>
    <input id="comparison-slider" type="range" value="50">
  `;
  // jsdom gives every canvas a null getContext; hand both the same
  // recording surface so sizing and draw calls are observable.
  for (const id of ['comparison-original', 'comparison-edited']) {
    const canvas = document.getElementById(id);
    const calls = [];
    canvas.getContext = () => new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'canvas') return canvas;
        return (...args) => { calls.push([prop, ...args]); };
      },
      set: (_t, prop, value) => { calls.push([prop, value]); return true; },
    });
    canvas.__calls = calls;
  }
}

const RECTS = { width: 500, height: 400 };

function makeTool({ hasImage = true, image = { naturalWidth: 400, naturalHeight: 300 }, adjustmentsOn = true } = {}) {
  const canvasManager = {
    hasImage: () => hasImage,
    getImage: () => image,
    previewEnabled: adjustmentsOn,
    adjustmentFilter: () => 'brightness(120%)',
  };
  const showToast = vi.fn();
  return { tool: new ComparisonTool(canvasManager, showToast), showToast, canvasManager };
}

describe('comparison tool', () => {
  beforeEach(() => {
    fixture();
    // the view's bounding rect drives canvas sizing
    document.getElementById('comparison-view').getBoundingClientRect = () => ({ ...RECTS, left: 0, top: 0 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('refuses without an image and toasts', () => {
    const { showToast } = makeTool({ hasImage: false });
    document.querySelector('[data-action="compare"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('comparison-view').hidden).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Choose an image before comparing');
  });

  it('toggles the overlay and draws once per open', () => {
    const { tool, showToast } = makeTool();
    tool.toggle();
    expect(document.getElementById('comparison-view').hidden).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Drag the divider to compare original and edited');
    tool.toggle();
    expect(document.getElementById('comparison-view').hidden).toBe(true);
  });

  it('sizes both canvases from the view box times the device ratio', () => {
    const { tool } = makeTool();
    tool.render();
    const original = document.getElementById('comparison-original');
    const ratio = window.devicePixelRatio || 1;
    expect(original.width).toBe(Math.floor(RECTS.width * ratio));
    expect(original.height).toBe(Math.floor(RECTS.height * ratio));
    expect(original.style.width).toBe(`${RECTS.width}px`);
  });

  it('the edited canvas gets the live adjustment filter; the original does not', () => {
    const { tool } = makeTool();
    tool.render();
    const edited = document.getElementById('comparison-edited').__calls;
    const original = document.getElementById('comparison-original').__calls;
    expect(edited.some(([prop, v]) => prop === 'filter' && v.includes('brightness(120%)'))).toBe(true);
    expect(original.some(([prop]) => prop === 'filter')).toBe(false);
  });

  it('with preview off the edited half is unfiltered', () => {
    const { tool } = makeTool({ adjustmentsOn: false });
    tool.render();
    const edited = document.getElementById('comparison-edited').__calls;
    expect(edited.some(([prop, v]) => prop === 'filter' && v === 'none')).toBe(true);
  });

  it('the slider position drives the clip and the handle at the same split', () => {
    makeTool();
    document.getElementById('comparison-slider').value = '35';
    document.getElementById('comparison-slider').dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('.stack').style.clipPath).toBe('inset(0 0 0 35%)');
    expect(document.getElementById('comparison-handle').style.left).toBe('35%');
  });

  it('a resize re-renders only while the view is open', () => {
    const { tool } = makeTool();
    const spy = vi.spyOn(tool, 'render');
    window.dispatchEvent(new Event('resize'));
    expect(spy).not.toHaveBeenCalled();
    tool.toggle();
    spy.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('render with no image (deleted between sessions) is inert', () => {
    const { tool } = makeTool({ image: null });
    expect(() => tool.render()).not.toThrow();
  });
});
