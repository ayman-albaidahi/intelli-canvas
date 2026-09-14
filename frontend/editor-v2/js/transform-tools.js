async function applyServerTransform(canvasManager, apiClient, path, data) {
  const image = await apiClient.transform(path, data);
  await canvasManager.applyTransformResult(path, image, apiClient.contentUrl(image.image_id));
  document.dispatchEvent(new CustomEvent('ic-operation'));
}

export function bindTransformTools(canvasManager, apiClient, showToast) {
  const actions = {
    'rotate-left': () => applyServerTransform(canvasManager, apiClient, 'rotate', { angle: -90 }),
    'rotate-right': () => applyServerTransform(canvasManager, apiClient, 'rotate', { angle: 90 }),
    'flip-horizontal': () => applyServerTransform(canvasManager, apiClient, 'flip', { direction: 'horizontal' }),
    'flip-vertical': () => applyServerTransform(canvasManager, apiClient, 'flip', { direction: 'vertical' }),
  };

  document.querySelectorAll('[data-action]').forEach((button) => {
    const action = actions[button.dataset.action];
    if (!action) return;
    button.addEventListener('click', async () => {
      if (!canvasManager.hasImage()) return showToast('Choose an image before using transforms');
      try {
        await action();
        showToast(`${button.title || 'Transform'} applied`);
      } catch (error) { showToast(error.message); }
    });
  });

  for (const [action, label] of [['undo', 'Undid last transform'], ['redo', 'Redid transform']]) {
    document.querySelector(`[data-action="${action}"]`)?.addEventListener('click', async () => {
      if (!apiClient.imageId) return showToast('Upload an image first');
      try {
        const state = action === 'undo' ? await apiClient.undoHistory() : await apiClient.redoHistory();
        await canvasManager.loadFromUrl(apiClient.contentUrl(), state.image);
        document.dispatchEvent(new CustomEvent('ic-operation'));
        showToast(label);
      } catch (error) { showToast(error.message); }
    });
  }
}
