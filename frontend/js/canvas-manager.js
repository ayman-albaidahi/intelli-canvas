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

    if (!this.context) {
      throw new Error("The browser could not create a 2D canvas context.");
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage || this.canvas);
    this.resize();
  }

  async loadImage(source) {
    const image = await this.createImage(source);
    const previousObjectUrl = this.imageSource instanceof File ? this.image?.src : null;

    this.image = image;
    this.imageSource = source;

    if (previousObjectUrl) {
      URL.revokeObjectURL(previousObjectUrl);
    }

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
    const rect = this.stage?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const devicePixelRatio = window.devicePixelRatio || 1;

    this.canvas.width = Math.floor(cssWidth * devicePixelRatio);
    this.canvas.height = Math.floor(cssHeight * devicePixelRatio);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.context.clearRect(0, 0, cssWidth, cssHeight);

    if (!this.image) {
      this.imageBounds = null;
      return;
    }

    const scale = Math.min(
      cssWidth / this.image.naturalWidth,
      cssHeight / this.image.naturalHeight,
    );
    const width = this.image.naturalWidth * scale;
    const height = this.image.naturalHeight * scale;
    const x = (cssWidth - width) / 2;
    const y = (cssHeight - height) / 2;

    this.imageBounds = { x, y, width, height, scale };
    this.context.drawImage(this.image, x, y, width, height);
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
    };
  }

  destroy() {
    this.resizeObserver.disconnect();

    if (this.imageSource instanceof File && this.image?.src) {
      URL.revokeObjectURL(this.image.src);
    }
  }
}

window.CanvasManager = CanvasManager;
