import { deriveInspectorContext } from './inspector-context.js';

export const appState = {
  theme: localStorage.getItem('intelli-canvas-theme') || 'light',
  zoom: 75,
  activeTool: 'select',
  activeInspector: 'edit',
  hasImage: false,
  editorReady: false,
  selectedObjectId: null,
  processing: { active: false, operation: null, progress: null, cancellable: false },
  error: null,
  inspectorContext: 'empty',
};

export function setState(patch) {
  const { inspectorContext: _ignoredContext, ...nextState } = patch;
  Object.assign(appState, nextState);
  appState.inspectorContext = deriveInspectorContext(appState);
  document.dispatchEvent(new CustomEvent('appstatechange', { detail: appState }));
}
