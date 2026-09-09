class CanvasManager {
  constructor(canvas, stage) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError("CanvasManager requires a canvas element.");
    }

    this.canvas = canvas;
    this.stage = stage || canvas.parentElement;
    this.context = canvas.getContext("2d");
    this.image = null;
    this.imageSource = null;
    this.imageBounds = null;
    this.zoomLevel = 1.0;
    this.minZoom = 0.1;
    this.maxZoom = 10.0;
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.lastPanPoint = null;
    this.cropMode = false;
    this.cropSelection = null;
    this.cropInteraction = null;
    this.cropOverlay = document.createElement("div");
    this.cropOverlay.className = "crop-overlay";
    this.cropOverlay.hidden = true;
    this.stage.appendChild(this.cropOverlay);
    this.createCropHandles();

    if (!this.context) {
      throw new Error("The browser could not create a 2D canvas context.");
    }

    this.initEventListeners();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage || this.canvas);
    this.resize();
  }

  initEventListeners() {
    this.handleWheel = (event) => {
      if (!this.image) return;

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const clientPoint = { x: event.clientX, y: event.clientY };
        const zoomDelta = event.deltaY < 0 ? 0.1 : -0.1;
        this.setZoom(this.zoomLevel + zoomDelta, clientPoint);
      }
    };

    this.handleMouseDown = (event) => {
      if (!this.image) return;
      if (event.button !== 0 && event.button !== 1) return;

      const clientPoint = { x: event.clientX, y: event.clientY };
      const canvasPoint = this.clientToCanvas(clientPoint);

      if (!this.isPointInsideImage(canvasPoint)) {
        this.startPan(clientPoint);
      }
    };

    this.handleMouseMove = (event) => {
      if (!this.isPanning) return;
      const clientPoint = { x: event.clientX, y: event.clientY };
      this.pan(clientPoint);
    };

    this.handleMouseUp = () => {
      if (this.isPanning) {
        this.endPan();
      }
    };

    this.handleMouseLeave = () => {
      if (this.isPanning) {
        this.endPan();
      }
    };

    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("mouseleave", this.handleMouseLeave);
    this.cropOverlay.addEventListener(
      "pointerdown",
      this.handleCropPointerDown,
    );
    window.addEventListener("pointermove", this.handleCropPointerMove);
    window.addEventListener("pointerup", this.handleCropPointerUp);
  }

  createCropHandles() {
    ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((handle) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `crop-handle crop-handle-${handle}`;
      element.dataset.handle = handle;
      element.setAttribute("aria-label", `Resize crop ${handle}`);
      this.cropOverlay.appendChild(element);
    });
  }

  startCrop() {
    if (!this.image || !this.imageBounds) return false;

    const marginX = this.image.naturalWidth * 0.1;
    const marginY = this.image.naturalHeight * 0.1;
    this.cropMode = true;
    this.cropSelection = {
      x: marginX,
      y: marginY,
      width: this.image.naturalWidth - marginX * 2,
      height: this.image.naturalHeight - marginY * 2,
    };
    this.updateCropOverlay();
    return true;
  }

  cancelCrop() {
    this.cropMode = false;
    this.cropSelection = null;
    this.cropInteraction = null;
    this.cropOverlay.hidden = true;
    this.render();
  }

  getCropSelection() {
    if (!this.cropSelection) return null;
    return {
      x: Math.round(this.cropSelection.x),
      y: Math.round(this.cropSelection.y),
      width: Math.round(this.cropSelection.width),
      height: Math.round(this.cropSelection.height),
    };
  }

  async applyCrop() {
    const selection = this.getCropSelection();
    if (!selection || !this.image) return null;

    const output = document.createElement("canvas");
    output.width = selection.width;
    output.height = selection.height;
    output
      .getContext("2d")
      .drawImage(
        this.image,
        selection.x,
        selection.y,
        selection.width,
        selection.height,
        0,
        0,
        selection.width,
        selection.height,
      );
    const imageState = await this.loadImage(output.toDataURL("image/png"));
    this.cropMode = false;
    this.cropSelection = null;
    this.cropOverlay.hidden = true;
    return { selection, imageState };
  }

  handleCropPointerDown = (event) => {
    if (!this.cropMode || !this.cropSelection) return;
    event.preventDefault();
    const imagePoint = this.clientToImage({
      x: event.clientX,
      y: event.clientY,
    });
    if (!imagePoint) return;
    this.cropInteraction = {
      start: imagePoint,
      initial: { ...this.cropSelection },
      handle: event.target.dataset.handle || "move",
    };
  };

  handleCropPointerMove = (event) => {
    if (!this.cropInteraction || !this.image) return;
    const point = this.clientToImage({ x: event.clientX, y: event.clientY });
    if (!point) return;
    this.updateCropSelection(point);
    this.updateCropOverlay();
  };

  handleCropPointerUp = () => {
    this.cropInteraction = null;
  };

  updateCropSelection(point) {
    const { start, initial, handle } = this.cropInteraction;
    const maxWidth = this.image.naturalWidth;
    const maxHeight = this.image.naturalHeight;
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const minSize = 10;

    if (handle === "move") {
      this.cropSelection.x = Math.min(
        Math.max(0, initial.x + dx),
        maxWidth - initial.width,
      );
      this.cropSelection.y = Math.min(
        Math.max(0, initial.y + dy),
        maxHeight - initial.height,
      );
      return;
    }

    let left = initial.x;
    let top = initial.y;
    let right = initial.x + initial.width;
    let bottom = initial.y + initial.height;
    if (handle.includes("w"))
      left = Math.max(0, Math.min(right - minSize, initial.x + dx));
    if (handle.includes("e"))
      right = Math.min(
        maxWidth,
        Math.max(left + minSize, initial.x + initial.width + dx),
      );
    if (handle.includes("n"))
      top = Math.max(0, Math.min(bottom - minSize, initial.y + dy));
    if (handle.includes("s"))
      bottom = Math.min(
        maxHeight,
        Math.max(top + minSize, initial.y + initial.height + dy),
      );
    this.cropSelection = {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  updateCropOverlay() {
    if (!this.cropSelection || !this.imageBounds) return;
    const topLeft = this.imageToCanvas(this.cropSelection);
    const bottomRight = this.imageToCanvas({
      x: this.cropSelection.x + this.cropSelection.width,
      y: this.cropSelection.y + this.cropSelection.height,
    });
    this.cropOverlay.hidden = false;
    this.cropOverlay.style.left = `${topLeft.x}px`;
    this.cropOverlay.style.top = `${topLeft.y}px`;
    this.cropOverlay.style.width = `${bottomRight.x - topLeft.x}px`;
    this.cropOverlay.style.height = `${bottomRight.y - topLeft.y}px`;
  }

  startPan(point) {
    this.isPanning = true;
    this.lastPanPoint = { x: point.x, y: point.y };
  }

  pan(point) {
    if (!this.isPanning || !this.lastPanPoint) return;

    const dx = point.x - this.lastPanPoint.x;
    const dy = point.y - this.lastPanPoint.y;

    this.panOffset.x += dx;
    this.panOffset.y += dy;
    this.lastPanPoint = { x: point.x, y: point.y };

    this.dispatchPanChange();
    this.render();
  }

  endPan() {
    this.isPanning = false;
    this.lastPanPoint = null;
  }

  getZoomLevel() {
    return this.zoomLevel;
  }

  setZoom(level, clientPoint = null) {
    const clampedZoom = Math.min(
      Math.max(Number(level) || this.zoomLevel, this.minZoom),
      this.maxZoom,
    );
    const roundedZoom = Math.round(clampedZoom * 100) / 100;

    if (Math.abs(roundedZoom - this.zoomLevel) < 0.0001) return;

    if (clientPoint && this.image) {
      const canvasPoint = this.clientToCanvas(clientPoint);
      const rect =
        this.stage?.getBoundingClientRect() ||
        this.canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));

      const oldScale = this.zoomLevel;
      const newScale = roundedZoom;

      const imageRelX =
        (canvasPoint.x - (cssWidth / 2 + this.panOffset.x)) / oldScale;
      const imageRelY =
        (canvasPoint.y - (cssHeight / 2 + this.panOffset.y)) / oldScale;

      this.panOffset.x = canvasPoint.x - cssWidth / 2 - imageRelX * newScale;
      this.panOffset.y = canvasPoint.y - cssHeight / 2 - imageRelY * newScale;
      this.dispatchPanChange();
    }

    this.zoomLevel = roundedZoom;
    this.dispatchZoomChange();
    this.render();
  }

  zoomIn() {
    this.setZoom(this.zoomLevel + 0.1);
  }

  zoomOut() {
    this.setZoom(this.zoomLevel - 0.1);
  }

  resetZoom() {
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.dispatchZoomChange();
    this.dispatchPanChange();
    this.render();
  }

  fitToCanvas() {
    if (!this.image) {
      this.resetZoom();
      return;
    }

    const rect =
      this.stage?.getBoundingClientRect() ||
      this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));

    const scaleX = cssWidth / this.image.naturalWidth;
    const scaleY = cssHeight / this.image.naturalHeight;
    const fitScale = Math.min(scaleX, scaleY, 1.0);

    this.zoomLevel = Math.min(Math.max(fitScale, this.minZoom), this.maxZoom);
    this.panOffset = { x: 0, y: 0 };
    this.dispatchZoomChange();
    this.dispatchPanChange();
    this.render();
  }

  dispatchZoomChange() {
    const event = new CustomEvent("zoomchange", {
      detail: { zoomLevel: this.zoomLevel },
    });
    this.canvas.dispatchEvent(event);
  }

  dispatchPanChange() {
    const event = new CustomEvent("panchange", {
      detail: { panOffset: { ...this.panOffset } },
    });
    this.canvas.dispatchEvent(event);
  }

  async loadImage(source) {
    const image = await this.createImage(source);
    const previousObjectUrl =
      this.imageSource instanceof File ? this.image?.src : null;

    this.image = image;
    this.imageSource = source;

    if (previousObjectUrl) {
      URL.revokeObjectURL(previousObjectUrl);
    }

    this.fitToCanvas();
    this.resize();
    return this.getImageState();
  }

  createImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The image could not be loaded."));
      image.src = source instanceof File ? URL.createObjectURL(source) : source;
    });
  }

  resize() {
    const rect =
      this.stage?.getBoundingClientRect() ||
      this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const devicePixelRatio = window.devicePixelRatio || 1;

    this.canvas.width = Math.floor(cssWidth * devicePixelRatio);
    this.canvas.height = Math.floor(cssHeight * devicePixelRatio);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    this.render();
  }

  render() {
    const rect =
      this.stage?.getBoundingClientRect() ||
      this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const devicePixelRatio = window.devicePixelRatio || 1;

    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.image) {
      this.imageBounds = null;
      this.cropOverlay.hidden = true;
      return;
    }

    const scale = this.zoomLevel;
    const width = this.image.naturalWidth * scale;
    const height = this.image.naturalHeight * scale;
    const x = (cssWidth - width) / 2 + this.panOffset.x;
    const y = (cssHeight - height) / 2 + this.panOffset.y;

    this.imageBounds = { x, y, width, height, scale };

    this.context.save();
    this.context.scale(devicePixelRatio, devicePixelRatio);
    this.context.translate(
      this.panOffset.x + cssWidth / 2,
      this.panOffset.y + cssHeight / 2,
    );
    this.context.scale(this.zoomLevel, this.zoomLevel);
    this.context.drawImage(
      this.image,
      -this.image.naturalWidth / 2,
      -this.image.naturalHeight / 2,
      this.image.naturalWidth,
      this.image.naturalHeight,
    );
    this.context.restore();
    if (this.cropMode) this.updateCropOverlay();
  }

  canvasToImage(point) {
    if (!this.imageBounds) return null;

    return {
      x: (point.x - this.imageBounds.x) / this.imageBounds.scale,
      y: (point.y - this.imageBounds.y) / this.imageBounds.scale,
    };
  }

  imageToCanvas(point) {
    if (!this.imageBounds) return null;

    return {
      x: this.imageBounds.x + point.x * this.imageBounds.scale,
      y: this.imageBounds.y + point.y * this.imageBounds.scale,
    };
  }

  clientToCanvas(point) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  }

  clientToImage(point) {
    return this.canvasToImage(this.clientToCanvas(point));
  }

  imageToClient(point) {
    const canvasPoint = this.imageToCanvas(point);
    if (!canvasPoint) return null;

    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + canvasPoint.x, y: rect.top + canvasPoint.y };
  }

  isPointInsideImage(point) {
    if (!this.imageBounds) return false;

    return (
      point.x >= this.imageBounds.x &&
      point.x <= this.imageBounds.x + this.imageBounds.width &&
      point.y >= this.imageBounds.y &&
      point.y <= this.imageBounds.y + this.imageBounds.height
    );
  }

  getImageState() {
    if (!this.image) return null;

    return {
      width: this.image.naturalWidth,
      height: this.image.naturalHeight,
      aspectRatio: this.image.naturalWidth / this.image.naturalHeight,
      bounds: this.imageBounds,
      zoomLevel: this.zoomLevel,
      panOffset: { ...this.panOffset },
    };
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("mouseup", this.handleMouseUp);
    this.canvas.removeEventListener("mouseleave", this.handleMouseLeave);
    this.cropOverlay.removeEventListener(
      "pointerdown",
      this.handleCropPointerDown,
    );
    window.removeEventListener("pointermove", this.handleCropPointerMove);
    window.removeEventListener("pointerup", this.handleCropPointerUp);
    this.cropOverlay.remove();
  }
}
