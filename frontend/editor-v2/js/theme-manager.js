import { appState, setState } from './app-state.js';

export function initThemeManager() {
  applyTheme(appState.theme);
  document.querySelector('[data-action="theme"]')?.addEventListener('click', () => {
    const nextTheme = appState.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('intelli-canvas-theme', nextTheme);
    setState({ theme: nextTheme });
    applyTheme(nextTheme);
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = document.querySelector('[data-action="theme"]');
  if (button) button.textContent = theme === 'light' ? '☾' : '☼';
}
