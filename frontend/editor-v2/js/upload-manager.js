/**
 * Image upload, split out of main.js.
 *
 * Upload was the largest block of business logic in the bootstrap file:
 * the in-flight guard, the two triggers (file input and drop zone), and
 * the success/failure wiring that turns an uploaded image into an edited
 * document. It belongs in a module with explicit dependencies so the race
 * guard — the part that was silently wrong before the flag existed — is
 * unit-testable.
 *
 * A second upload started before the first finished would race: whichever
 * response lands last wins apiClient.imageId, and the canvas load guard can
 * disagree about which image is actually displayed. The flag makes a
 * mid-flight upload a no-op instead, and the drop-zone triggers are
 * disabled for the duration.
 */

import { bus, events } from './lib/events.js';

/**
 * @param {object} deps
 * @param {object} deps.apiClient `{ upload, contentUrl }`
 * @param {object} deps.canvasManager `{ loadFromUrl, getSourceDimensions }`
 * @param {() => Promise<void>} deps.restoreLayers
 * @param {object} deps.analysisManager `{ reset }`
 * @param {object} deps.smartCropManager `{ resetPreviewOnly }`
 * @param {(patch: object) => void} deps.setState
 * @param {(ready: boolean) => void} deps.setEditorReady
 * @param {(summary: object) => void} deps.renderImageContextSummary
 * @param {(message: string) => void} deps.showToast
 * @param {HTMLElement} deps.fileInput
 * @param {HTMLElement} deps.statusMessage
 * @param {HTMLElement} deps.emptyCanvas
 * @param {HTMLElement} deps.documentName
 * @param {HTMLElement} deps.canvasSize
 * @param {HTMLElement} deps.saveState
 * @param {Document} [deps.documentRef]
 */
export function createUploadManager({
  apiClient,
  canvasManager,
  restoreLayers,
  analysisManager,
  smartCropManager,
  setState,
  setEditorReady,
  renderImageContextSummary,
  showToast,
  fileInput,
  statusMessage,
  emptyCanvas,
  documentName,
  canvasSize,
  saveState,
  documentRef = document,
}) {
  let uploading = false;

  async function uploadImageFile(file) {
    if (uploading) return;
    uploading = true;
    // The dropzone and the file input share this path, so both triggers are
    // disabled for the duration — the user cannot start a second upload while
    // the first is still in flight.
    const openers = documentRef.querySelectorAll('[data-action="open"], #file-input');
    openers.forEach((el) => { el.disabled = true; });
    statusMessage.textContent = 'Uploading image...';
    showToast('Uploading image to IntelliCanvas API...');
    try {
      const image = await apiClient.upload(file);
      await canvasManager.loadFromUrl(apiClient.contentUrl(image.image_id), image);
      await restoreLayers();
      analysisManager.reset();
      smartCropManager.resetPreviewOnly();
      setState({ hasImage: true, selectedObjectId: null });
      setEditorReady(true);
      emptyCanvas.hidden = true;
      documentName.textContent = image.original_filename;
      const dims = canvasManager.getSourceDimensions();
      canvasSize.textContent = `${image.width ?? dims.width} × ${image.height ?? dims.height}`;
      renderImageContextSummary({
        name: image.original_filename,
        width: image.width ?? dims.width,
        height: image.height ?? dims.height,
        status: 'Ready to edit',
      });
      saveState.textContent = 'Saved in API session';
      statusMessage.textContent = 'Image loaded — backend session ready';
      showToast(`${image.original_filename} uploaded successfully`);
    } catch (error) {
      setState({ hasImage: false, selectedObjectId: null });
      setEditorReady(false);
      renderImageContextSummary({ status: 'Waiting for an image' });
      statusMessage.textContent = error.message.startsWith('Could not reach') ? 'Backend offline' : 'Upload failed';
      showToast(error.message);
    } finally {
      uploading = false;
      openers.forEach((el) => { el.disabled = false; });
    }
  }

  fileInput.addEventListener('change', ({ target }) => {
    const file = target.files?.[0];
    if (!file) return;
    uploadImageFile(file);
    target.value = '';
  });

  // Every completed operation re-arms the layer strip against the fresh
  // session state, so the canvas never edits a stale layer list.
  bus.on(events.operation, restoreLayers);

  function bindDropZone(canvasZone) {
    ['dragenter', 'dragover'].forEach((type) => canvasZone.addEventListener(type, (event) => {
      event.preventDefault();
      canvasZone.classList.add('is-drop-target');
    }));
    canvasZone.addEventListener('dragleave', (event) => {
      if (event.target === canvasZone) canvasZone.classList.remove('is-drop-target');
    });
    canvasZone.addEventListener('drop', (event) => {
      event.preventDefault();
      canvasZone.classList.remove('is-drop-target');
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) return showToast('Drop an image file (PNG, JPG, WEBP or BMP)');
      uploadImageFile(file);
    });
  }

  return { uploadImageFile, bindDropZone };
}
