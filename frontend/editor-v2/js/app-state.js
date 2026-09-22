export const appState = {
  theme: localStorage.getItem('intelli-canvas-theme') || 'light',
  zoom: 75,
  activeTool: 'select',
  activeInspector: 'edit',
  hasImage: false,
};

export function setState(patch) {
  Object.assign(appState, patch);
  document.dispatchEvent(new CustomEvent('appstatechange', { detail: appState }));
}
