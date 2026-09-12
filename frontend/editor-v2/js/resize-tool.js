export function initResizeTool(canvasManager, showToast) {
  const dialog = document.querySelector('#resize-dialog');
  const form = document.querySelector('#resize-form');
  const width = document.querySelector('#resize-width');
  const height = document.querySelector('#resize-height');
  const ratio = document.querySelector('#resize-ratio');
  let originalRatio = 1;

  document.querySelector('[data-action="resize"]')?.addEventListener('click', () => {
    if (!canvasManager.hasImage()) return showToast('Choose an image before resizing');
    const dimensions = canvasManager.getSourceDimensions();
    width.value = dimensions.width; height.value = dimensions.height; originalRatio = dimensions.width / dimensions.height;
    dialog.hidden = false; width.focus();
  });
  const close = () => { dialog.hidden = true; };
  document.querySelector('#resize-cancel')?.addEventListener('click', close);
  document.querySelector('#resize-cancel-secondary')?.addEventListener('click', close);
  width.addEventListener('input', () => { if (ratio.checked) height.value = Math.round(Number(width.value) / originalRatio); });
  height.addEventListener('input', () => { if (ratio.checked) width.value = Math.round(Number(height.value) * originalRatio); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextWidth = Math.max(1, Math.min(12000, Number(width.value)));
    const nextHeight = Math.max(1, Math.min(12000, Number(height.value)));
    canvasManager.resizeImage(nextWidth, nextHeight);
    dialog.hidden = true;
    showToast(`Canvas resized to ${nextWidth} × ${nextHeight}`);
  });
}
