import { escapeHtml } from './escape-html.js';

export class HistoryManager {
  constructor({ canvasManager, apiClient, showToast }) {
    this.canvasManager = canvasManager;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.list = document.querySelector('#history-list');
    this.hint = document.querySelector('#history-hint');
    this.undoButton = document.querySelector('[data-action="history-undo"]');
    this.redoButton = document.querySelector('[data-action="history-redo"]');
    this.clearButton = document.querySelector('[data-action="history-clear"]');
    this.beforeSelect = document.querySelector('#history-before');
    this.afterSelect = document.querySelector('#history-after');
    this.comparison = document.querySelector('#history-comparison');
    this.beforeImage = document.querySelector('#history-before-image');
    this.afterImage = document.querySelector('#history-after-image');
    this.diffImage = document.querySelector('#history-diff-image');
    this.busy = false;
    this.bind();
    document.addEventListener('ic-operation', () => this.refresh());
    document.addEventListener('appstatechange', () => {
      if (this.apiClient.imageId) this.refresh();
    });
    this.refresh();
  }

  bind() {
    this.undoButton?.addEventListener('click', () => this.step('undo'));
    this.redoButton?.addEventListener('click', () => this.step('redo'));
    this.clearButton?.addEventListener('click', () => this.clear());
    document.querySelector('[data-action="history-compare"]')?.addEventListener('click', () => this.compare());
    document.querySelector('[data-action="history-diff"]')?.addEventListener('click', () => this.diff());
    this.list?.addEventListener('click', (event) => {
      const entry = event.target.closest('[data-index]');
      if (!entry || this.busy) return;
      this.goto(Number(entry.dataset.index));
    });
  }

  async step(action) {
    if (this.busy || !this.apiClient.imageId) return;
    this.busy = true;
    try {
      const state = action === 'undo'
        ? await this.apiClient.undoHistory(this.apiClient.imageId)
        : await this.apiClient.redoHistory(this.apiClient.imageId);
      this.render(state.image);
      await this.reloadCanvas();
      this.showToast(action === 'undo' ? 'Stepped back in history' : 'Stepped forward in history');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.busy = false;
    }
  }

  async goto(index) {
    if (this.busy || !this.apiClient.imageId) return;
    this.busy = true;
    try {
      const state = await this.apiClient.gotoHistory(this.apiClient.imageId, index);
      this.render(state.image);
      await this.reloadCanvas();
      this.showToast('Jumped to ' + this.entryLabel(state.image.entries[index]));
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.busy = false;
    }
  }

  async clear() {
    if (this.busy || !this.apiClient.imageId) return;
    this.busy = true;
    try {
      const state = await this.apiClient.clearHistory(this.apiClient.imageId);
      this.render(state.image);
      this.clearComparison();
      this.showToast('History cleared — current state kept');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.busy = false;
    }
  }

  async compare() {
    if (this.busy || !this.apiClient.imageId) return;
    try {
      const result = await this.apiClient.compareHistory(Number(this.beforeSelect.value), Number(this.afterSelect.value));
      this.beforeImage.src = result.from.url;
      this.afterImage.src = result.to.url;
      this.diffImage.hidden = true;
      this.comparison.hidden = false;
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async diff() {
    if (this.busy || !this.apiClient.imageId) return;
    try {
      const blob = await this.apiClient.diffHistory(Number(this.beforeSelect.value), Number(this.afterSelect.value), 'heatmap');
      this.setDiffSrc(URL.createObjectURL(blob));
      this.diffImage.hidden = false;
      this.comparison.hidden = false;
    } catch (error) {
      this.showToast(error.message);
    }
  }

  setDiffSrc(url) {
    if (this._diffObjectUrl) URL.revokeObjectURL(this._diffObjectUrl);
    this._diffObjectUrl = url;
    this.diffImage.src = url;
  }

  clearComparison() {
    if (!this.comparison) return;
    this.comparison.hidden = true;
    this.diffImage.hidden = true;
    if (this._diffObjectUrl) {
      URL.revokeObjectURL(this._diffObjectUrl);
      this._diffObjectUrl = null;
    }
    this.beforeImage.removeAttribute('src');
    this.afterImage.removeAttribute('src');
    this.diffImage.removeAttribute('src');
  }

  async reloadCanvas() {
    const url = this.apiClient.contentUrl(this.apiClient.imageId);
    await this.canvasManager.loadFromUrl(url, {});
    document.dispatchEvent(new CustomEvent('ic-operation'));
  }

  entryLabel(entry) {
    const time = new Date(entry.time * 1000).toLocaleTimeString();
    return `${entry.operation} · ${time}`;
  }

  render(state) {
    if (!this.list) return;
    this.list.innerHTML = '';
    if (this.hint) this.hint.hidden = state.total > 1;
    const entries = state.entries || [];
    entries.slice().reverse().forEach((entry) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'history-row' + (entry.current ? ' is-current' : '');
      row.dataset.index = entry.index;
      const metadata = Object.keys(entry.parameters || {}).length ? ` · ${escapeHtml(JSON.stringify(entry.parameters))}` : '';
      row.innerHTML = `<span class="history-marker">${entry.current ? '●' : '○'}</span><span class="history-name">${escapeHtml(entry.operation)}<small>${metadata}</small></span><span class="history-time">${new Date(entry.time * 1000).toLocaleTimeString()}</span>`;
      this.list.appendChild(row);
    });
    this.populateCompareSelects(entries, state.index);
    if (this.undoButton) this.undoButton.disabled = !entries.length || state.index === 0;
    if (this.redoButton) this.redoButton.disabled = !entries.length || state.index >= state.total - 1;
  }

  populateCompareSelects(entries, currentIndex) {
    const options = entries.map((entry) => `<option value="${entry.index}">${escapeHtml(entry.operation)} (#${entry.index})</option>`).join('');
    if (this.beforeSelect) this.beforeSelect.innerHTML = options;
    if (this.afterSelect) this.afterSelect.innerHTML = options;
    if (this.beforeSelect) this.beforeSelect.value = String(Math.max(0, currentIndex - 1));
    if (this.afterSelect) this.afterSelect.value = String(currentIndex);
  }

  async refresh() {
    if (!this.apiClient.imageId || this.busy) return;
    try {
      const state = await this.apiClient.history(this.apiClient.imageId);
      this.render(state.image);
    } catch {
      /* session may be gone; panel simply stays empty */
    }
  }
}
