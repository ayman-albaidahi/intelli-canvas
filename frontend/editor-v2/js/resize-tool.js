export function initResizeTool(canvasManager, apiClient, showToast) {
  const dialog = document.querySelector('#resize-dialog');
  const form = document.querySelector('#resize-form');
  const width = document.querySelector('#resize-width');
  const height = document.querySelector('#resize-height');
  const ratio = document.querySelector('#resize-ratio');
  let originalRatio = 1;

  document.querySelector('[data-action="resize"]')?.addEventListener('click', () => {
    if (!canvasManager.hasImage()) return showToast('Choose an image before resizing');
    const dimensions = canvasManager.getSourceDimensions();
    width.value = dimensions.width;
    height.value = dimensions.height;
    originalRatio = dimensions.width / dimensions.height;
    dialog.hidden = false;
    width.focus();
  });
  const close = () => { dialog.hidden = true; };
  document.querySelector('#resize-cancel')?.addEventListener('click', close);
  document.querySelector('#resize-cancel-secondary')?.addEventListener('click', close);
  width.addEventListener('input', () => { if (ratio.checked) height.value = Math.round(Number(width.value) / originalRatio); });
  height.addEventListener('input', () => { if (ratio.checked) width.value = Math.round(Number(height.value) * originalRatio); });
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
      dialog.hidden = true;
      showToast(`Canvas resized to ${image.width} × ${image.height}`);
    } catch (error) { showToast(error.message); }
  });
}
