export class BackgroundManager {
  constructor({ canvasManager, apiClient, objectManager, showToast }) {
    this.canvasManager = canvasManager;
    this.apiClient = apiClient;
    this.objectManager = objectManager;
    this.showToast = showToast;
    this.busy = false;
    this.pickMode = false;
    this.pickedColor = null;
    this.controls = {
      keyColor: document.querySelector('#bg-key-color'),
      tolerance: document.querySelector('[data-bg-param="tolerance"]'),
      feather: document.querySelector('[data-bg-param="feather"]'),
      smooth: document.querySelector('[data-bg-param="smooth"]'),
      invert: document.querySelector('#bg-invert'),
      backgroundBlur: document.querySelector('[data-bg-param="background_blur"]'),
      backgroundScale: document.querySelector('[data-bg-param="background_scale"]'),
      backgroundX: document.querySelector('[data-bg-param="background_x"]'),
      backgroundY: document.querySelector('[data-bg-param="background_y"]'),
      shadow: document.querySelector('#bg-shadow'),
      shadowOpacity: document.querySelector('[data-bg-param="shadow_opacity"]'),
      shadowBlur: document.querySelector('[data-bg-param="shadow_blur"]'),
      shadowOffsetY: document.querySelector('[data-bg-param="shadow_offset_y"]'),
      library: document.querySelector('#bg-library'),
      category: document.querySelector('#bg-category'),
      libraryGrid: document.querySelector('#bg-library-grid'),
      replaceColor: document.querySelector('#bg-replace-color'),
      status: document.querySelector('#status-message'),
    };
    this.bind();
    this.refreshLibrary();
    objectManager.onPick = (point) => {
      const rect = document.querySelector('#object-canvas').getBoundingClientRect();
      const color = this.canvasManager.sampleImagePixel(rect.left + point.x, rect.top + point.y);
      if (!color) return this.showToast('Click inside the image to pick a color');
      this.pickedColor = color;
      this.controls.keyColor.value = color;
      this.pickMode = false;
      this.objectManager.pickMode = false;
      document.querySelector('#object-canvas').style.cursor = '';
      this.controls.keyColor.disabled = false;
      this.showToast(`Picked ${color} as the key color`);
    };
  }

  bind() {
    document.querySelector('[data-action="pick-color"]')?.addEventListener('click', () => this.togglePickMode());
    ['tolerance', 'feather', 'smooth', 'backgroundBlur', 'backgroundScale', 'shadowOpacity', 'shadowBlur']
      .forEach((name) => this.controls[name]?.addEventListener('input', () => this.updateLabels()));
    this.controls.keyColor?.addEventListener('input', () => { this.pickedColor = null; });
    document.querySelector('[data-action="preview-mask"]')?.addEventListener('click', () => this.previewMask());
    document.querySelector('[data-action="clear-mask"]')?.addEventListener('click', () => this.clearPreviews());
    document.querySelector('[data-action="preview-replacement"]')?.addEventListener('click', () => this.previewReplacement());
    document.querySelector('[data-action="reset-background"]')?.addEventListener('click', () => this.resetControls());
    document.querySelector('[data-action="cancel-background"]')?.addEventListener('click', () => this.clearPreviews());
    document.querySelector('[data-action="remove-background"]')?.addEventListener('click', () => this.applyOperation('remove'));
    document.querySelector('[data-action="replace-background"]')?.addEventListener('click', () => this.applyOperation('replace'));
    document.querySelector('[data-action="upload-background"]')?.addEventListener('click', () => document.querySelector('#bg-upload-input').click());
    document.querySelector('#bg-upload-input')?.addEventListener('change', ({ target }) => {
      const file = target.files?.[0];
      if (file) this.uploadLibraryBackground(file);
      target.value = '';
    });
    this.controls.category?.addEventListener('change', () => this.renderCatalog());
    this.controls.library?.addEventListener('change', () => this.renderCatalog());
    this.updateLabels();
  }

  togglePickMode() {
    if (!this.apiClient.imageId) return this.showToast('Upload an image first');
    this.pickMode = !this.pickMode;
    this.objectManager.pickMode = this.pickMode;
    document.querySelector('#object-canvas').style.cursor = this.pickMode ? 'crosshair' : '';
    this.controls.keyColor.disabled = this.pickMode;
    this.showToast(this.pickMode ? 'Pick mode: click a pixel on the image' : 'Pick mode off');
  }

  updateLabels() {
    const labels = {
      '#bg-tolerance-val': this.controls.tolerance.value,
      '#bg-feather-val': this.controls.feather.value,
      '#bg-smooth-val': this.controls.smooth.value,
      '#bg-blur-val': this.controls.backgroundBlur.value,
      '#bg-scale-val': this.controls.backgroundScale.value,
      '#bg-shadow-opacity-val': `${this.controls.shadowOpacity.value}%`,
      '#bg-shadow-blur-val': this.controls.shadowBlur.value,
    };
    Object.entries(labels).forEach(([selector, value]) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    });
  }

  params() {
    return {
      color: this.pickedColor || this.controls.keyColor.value,
      tolerance: Number(this.controls.tolerance.value),
      feather: Number(this.controls.feather.value),
      smooth: Number(this.controls.smooth.value),
      invert: this.controls.invert.checked,
      background_blur: Number(this.controls.backgroundBlur.value),
      background_scale: Number(this.controls.backgroundScale.value),
      background_x: Number(this.controls.backgroundX.value),
      background_y: Number(this.controls.backgroundY.value),
      shadow: this.controls.shadow.checked,
      shadow_opacity: Number(this.controls.shadowOpacity.value) / 100,
      shadow_blur: Number(this.controls.shadowBlur.value),
      shadow_offset_y: Number(this.controls.shadowOffsetY.value),
    };
  }

  replacementPayload() {
    const payload = this.params();
    const libraryChoice = this.controls.library.value;
    if (libraryChoice) payload.background_name = libraryChoice;
    else payload.background_color = this.controls.replaceColor.value;
    return payload;
  }

  async previewMask() {
    if (!this.apiClient.imageId) return this.showToast('Upload an image first');
    try {
      const blob = await this.apiClient.maskPreview(this.params());
      const image = new Image();
      image.src = URL.createObjectURL(blob);
      image.onload = () => {
        this.canvasManager.setMaskOverlay(image);
        URL.revokeObjectURL(image.src);
      };
      this.showToast('Mask preview — white keeps, black removes');
    } catch (error) {
      this.showToast(error.message);
    }
  }

  clearPreviews() {
    this.canvasManager.setMaskOverlay(null);
    this.canvasManager.setPreviewOverlay(null);
  }

  resetControls() {
    const defaults = {
      keyColor: '#ffffff', tolerance: 25, feather: 2, smooth: 1,
      backgroundBlur: 0, backgroundScale: 1, backgroundX: 0, backgroundY: 0,
      shadowOpacity: 25, shadowBlur: 12, shadowOffsetY: 10,
    };
    this.controls.keyColor.value = defaults.keyColor;
    this.controls.tolerance.value = defaults.tolerance;
    this.controls.feather.value = defaults.feather;
    this.controls.smooth.value = defaults.smooth;
    this.controls.backgroundBlur.value = defaults.backgroundBlur;
    this.controls.backgroundScale.value = defaults.backgroundScale;
    this.controls.backgroundX.value = defaults.backgroundX;
    this.controls.backgroundY.value = defaults.backgroundY;
    this.controls.shadow.checked = false;
    this.controls.shadowOpacity.value = defaults.shadowOpacity;
    this.controls.shadowBlur.value = defaults.shadowBlur;
    this.controls.shadowOffsetY.value = defaults.shadowOffsetY;
    this.controls.invert.checked = false;
    this.controls.library.value = '';
    this.controls.category.value = 'all';
    this.pickedColor = null;
    this.clearPreviews();
    this.updateLabels();
    this.renderCatalog();
    this.showToast('Background settings reset');
  }

  async previewReplacement() {
    if (!this.apiClient.imageId) return this.showToast('Upload an image first');
    try {
      const blob = await this.apiClient.replaceBackgroundPreview(this.replacementPayload());
      const image = new Image();
      image.src = URL.createObjectURL(blob);
      image.onload = () => {
        this.canvasManager.setPreviewOverlay(image);
        URL.revokeObjectURL(image.src);
      };
      this.showToast('Replacement preview — press Replace to apply');
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async applyOperation(operation) {
    if (this.busy) return;
    if (!this.apiClient.imageId) return this.showToast('Upload an image first');
    const payload = operation === 'replace' ? this.replacementPayload() : this.params();
    this.busy = true;
    this.controls.status.textContent = operation === 'remove' ? 'Removing the background…' : 'Replacing the background…';
    try {
      const image = operation === 'remove'
        ? await this.apiClient.removeBackground(payload)
        : await this.apiClient.replaceBackground(payload);
      this.clearPreviews();
      await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(image.image_id), image);
      document.dispatchEvent(new CustomEvent('ic-operation'));
      this.controls.status.textContent = operation === 'remove' ? 'Background removed' : 'Background replaced';
      this.showToast(operation === 'remove' ? 'Background removed' : 'Background replaced');
    } catch (error) {
      this.controls.status.textContent = 'Background operation failed';
      this.showToast(error.message);
    } finally {
      this.busy = false;
    }
  }

  async refreshLibrary() {
    try {
      this.catalog = await this.apiClient.backgroundCatalog();
      if (!this.controls.library) return;
      const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      this.controls.library.innerHTML = '<option value="">— choose background —</option>'
        + this.catalog.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.label)}</option>`).join('');
      this.renderCatalog();
    } catch {
      /* library stays empty when the API is offline */
    }
  }

  renderCatalog() {
    if (!this.controls.libraryGrid) return;
    const category = this.controls.category?.value || 'all';
    const catalog = (this.catalog || []).filter((item) => category === 'all' || item.category === category);
    const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    this.controls.libraryGrid.innerHTML = catalog.map((item) => `<button type="button" class="bg-thumb${this.controls.library.value === item.name ? ' is-selected' : ''}" data-bg-name="${escapeHtml(item.name)}" title="${escapeHtml(item.label)}"><img src="${escapeHtml(item.thumbnail_url)}" alt="" loading="lazy"><span>${escapeHtml(item.label)}</span></button>`).join('');
    this.controls.libraryGrid.querySelectorAll('[data-bg-name]').forEach((button) => button.addEventListener('click', () => {
      this.controls.library.value = button.dataset.bgName;
      this.renderCatalog();
    }));
  }

  async uploadLibraryBackground(file) {
    try {
      const category = this.controls.category.value === 'all' ? 'general' : this.controls.category.value;
      const name = await this.apiClient.uploadBackground(file, category);
      await this.refreshLibrary();
      this.controls.library.value = name;
      this.showToast(`${name} added to the background library`);
    } catch (error) {
      this.showToast(error.message);
    }
  }
}
