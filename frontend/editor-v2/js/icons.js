const ICONS = {
  rotateLeft: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  rotateRight: '<path d="M21 12a9 9 0 1 0-3 6.7"/><path d="M21 4v5h-5"/>',
  flipHorizontal: '<path d="M12 3v18"/><path d="m8 7-4 5 4 5"/><path d="m16 7 4 5-4 5"/>',
  flipVertical: '<path d="M3 12h18"/><path d="m7 8 5-4 5 4"/><path d="m7 16 5 4 5-4"/>',
  resize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v1"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
  select: '<path d="m5 3 14 9-6 1-3 6-5-16Z"/>',
  move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
  crop: '<path d="M6 2v4H2M18 22v-4h4M2 18h4v4M22 6h-4V2"/><path d="M6 6h12v12H6z"/>',
  brush: '<path d="m14 6 4 4"/><path d="M4 20c4-1 5-5 5-8l8-8a2.8 2.8 0 0 1 4 4l-8 8c-3 0-7 1-9 4Z"/>',
  eraser: '<path d="m7 21 10-10"/><path d="m4 15 7-11a2 2 0 0 1 3-.4l6 6a2 2 0 0 1 0 2.8L14 19H8a2 2 0 0 1-1.4-.6l-2-2A2 2 0 0 1 4 15Z"/>',
  shapes: '<circle cx="8" cy="8" r="3"/><path d="M14 5h5v5h-5z"/><path d="m8 14 4 7H4l4-7Z"/>',
  text: '<path d="M4 5V3h16v2M12 3v18M8 21h8"/>',
  adjust: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M2 14h4M10 8h4M18 16h4"/>',
  filters: '<circle cx="9" cy="9" r="6"/><path d="m14 14 5 5M9 6v6M6 9h6"/>',
  backdrop: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="m8 12 3 3 5-6"/>',
  keyboard: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h.01M11 9h.01M15 9h.01M19 9h.01M7 13h10M7 16h.01M11 16h.01M15 16h.01M19 16h.01"/>',
  panels: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M8 8h13"/>',
  compare: '<path d="M3 5h18M3 19h18M12 5v14"/><path d="m8 9-3 3 3 3M16 9l3 3-3 3"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  shape: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m20 15-4-4L5 20"/>',
  sparkles: '<path d="m12 3-1.2 4.3L7 9l3.8 1.7L12 15l1.2-4.3L17 9l-3.8-1.7L12 3ZM19 15l-.6 2.4L16 18l2.4.6L19 21l.6-2.4L22 18l-2.4-.6L19 15ZM5 14l-.5 2L2 17l2.5 1 .5 2 .5-2L8 17l-2.5-1L5 14Z"/>',
  pipeline: '<path d="M6 3v6M18 15v6M3 6h6M15 18h6M6 9a3 3 0 1 0 3 3v-3M18 15a3 3 0 1 0-3-3v3"/>',
  intelligence: '<path d="M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0c-.8.6-1 1.3-1 2H9c0-.7-.2-1.4-1-2Z"/><path d="M12 2v2M4.9 4.9l1.4 1.4M2 12h2M19.1 4.9l-1.4 1.4M20 12h2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.2 6.2C3.6 8.1 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 3.3-.5"/>',
  droplet: '<path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z"/>',
  microscope: '<path d="M6 20h12M9 20v-3a6 6 0 0 1 6-6h1M12 4h4v7h-4zM12 4 9 2M7 14h9"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-1.9"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};

function iconMarkup(name, label = '') {
  const paths = ICONS[name] || ICONS.sparkles;
  return `<span class="icon icon-${name}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${paths}</svg></span>${label}`;
}

const EXACT = new Map([
  ['↺', ['rotateLeft', '']], ['↻', ['rotateRight', '']], ['⇋', ['flipHorizontal', '']], ['⇵', ['flipVertical', '']], ['⤢', ['resize', '']],
  ['↶', ['undo', '']], ['↷', ['redo', '']], ['☼', ['sun', '']], ['−', ['minus', '']], ['+', ['plus', '']], ['⛶', ['fit', '']], ['‹', ['chevronLeft', '']], ['›', ['chevronRight', '']], ['•••', ['more', '']], ['⋯', ['more', '']], ['🗑', ['trash', '']], ['👁', ['eye', '']], ['🚫', ['eyeOff', '']], ['🔒', ['lock', '']], ['🔓', ['unlock', '']], ['×', ['close', '']], ['⌁', ['layers', '']],
]);
const PREFIX = new Map([
  ['↖', 'select'], ['✥', 'move'], ['⌗', 'crop'], ['╱', 'brush'], ['⌫', 'eraser'], ['◇', 'shapes'], ['T', 'text'], ['◐', 'adjust'], ['✧', 'sparkles'], ['✦', 'sparkles'], ['▧', 'backdrop'], ['⌘', 'keyboard'], ['▦', 'panels'], ['≋', 'pipeline'], ['◌', 'intelligence'], ['💧', 'droplet'], ['⬆', 'upload'], ['🔬', 'microscope'], ['🖼', 'image'], ['▭', 'shape']
]);

function enhanceIcons(root = document) {
  root.querySelectorAll('button, .list-action, .quick-action, .view-button, .mini-button, .toolbar-button, .empty-icon, .panel-icon').forEach((element) => {
    if (element.querySelector('.icon')) return;
    const text = element.textContent.trim();
    const embedded = [['↗', 'download'], ['↑', 'upload'], ['💧', 'droplet'], ['🔬', 'microscope']].find(([token]) => text.includes(token));
    if (embedded) {
      const label = text.replace(embedded[0], '').trim();
      element.innerHTML = `${label}${iconMarkup(embedded[1])}`;
      return;
    }
    if (EXACT.has(text)) {
      const [name, label] = EXACT.get(text);
      element.innerHTML = iconMarkup(name, label);
      return;
    }
    for (const [token, name] of PREFIX) {
      if (text.startsWith(token)) {
        const label = text.slice(token.length).trim();
        element.innerHTML = iconMarkup(name, label ? ` ${label}` : '');
        break;
      }
    }
  });
  root.querySelectorAll('details.panel-accordion > summary').forEach((summary) => {
    if (summary.querySelector('.disclosure-icon')) return;
    summary.insertAdjacentHTML('beforeend', `<span class="disclosure-icon" aria-hidden="true">${iconMarkup('chevronRight')}</span>`);
  });
  root.querySelectorAll('.muted, .list-action b').forEach((element) => {
    const text = element.textContent.trim();
    if (!element.querySelector('.icon') && EXACT.has(text)) element.innerHTML = iconMarkup(EXACT.get(text)[0]);
  });
  root.querySelectorAll('[data-icon]').forEach((element) => {
    if (!element.querySelector('.icon')) element.innerHTML = iconMarkup(element.dataset.icon);
  });
}

enhanceIcons();
new MutationObserver((mutations) => mutations.forEach(({ addedNodes }) => addedNodes.forEach((node) => {
  if (node.nodeType === Node.ELEMENT_NODE) enhanceIcons(node);
}))).observe(document.body, { childList: true, subtree: true });

export { iconMarkup, enhanceIcons };
