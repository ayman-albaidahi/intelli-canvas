export function bindTransformTools(canvasManager, showToast) {
  const actions = {
    'rotate-left': () => canvasManager.rotate(-90),
    'rotate-right': () => canvasManager.rotate(90),
    'flip-horizontal': () => canvasManager.flip('horizontal'),
    'flip-vertical': () => canvasManager.flip('vertical'),
    crop: () => canvasManager.cropCenter(),
  };

  document.querySelectorAll('[data-action]').forEach((button) => {
    const action = actions[button.dataset.action];
    if (!action) return;
    button.addEventListener('click', () => {
      if (!canvasManager.hasImage()) {
        showToast('Choose an image before using transforms');
        return;
      }
      action();
      showToast(`${button.title || 'Transform'} applied`);
    });
  });

  document.querySelector('[data-tool="crop"]')?.addEventListener('dblclick', () => {
    if (!canvasManager.hasImage()) return showToast('Choose an image before cropping');
    canvasManager.cropCenter();
    showToast('Center crop applied');
  });

  document.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
    if (canvasManager.undo()) showToast('Undid last transform');
    else showToast('Nothing to undo');
  });
  document.querySelector('[data-action="redo"]')?.addEventListener('click', () => {
    if (canvasManager.redo()) showToast('Redid transform');
    else showToast('Nothing to redo');
  });
}
