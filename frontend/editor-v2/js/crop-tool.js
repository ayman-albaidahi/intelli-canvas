import { withBusy } from './ui-manager.js';
import { setState } from './app-state.js';
import {
  CROP_HANDLES, clampCropRect, cropSelectionToSource, moveCropRect, resizeCropRect,
} from './transform-logic.js';

// A selection smaller than this in view pixels maps to under 2 source pixels
// once rounded, which the API would reject. The floor scales with zoom so a
// heavily zoomed-out image keeps a grabbable box.
const MIN_SOURCE_PX = 2;
const MIN_VIEW_PX = 44;

export class CropTool {
  constructor(canvasManager, card, apiClient, showToast) {
    this.canvasManager = canvasManager;
    this.card = card;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.overlay = document.querySelector('#crop-overlay');
    this.selection = null;
    this.drag = null;
    this.active = false;
    this.bindEvents();
  }

  bindEvents() {
    document.querySelector('[data-tool="crop"]')?.addEventListener('click', () => this.activate());
    document.querySelector('#crop-apply')?.addEventListener('click', () => this.apply());
    document.querySelector('#crop-cancel')?.addEventListener('click', () => this.deactivate());
    document.querySelector('#crop-reset')?.addEventListener('click', () => this.reset());
    this.overlay?.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.overlay?.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.overlay?.addEventListener('pointerup', () => this.stopDrag());
    this.overlay?.addEventListener('pointercancel', () => this.stopDrag());
    window.addEventListener('resize', () => { if (this.active) this.syncToImage(); });
  }

  // The smallest selection worth keeping: never below the touch floor, and
  // never below what maps to a couple of source pixels at the current zoom.
  minSize() {
    const scale = this.canvasManager.scale || 1;
    return Math.max(MIN_VIEW_PX, Math.ceil(MIN_SOURCE_PX / scale) + 1);
  }

  activate() {
    if (!this.canvasManager.hasImage()) {
      setState({ activeTool: 'select' });
      return this.showToast('Choose an image before cropping');
    }
    this.active = true;
    // Panning the image while a selection is on screen desyncs the two: the
    // overlay stays put and Apply maps a stale box against the moved image.
    // The image is locked in place for the duration of the crop instead.
    this.canvasManager.panLocked = true;
    this.overlay.hidden = false;
    document.querySelector('#crop-controls').hidden = false;
    this.syncToImage();
    this.showToast('Drag the handles to resize, or the middle to move');
  }

  syncToImage() {
    const rect = this.canvasManager.getImageRect();
    if (!rect) return;
    // An existing selection is re-clamped: a window resize moves the image,
    // and a box left where the image used to be is how Apply came to send
    // out-of-bounds coordinates.
    this.selection = this.selection
      ? clampCropRect(this.selection, rect, this.minSize())
      : clampCropRect({ x: rect.x + rect.width * .1, y: rect.y + rect.height * .1, width: rect.width * .8, height: rect.height * .8 }, rect, this.minSize());
    this.render();
  }

  render() {
    if (!this.selection) return;
    const { x, y, width, height } = this.selection;
    this.overlay.style.left = `${x}px`; this.overlay.style.top = `${y}px`; this.overlay.style.width = `${width}px`; this.overlay.style.height = `${height}px`;

    // The readout reports what the crop will actually produce — source
    // pixels — rather than view pixels, which change with zoom.
    const payload = cropSelectionToSource(this.selection, this.canvasManager.getImageRect(), this.canvasManager.getSourceDimensions());
    const size = document.querySelector('#crop-size');
    const contextSize = document.querySelector('#crop-context-size');
    const apply = document.querySelector('#crop-apply');
    if (payload) {
      const label = `${payload.width} × ${payload.height} px`;
      if (size) size.textContent = label;
      if (contextSize) contextSize.textContent = label;
      if (apply) apply.disabled = false;
    } else {
      if (size) size.textContent = 'Selection too small';
      if (contextSize) contextSize.textContent = 'Selection too small';
      if (apply) apply.disabled = true;
    }
  }

  onPointerDown(event) {
    if (!this.active || !this.selection) return;
    const handle = event.target?.dataset?.handle;
    // A handle drag resizes; anywhere else on the overlay moves the box.
    const mode = CROP_HANDLES.includes(handle) ? handle : 'move';
    this.drag = { mode, x: event.clientX, y: event.clientY, origin: { ...this.selection } };
    this.overlay.setPointerCapture(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.drag) return;
    const bounds = this.canvasManager.getImageRect();
    if (!bounds) return;
    // Deltas are taken in client coordinates: the image cannot pan while the
    // crop is open, so client and stage deltas agree for the whole drag.
    const current = { x: event.clientX, y: event.clientY };
    const start = { x: this.drag.x, y: this.drag.y };
    this.selection = this.drag.mode === 'move'
      ? moveCropRect(this.drag.origin, start, current, bounds, this.minSize())
      : resizeCropRect(this.drag.origin, start, current, this.drag.mode, bounds, { minSize: this.minSize(), lockAspectRatio: event.shiftKey });
    this.render();
  }

  stopDrag() { this.drag = null; }

  async apply() {
    if (!this.active || !this.selection) return;
    const button = document.querySelector('#crop-apply');
    await withBusy(button, 'Applying crop', async () => {
      // The final clamp happens here, at the boundary: whatever the drag or a
      // view change left behind, the payload is clamped and validated before
      // any request leaves. An invalid box disables Apply and is never sent.
      const bounds = this.canvasManager.getImageRect();
      const payload = cropSelectionToSource(
        clampCropRect(this.selection, bounds, this.minSize()),
        bounds,
        this.canvasManager.getSourceDimensions()
      );
      if (!payload) {
        this.showToast('The crop selection is too small or sits outside the image');
        this.render();
        return;
      }
      try {
        const image = await this.apiClient.transform('crop', payload);
        await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(image.image_id), image);
        document.dispatchEvent(new CustomEvent('ic-operation'));
        this.deactivate();
        this.showToast('Crop applied');
      } catch (error) { this.showToast(error.message); throw error; }
    }, { operation: 'Applying crop', retry: () => this.apply() });
  }

  reset() {
    this.selection = null;
    this.syncToImage();
  }

  deactivate() {
    this.active = false;
    this.drag = null;
    this.selection = null;
    this.canvasManager.panLocked = false;
    this.overlay.hidden = true;
    document.querySelector('#crop-controls').hidden = true;
    setState({ activeTool: 'select' });
  }
}
