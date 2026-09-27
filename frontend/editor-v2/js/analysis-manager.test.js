import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AnalysisManager } from './analysis-manager.js';
import { bus, events } from './lib/events.js';

// The analysis panel is a read-only renderer over the backend's
// suggestions envelope plus a per-suggestion action strip (preview /
// dismiss / apply). The fixture mirrors the #insights-panel ids from
// index.html; the api client fake returns the shaped report the backend
// produces.

function fixture() {
  document.body.innerHTML = `
    <span id="analysis-status">—</span>
    <div id="analysis-quality" hidden><strong id="analysis-quality-score">—</strong></div>
    <div id="analysis-metrics" hidden></div>
    <div id="analysis-findings" hidden></div>
    <div id="suggestion-list" role="list"></div>
    <div id="suggestion-card" hidden>
      <span id="suggestion-type"></span>
      <p id="suggestion-reason"></p>
      <p id="suggestion-confidence"></p>
      <div id="suggestion-source"></div>
      <div id="suggestion-evidence"></div>
      <div id="suggestion-parameters"></div>
      <img id="suggestion-preview" hidden>
      <button data-action="preview-suggestion">Preview</button>
      <button data-action="dismiss-suggestion">Dismiss</button>
      <button data-action="apply-suggestion">Apply</button>
    </div>
    <button data-action="analyze-image">Analyze</button>
  `;
}

function report(overrides = {}) {
  return {
    quality_score: 78,
    cache_hit: false,
    metrics: {
      width: 800, height: 600, brightness_mean: 128.4, brightness_median: 130,
      contrast_stddev: 41.2, sharpness_score: 96, noise_score: 12,
      clipped_shadow_ratio: 0.0031, clipped_highlight_ratio: 0.0123,
    },
    findings: [
      { code: 'LOW_SHARPNESS', title: 'Sharpness below target', severity: 'medium', explanation: 'Edges are soft.', evidence: { score: 96, threshold: 120 } },
    ],
    suggestions: [
      {
        type: 'SHARPEN', title: 'Detail sharpen', reason: 'Boost edge detail.',
        confidence: 0.82, rule_version: '1.2.0', source_findings: ['LOW_SHARPNESS'],
        evidence: { threshold: 120 }, pipeline: { nodes: [{ operation: 'sharpen', parameters: { amount: 1.5 } }] },
      },
      {
        type: 'CONTRAST', title: 'Add contrast', reason: 'Widen tonal range.',
        confidence: 0.5, source_findings: ['LOW_CONTRAST'],
        evidence: {}, pipeline: { nodes: [{ operation: 'contrast', parameters: { value: 120 } }, { operation: 'brightness', parameters: { value: 105 } }] },
      },
    ],
    ...overrides,
  };
}

function makeDeps(r = report()) {
  const api = {
    imageId: 'img-1',
    suggestions: vi.fn(async () => r),
    previewSuggestion: vi.fn(async () => new Blob(['p'])),
    dismissSuggestion: vi.fn(async () => ({})),
    applySuggestion: vi.fn(async () => ({ image: { cache_hit: false } })),
    contentUrl: (id) => `http://x/api/images/${id}/content`,
  };
  const canvasManager = { loadFromUrl: vi.fn(async () => {}) };
  const showToast = vi.fn();
  return { api, canvasManager, showToast };
}

function makeManager(deps) {
  return new AnalysisManager({
    canvasManager: deps.canvasManager,
    apiClient: deps.api,
    showToast: deps.showToast,
  });
}

function click(selector) {
  document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('analysis manager', () => {
  let deps;
  let mgr;
  let realCreate;
  let realRevoke;

  beforeEach(() => {
    fixture();
    realCreate = URL.createObjectURL;
    realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    deps = makeDeps();
    mgr = makeManager(deps);
  });

  afterEach(() => {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    bus.clear();
    document.body.innerHTML = '';
  });

  describe('run()', () => {
    it('gates on an uploaded image', async () => {
      deps.api.imageId = null;
      click('[data-action="analyze-image"]');
      expect(deps.api.suggestions).not.toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith('ارفع صورة أولاً');
    });

    it('renders the report and shows the first suggestion', async () => {
      click('[data-action="analyze-image"]');
      await vi.waitFor(() => expect(deps.showToast).not.toHaveBeenCalled());
      expect(deps.api.suggestions).toHaveBeenCalledOnce();
      expect(document.getElementById('analysis-quality-score').textContent).toBe('78 / 100');
      // clipping ratios are rendered as percentages to 2 decimals
      expect(document.getElementById('analysis-metrics').textContent).toContain('0.31%');
      expect(document.getElementById('analysis-metrics').textContent).toContain('1.23%');
      expect(document.querySelector('#suggestion-card').hidden).toBe(false);
      expect(document.getElementById('suggestion-type').textContent).toBe('SHARPEN');
      expect(document.getElementById('suggestion-confidence').textContent).toBe('الثقة: 82%');
      expect(document.getElementById('analysis-status').textContent).toBe('اكتمل التحليل');
    });

    it('a cached report is announced as such', async () => {
      mgr = makeManager(makeDeps(report({ cache_hit: true })));
      await mgr.run();
      expect(document.getElementById('analysis-status').textContent).toBe('جاهز — من الذاكرة المؤقتة');
    });

    it('empty findings say so instead of rendering nothing', async () => {
      mgr = makeManager(makeDeps(report({ findings: [] })));
      await mgr.run();
      expect(document.getElementById('analysis-findings').textContent).toBe('لا مشكلات مرصودة.');
    });

    it('a failed run reports in the status and the findings box', async () => {
      deps.api.suggestions.mockRejectedValueOnce(new Error('backend offline'));
      await mgr.run();
      expect(document.getElementById('analysis-status').textContent).toBe('تعذر التحليل — حاول مرة أخرى');
      expect(document.getElementById('analysis-findings').textContent).toContain('تعذر تحميل نتائج التحليل');
      expect(deps.showToast).toHaveBeenCalledWith('backend offline');
      expect(mgr.busy).toBe(false);
    });

    it('a second run while busy is ignored', async () => {
      let release;
      deps.api.suggestions.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
      const first = mgr.run();
      await mgr.run(); // busy no-op
      expect(deps.api.suggestions).toHaveBeenCalledOnce();
      release(report());
      await first;
    });

    it('the analyze button is disabled and flagged while running', async () => {
      let release;
      deps.api.suggestions.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
      const first = mgr.run();
      expect(document.querySelector('[data-action="analyze-image"]').disabled).toBe(true);
      release(report());
      await first;
      expect(document.querySelector('[data-action="analyze-image"]').disabled).toBe(false);
    });
  });

  describe('suggestion list', () => {
    beforeEach(async () => {
      await mgr.run();
    });

    it('renders one item per suggestion with confidence and step count', () => {
      const items = document.querySelectorAll('#suggestion-list [data-suggestion-type]');
      expect([...items].map((i) => i.dataset.suggestionType)).toEqual(['SHARPEN', 'CONTRAST']);
      const [first, second] = items;
      expect(first.textContent).toContain('82% confidence · 1 step');
      expect(second.textContent).toContain('50% confidence · 2 steps');
    });

    it('clicking an item selects it and marks the list', async () => {
      click('#suggestion-list [data-suggestion-type="CONTRAST"]');
      expect(mgr.activeSuggestion.type).toBe('CONTRAST');
      expect(document.querySelector('[data-suggestion-type="CONTRAST"]').classList.contains('is-selected')).toBe(true);
      expect(document.getElementById('suggestion-confidence').textContent).toBe('الثقة: 50%');
      expect(document.getElementById('suggestion-parameters').textContent).toContain('contrast');
    });

    it('a suggestion without explicit title falls back to its type', async () => {
      const bare = report({ suggestions: [{ type: 'GAMMA', reason: 'r', confidence: 0.3 }] });
      const bareMgr = makeManager(makeDeps(bare));
      await bareMgr.run();
      expect(document.querySelector('#suggestion-list [data-suggestion-type="GAMMA"]').textContent).toContain('GAMMA');
    });
  });

  describe('preview()', () => {
    beforeEach(async () => {
      await mgr.run();
    });

    it('gates on an active suggestion', async () => {
      mgr.activeSuggestion = null;
      await mgr.preview();
      expect(deps.showToast).toHaveBeenCalledWith('شغّل التحليل أولاً');
      expect(deps.api.previewSuggestion).not.toHaveBeenCalled();
    });

    it('fetches the preview and revokes the previous object URL', async () => {
      await mgr.preview();
      expect(deps.api.previewSuggestion).toHaveBeenCalledWith('img-1', 'SHARPEN');
      expect(document.getElementById('suggestion-preview').hidden).toBe(false);
      expect(document.getElementById('suggestion-preview').src).toBe('blob:fake');
      expect(deps.showToast).toHaveBeenCalledWith('معاينة الاقتراح جاهزة');

      await mgr.preview();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });

    it('a failed preview toasts the error', async () => {
      deps.api.previewSuggestion.mockRejectedValueOnce(new Error('no preview'));
      await mgr.preview();
      expect(deps.showToast).toHaveBeenCalledWith('no preview');
    });
  });

  describe('dismiss()', () => {
    beforeEach(async () => {
      await mgr.run();
    });

    it('removes the suggestion from the list and hides the card', async () => {
      await mgr.dismiss();
      expect(deps.api.dismissSuggestion).toHaveBeenCalledWith('SHARPEN');
      expect([...document.querySelectorAll('#suggestion-list [data-suggestion-type]')].map((i) => i.dataset.suggestionType)).toEqual(['CONTRAST']);
      expect(document.getElementById('suggestion-card').hidden).toBe(true);
      expect(deps.showToast).toHaveBeenCalledWith('تم تجاهل الاقتراح');
    });

    it('a failed dismiss keeps the suggestion in place', async () => {
      deps.api.dismissSuggestion.mockRejectedValueOnce(new Error('dismiss failed'));
      await mgr.dismiss();
      expect(document.querySelectorAll('#suggestion-list [data-suggestion-type]')).toHaveLength(2);
      expect(deps.showToast).toHaveBeenCalledWith('dismiss failed');
    });

    it('without an active suggestion nothing is called', async () => {
      mgr.activeSuggestion = null;
      await mgr.dismiss();
      expect(deps.api.dismissSuggestion).not.toHaveBeenCalled();
    });
  });

  describe('apply()', () => {
    beforeEach(async () => {
      await mgr.run();
    });

    it('applies the pipeline, reloads the canvas, and emits the operation event after busy clears', async () => {
      const busyAtEmit = [];
      const off = bus.on(events.operation, () => busyAtEmit.push(mgr.busy));
      await mgr.apply();
      expect(deps.api.applySuggestion).toHaveBeenCalledWith('img-1', 'SHARPEN');
      expect(deps.canvasManager.loadFromUrl).toHaveBeenCalledWith('http://x/api/images/img-1/content', {});
      expect(deps.showToast).toHaveBeenCalledWith('تم تطبيق الـ Pipeline كسجل واحد');
      expect(mgr.busy).toBe(false);
      await vi.waitFor(() => expect(busyAtEmit).toHaveLength(1));
      expect(busyAtEmit[0]).toBe(false);
      off();
    });

    it('announces a cache hit', async () => {
      deps.api.applySuggestion.mockResolvedValueOnce({ image: { cache_hit: true } });
      await mgr.apply();
      expect(deps.showToast).toHaveBeenCalledWith('تم تطبيق الـ Pipeline كسجل واحد من الذاكرة المؤقتة');
    });

    it('a failure toasts and never emits the operation event', async () => {
      const off = bus.on(events.operation, () => {});
      deps.api.applySuggestion.mockRejectedValueOnce(new Error('apply failed'));
      await mgr.apply();
      expect(deps.showToast).toHaveBeenCalledWith('apply failed');
      expect(deps.canvasManager.loadFromUrl).not.toHaveBeenCalled();
      off();
    });

    it('concurrent applies are dropped', async () => {
      let release;
      deps.api.applySuggestion.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
      const first = mgr.apply();
      const second = mgr.apply();
      await second;
      expect(deps.api.applySuggestion).toHaveBeenCalledOnce();
      release({ image: { cache_hit: false } });
      await first;
    });
  });

  describe('reset()', () => {
    it('revokes the leaky blob URL and clears the card selection', async () => {
      await mgr.run();
      await mgr.preview();
      mgr.reset();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
      expect(mgr.activeSuggestion).toBe(null);
      expect(document.getElementById('suggestion-preview').hidden).toBe(true);
    });

    it('is safe before any preview existed', () => {
      expect(() => mgr.reset()).not.toThrow();
    });
  });
});
