import { aspectRatioDimensions } from './transform-logic.js';
import { openDialog, closeDialog } from './ui-manager.js';

export function initResizeTool(canvasManager, apiClient, showToast) {
  const dialog = document.querySelector('#resize-dialog');
  const form = document.querySelector('#resize-form');
  const width = document.querySelector('#resize-width');
  const height = document.querySelector('#resize-height');
  const ratio = document.querySelector('#resize-ratio');

  document.querySelector('[data-action="resize"]')?.addEventListener('click', () => {
    if (!canvasManager.hasImage()) return showToast('Choose an image before resizing');
    const dimensions = canvasManager.getSourceDimensions();
    width.value = dimensions.width;
    height.value = dimensions.height;
    openDialog(dialog, { focus: '#resize-width' });
  });
  const close = () => closeDialog(dialog);
  document.querySelector('#resize-cancel')?.addEventListener('click', close);
  document.querySelector('#resize-cancel-secondary')?.addEventListener('click', close);
  width.addEventListener('input', () => {
    if (!ratio.checked) return;
    const source = canvasManager.getSourceDimensions();
    height.value = aspectRatioDimensions(source.width, source.height, Number(width.value), null, true).height;
  });
  height.addEventListener('input', () => {
    if (!ratio.checked) return;
    const source = canvasManager.getSourceDimensions();
    width.value = aspectRatioDimensions(source.width, source.height, null, Number(height.value), true).width;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nextWidth = Math.max(1, Math.min(8000, Number(width.value)));
    const nextHeight = Math.max(1, Math.min(8000, Number(height.value)));
    if (!Number.isInteger(nextWidth) || !Number.isInteger(nextHeight) || nextWidth * nextHeight > 24000000) {
      return showToast('Resize dimensions exceed the supported limit');
    }
    try {
      const image = await apiClient.transform('resize', {
        width: nextWidth,
        height: nextHeight,
        lock_aspect_ratio: ratio.checked,
      });
      await canvasManager.loadFromUrl(apiClient.contentUrl(image.image_id), image);
      document.dispatchEvent(new CustomEvent('ic-operation'));
      closeDialog(dialog);
      showToast(`Canvas resized to ${image.width} × ${image.height}`);
    } catch (error) { showToast(error.message); }
  });
}
