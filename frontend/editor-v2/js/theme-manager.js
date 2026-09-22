import { appState, setState } from './app-state.js';
import { iconMarkup } from './icons.js';

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
  if (button) button.innerHTML = iconMarkup(theme === 'light' ? 'moon' : 'sun');
}
