export class LayerManager {
  constructor({ list, empty, count, showToast }) {
    this.list = list; this.empty = empty; this.count = count; this.showToast = showToast;
    this.layers = []; this.selectedId = null; this.nextId = 1;
    this.render();
  }

  add(type = 'shape', name = null) {
    const layer = { id: `layer-${this.nextId++}`, name: name || `${type[0].toUpperCase()}${type.slice(1)} layer`, type, visible: true, opacity: 100 };
    this.layers.unshift(layer); this.selectedId = layer.id; this.render(); return layer;
  }

  addImage(name) { return this.add('image', name || 'Image layer'); }

  remove(id = this.selectedId) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index === -1) return;
    this.layers.splice(index, 1); this.selectedId = this.layers[Math.max(0, index - 1)]?.id || null; this.render();
  }

  toggle(id) { const layer = this.layers.find((item) => item.id === id); if (!layer) return; layer.visible = !layer.visible; this.render(); }
  select(id) { this.selectedId = id; this.render(); }
  rename(id) { const layer = this.layers.find((item) => item.id === id); if (!layer) return; const next = window.prompt('Layer name', layer.name); if (next?.trim()) { layer.name = next.trim(); this.render(); } }
  move(id, direction) { const index = this.layers.findIndex((layer) => layer.id === id); const next = index + direction; if (index < 0 || next < 0 || next >= this.layers.length) return; [this.layers[index], this.layers[next]] = [this.layers[next], this.layers[index]]; this.render(); }

  render() {
    this.list.innerHTML = '';
    this.empty.hidden = this.layers.length > 0;
    this.count.textContent = this.layers.length;
    this.layers.forEach((layer) => {
      const item = document.createElement('div'); item.className = `layer-item${layer.id === this.selectedId ? ' is-selected' : ''}`;
      item.innerHTML = `<button class="layer-visibility" aria-label="Toggle visibility">${layer.visible ? '◉' : '○'}</button><button class="layer-main"><span class="layer-thumb">${layer.type === 'image' ? '▧' : '◇'}</span><span><strong>${layer.name}</strong><small>${layer.type} · ${layer.opacity}%</small></span></button><button class="layer-more" aria-label="Layer actions">•••</button>`;
      item.querySelector('.layer-visibility').addEventListener('click', () => this.toggle(layer.id));
      item.querySelector('.layer-main').addEventListener('click', () => this.select(layer.id));
      item.querySelector('.layer-more').addEventListener('click', () => this.rename(layer.id));
      this.list.appendChild(item);
    });
  }
}
