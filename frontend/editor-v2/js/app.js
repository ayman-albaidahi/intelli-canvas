/**
 * The editor application lifecycle.
 *
 * Plan Phase 4 item 3 and diagnosis problem 3: the old main.js was one
 * straight-line script — authenticate, then initialise twenty managers in
 * a bare `if (authenticatedUser) { ... }` block with no boundary between
 * "start the app" and "the app is running", and no way to hold the parts
 * after construction or to take the editor down.
 *
 * EditorApp gives that script a shape:
 *   start()   -> authenticate; on success initialise, on failure leave the
 *                auth gate showing (the login screen is the whole UI at
 *                that point) and report it
 *   init()    -> the boot sequence, in exactly the order main.js ran it
 *   destroy() -> tear down every listener this class registered, so a
 *                re-instantiated editor never doubles a handler
 *   getService(name) -> the shared seam main.js wired by hand between
 *                managers (upload's facade over the lazy analysis manager)
 *
 * main.js keeps only what a browser entry point needs: import, construct,
 * start. Nothing else in the editor may import this module at page scope,
 * and it imports no per-page singletons except the ones it constructs.
 */

import { appState, setState } from './app-state.js';
import { initKeyboardShortcuts } from './keyboard-shortcuts.js';
import { createUploadManager } from './upload-manager.js';
import { handleError } from './lib/errors.js';
import { initThemeManager } from './theme-manager.js';
import {
  initUI,
  initDialogEscape,
  initDialogFocusTrap,
  onPanelOpened,
  setEditorReady,
  showToast,
} from './ui-manager.js';
import { CanvasManager } from './canvas-manager.js';
import { bindTransformTools } from './transform-tools.js';
import { CropTool } from './crop-tool.js';
import { initResizeTool } from './resize-tool.js';
import { LayerManager } from './layer-manager.js';
import { ObjectManager } from './object-manager.js';
import { ComparisonTool } from './comparison-tool.js';
import { AdjustmentsManager } from './adjustments-manager.js';
import { FiltersManager } from './filters-manager.js';
import { HistoryManager } from './history-manager.js';
import { ExportManager } from './export-manager.js';
import { SmartCropManager } from './smart-crop-manager.js';
import { ApiClient } from './api-client.js';
import { renderImageContextSummary } from './inspector-context-view.js';
import { AuthManager } from './auth-manager.js';
import { bus, events } from './lib/events.js';
import { qs, qsa } from './lib/dom.js';

export class EditorApp {
  constructor() {
    // Every cleanup this instance registers; destroy() runs them. Managers
    // that subscribe to the bus internally are removed by bus.clear().
    this._teardown = [];
    this.running = false;
    this.analysisManager = null; // lazy panel, see registerLazyPanels
    this.layerSaveTimer = null;
  }

  /**
   * Authenticate, then boot the editor if the user has a session.
   * Resolves true when running; false means the login gate stays up.
   */
  async start() {
    this.apiClient = new ApiClient();
    this.authManager = new AuthManager({ apiClient: this.apiClient });
    const authenticatedUser = await this.authManager.start();
    if (!authenticatedUser) return false;
    this.init();
    this.running = true;
    return true;
  }

  /** Named access to the wired services (the plan's getService seam). */
  getService(name) {
    return this[name] ?? null;
  }

  /**
   * The boot sequence, kept in the exact order main.js executed it:
   * chrome first (theme, UI, dialogs) so no manager binds to a widget that
   * cannot respond yet; canvas and object machinery next; the eager
   * managers; the lazy panel activators; then upload, keyboard, and the
   * zoom/tool readout wiring.
   */
  init() {
    initThemeManager();
    initUI();
    // Dialogs must trap focus and close on Escape before any other Escape
    // handler claims the key, so they are initialised alongside the rest of
    // the chrome. Their init functions return unsubscribers.
    this._teardown.push(initDialogEscape(), initDialogFocusTrap());
    renderImageContextSummary();

    this.bindDrawingControls();

    this.fileInput = qs('#file-input');
    this.emptyCanvas = qs('#empty-canvas');
    this.statusMessage = qs('#status-message');
    this.canvasManager = new CanvasManager(
      qs('#image-canvas'),
      qs('#canvas-card'),
    );
    bindTransformTools(this.canvasManager, this.apiClient, showToast);
    this.cropTool = new CropTool(this.canvasManager, qs('#canvas-card'), this.apiClient, showToast);
    initResizeTool(this.canvasManager, this.apiClient, showToast);
    this.objectManager = new ObjectManager(qs('#object-canvas'), showToast, this.canvasManager);
    new LayerManager(this.objectManager, {
      list: qs('#layers-list'),
      empty: qs('#layers-empty'),
      count: qs('#layer-count'),
      showToast,
    });

    // Selection and layer changes are the two callbacks the chrome needs on
    // the manager; keep whatever the managers set internally and wrap.
    const refreshSelectionState = this.objectManager.onSelectionChange;
    this.objectManager.onSelectionChange = (id) => {
      refreshSelectionState?.(id);
      setState({ selectedObjectId: id });
    };
    const refreshLayerPanel = this.objectManager.onChange;
    this.objectManager.onChange = () => {
      refreshLayerPanel?.();
      clearTimeout(this.layerSaveTimer);
      this.layerSaveTimer = setTimeout(() => {
        if (!this.apiClient.imageId) return;
        this.apiClient.saveLayers(this.objectManager.serializeLayers())
          .then((saved) => this.objectManager.applyPersistedLayers(saved))
          .catch((error) => handleError(error, 'layers.save'));
      }, 250);
    };

    new ComparisonTool(this.canvasManager, showToast);
    new AdjustmentsManager({ canvasManager: this.canvasManager, apiClient: this.apiClient, showToast });
    new FiltersManager({ canvasManager: this.canvasManager, apiClient: this.apiClient, showToast });
    new HistoryManager({ canvasManager: this.canvasManager, apiClient: this.apiClient, showToast });
    new ExportManager({ canvasManager: this.canvasManager, apiClient: this.apiClient, objectManager: this.objectManager, showToast });

    this.registerLazyPanels();
    this.smartCropManager = new SmartCropManager({ canvasManager: this.canvasManager, apiClient: this.apiClient, showToast });

    this.objectManager.setInteractive(true);
    this._teardown.push(
      bus.on(events.appStateChange, (state) =>
        this.objectManager.setInteractive(['select', 'brush', 'eraser', 'shape', 'text'].includes(state.activeTool))),
    );
    this.bindLayerActions();
    this.bindCropOverlay();
    this.bindCanvasViewActions();

    this.uploadManager = createUploadManager({
      apiClient: this.apiClient,
      canvasManager: this.canvasManager,
      restoreLayers: () => this.restoreLayers(),
      // analysisManager may still be the pending lazy mount when an upload
      // lands first; resetting a panel that was never opened is vacuous, so
      // a null-safe facade is the honest wiring.
      analysisManager: { reset: () => this.analysisManager?.reset() },
      smartCropManager: this.smartCropManager,
      setState,
      setEditorReady,
      renderImageContextSummary,
      showToast,
      fileInput: this.fileInput,
      statusMessage: this.statusMessage,
      emptyCanvas: this.emptyCanvas,
      documentName: qs('#document-name'),
      canvasSize: qs('#canvas-size'),
      saveState: qs('#save-state'),
    });
    this.uploadManager.bindDropZone(qs('#canvas-zone'));

    this._teardown.push(initKeyboardShortcuts({ canvasManager: this.canvasManager, fileInput: this.fileInput, showToast }));

    this._teardown.push(bus.on(events.appStateChange, (state) => {
      document.body.dataset.activeTool = state.activeTool || 'select';
      this.renderZoom();
    }));
    document.body.dataset.activeTool = appState.activeTool;
    this.renderZoom();
  }

  bindDrawingControls() {
    const controls = [
      ['brush-size', 'brush-size-value', (value) => value],
      ['brush-opacity', 'brush-opacity-value', (value) => `${value}%`],
      ['eraser-size', 'eraser-size-value', (value) => value],
      ['eraser-opacity', 'eraser-opacity-value', (value) => `${value}%`],
    ];
    controls.forEach(([inputId, outputId, format]) => {
      const input = qs(`#${inputId}`);
      const output = qs(`#${outputId}`);
      if (!input || !output) return;
      const render = () => {
        output.value = input.value;
        output.textContent = format(input.value);
      };
      input.addEventListener('input', render);
      render();
    });
    qs('#brush-reset')?.addEventListener('click', () => {
      const size = qs('#brush-size');
      const opacity = qs('#brush-opacity');
      size.value = '8';
      opacity.value = '100';
      size.dispatchEvent(new Event('input', { bubbles: true }));
      opacity.dispatchEvent(new Event('input', { bubbles: true }));
    });
    qs('#eraser-reset')?.addEventListener('click', () => {
      const size = qs('#eraser-size');
      const opacity = qs('#eraser-opacity');
      size.value = '8';
      opacity.value = '100';
      size.dispatchEvent(new Event('input', { bubbles: true }));
      opacity.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /**
   * The three heaviest panels mount on first open rather than at boot:
   * before an image is uploaded, nobody needs the background library fetch,
   * the pipeline state refresh, or the analysis bindings. The activators
   * run once, driven by ui-manager's onPanelOpened hook; the module loads
   * and the manager constructs itself with the same constructor it used
   * before.
   */
  registerLazyPanels() {
    onPanelOpened('insights', async () => {
      const { AnalysisManager } = await import('./analysis-manager.js');
      this.analysisManager = new AnalysisManager({ canvasManager: this.canvasManager, apiClient: this.apiClient, showToast });
    });
    onPanelOpened('pipeline', async () => {
      const { PipelineManager } = await import('./pipeline-manager.js');
      this.pipelineManager = new PipelineManager({ apiClient: this.apiClient, canvasManager: this.canvasManager, showToast });
    });
    onPanelOpened('background', async () => {
      const { BackgroundManager } = await import('./background-manager.js');
      this.backgroundManager = new BackgroundManager({ canvasManager: this.canvasManager, apiClient: this.apiClient, objectManager: this.objectManager, showToast });
    });
  }

  /** Layer add buttons and the image-layer file reader. */
  bindLayerActions() {
    qsa('[data-action="add-layer"]').forEach((button) => button.remove());
    qs('[data-action="add-image-layer"]')?.addEventListener('click', () => qs('#layer-image-input').click());
    qs('[data-action="add-shape-layer"]')?.addEventListener('click', () => {
      qs('[data-tool="shape"]').click();
      showToast('Drag on the canvas to draw the shape');
    });
    qs('[data-action="add-text-layer"]')?.addEventListener('click', () => {
      qs('[data-tool="text"]').click();
      showToast('Click on the canvas to place the text');
    });
    qs('#layer-image-input')?.addEventListener('change', ({ target }) => {
      const file = target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const img = new Image();
        img.addEventListener('load', () => this.objectManager.addImageLayer(img, file.name));
        img.src = reader.result;
      });
      reader.readAsDataURL(file);
      target.value = '';
    });
  }

  bindCropOverlay() {
    const cropOverlay = qs('#crop-overlay');
    cropOverlay.addEventListener('pointerdown', (event) => this.cropTool.onPointerDown(event));
    cropOverlay.addEventListener('pointermove', (event) => this.cropTool.onPointerMove(event));
    cropOverlay.addEventListener('pointerup', () => this.cropTool.stopDrag());
    // A cancelled drag (system gesture, window blur) must not leave the crop
    // tool mid-resize, or the next pointerdown would resume a drag that never
    // ended.
    cropOverlay.addEventListener('pointercancel', () => this.cropTool.stopDrag());
  }

  bindCanvasViewActions() {
    const canvasViewActions = {
      'zoom-in': () => this.canvasManager.zoomStep(10),
      'zoom-out': () => this.canvasManager.zoomStep(-10),
      'zoom-reset': () => this.canvasManager.setHundredPercent(),
      'zoom-100': () => this.canvasManager.setHundredPercent(),
      'zoom-actual': () => this.canvasManager.setActualPixels(),
      fit: () => {
        this.canvasManager.fit();
        showToast('Canvas fitted to workspace');
      },
      'fit-width': () => {
        this.canvasManager.fitWidth();
        showToast('Canvas fitted to width');
      },
      fullscreen: () => this.canvasManager.toggleFullscreen(),
      open: () => this.fileInput.click(),
    };
    for (const button of qsa('[data-action]')) {
      const action = canvasViewActions[button.dataset.action];
      if (action) button.addEventListener('click', action);
    }
  }

  /** Re-pull the persisted layer list for the current session image. */
  async restoreLayers() {
    if (!this.apiClient.imageId) return;
    try {
      await this.objectManager.loadLayers(await this.apiClient.layers());
    } catch (error) {
      handleError(error, 'layers.restore');
    }
  }

  renderZoom() {
    // Before any image is loaded there is nothing to zoom, so reporting a
    // percentage would describe a canvas that does not exist.
    const value = this.canvasManager.hasImage() ? `${appState.zoom}%` : '—';
    qsa('[data-zoom-display]').forEach((element) => {
      element.textContent = value;
    });
  }

  /**
   * Tear down what this instance registered. The auth gate and login
   * listeners are the AuthManager's own; managers that subscribe to the bus
   * internally (history, filters, ...) are removed wholesale by bus.clear(),
   * which is correct here because an app instance owns the whole page.
   */
  destroy() {
    clearTimeout(this.layerSaveTimer);
    for (const off of this._teardown.splice(0)) {
      try {
        off();
      } catch (error) {
        console.error('[EditorApp] teardown threw', error);
      }
    }
    bus.clear();
    this.running = false;
  }
}
