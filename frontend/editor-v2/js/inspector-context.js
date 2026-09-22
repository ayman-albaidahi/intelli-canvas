export const INSPECTOR_CONTEXTS = Object.freeze([
  'empty',
  'image',
  'layer',
  'brush',
  'eraser',
  'crop',
  'processing',
  'error',
]);

export const INSPECTOR_CONTEXT_PRIORITY = Object.freeze([
  'error',
  'processing',
  'crop',
  'brush',
  'eraser',
  'layer',
  'image',
  'empty',
]);

const DRAWING_TOOLS = new Set(['brush', 'eraser']);

function hasError(error) {
  return Boolean(error && (typeof error !== 'object' || error.active !== false));
}

function isProcessing(processing) {
  return processing === true || Boolean(processing?.active);
}

/**
 * Derives the single Inspector context from editor state.
 *
 * This function is intentionally pure: it does not read the DOM, mutate state,
 * or call managers. Higher-priority transient states always win over the
 * selected layer and the normal image context.
 */
export function deriveInspectorContext(state = {}) {
  if (hasError(state.error)) return 'error';
  if (isProcessing(state.processing)) return 'processing';

  const ready = Boolean(state.editorReady ?? state.hasImage);
  if (!ready) return 'empty';

  if (state.activeTool === 'crop') return 'crop';
  if (DRAWING_TOOLS.has(state.activeTool)) return state.activeTool;
  if (state.selectedObjectId) return 'layer';
  return 'image';
}
