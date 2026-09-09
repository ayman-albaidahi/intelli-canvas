const API_BASE_URL = "/api";

/**
 * Parses JSON response from API and returns standard response object.
 * @param {Response} response - Fetch API Response object.
 * @returns {Promise<{ok: boolean, status: number, data: any}>} Response summary with status and parsed JSON data.
 */
async function handleApiResponse(response) {
  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("The API returned an invalid response.");
  }

  return { ok: response.ok, status: response.status, data: result };
}

/**
 * Triggers a browser file download from a Blob.
 * @param {Blob} blob - Blob data to download.
 * @param {string} filename - Filename for the downloaded file.
 */
function downloadBlob(blob, filename) {
  if (!blob || !(blob instanceof Blob)) {
    throw new Error("A valid Blob object is required for download.");
  }
  if (!filename || typeof filename !== "string") {
    throw new Error("A valid filename string is required.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Uploads an image file to create an editing session.
 * @param {File} file - The image file to upload.
 * @returns {Promise<{ok: boolean, status: number, data: any}>} API response data.
 */
async function uploadImage(file) {
  if (!file || !(file instanceof File)) {
    throw new Error("A valid File object is required.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/images`, {
    method: "POST",
    body: formData,
  });

  return handleApiResponse(response);
}

/**
 * Resizes an image session to specified dimensions.
 * @param {string} imageId - Session image ID.
 * @param {number|null} width - Target width in pixels.
 * @param {number|null} height - Target height in pixels.
 * @param {boolean} [lockAspectRatio=true] - Whether to maintain original aspect ratio.
 * @returns {Promise<{ok: boolean, status: number, data: any}>} API response data.
 */
async function resizeImage(imageId, width, height, lockAspectRatio = true) {
  if (!imageId || typeof imageId !== "string") {
    throw new Error("A valid imageId string is required.");
  }
  if (
    (width === undefined || width === null) &&
    (height === undefined || height === null)
  ) {
    throw new Error(
      "At least one dimension (width or height) must be provided.",
    );
  }

  const response = await fetch(`${API_BASE_URL}/transform/resize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_id: imageId,
      width,
      height,
      lock_aspect_ratio: lockAspectRatio,
    }),
  });

  return handleApiResponse(response);
}

async function cropImage(imageId, x, y, width, height) {
  if (!imageId || typeof imageId !== "string") {
    throw new Error("A valid imageId string is required.");
  }

  const response = await fetch(`${API_BASE_URL}/transform/crop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_id: imageId, x, y, width, height }),
  });

  return handleApiResponse(response);
}

/**
 * Rotates an image session by a given angle.
 * @param {string} imageId - Session image ID.
 * @param {number} angle - Angle in degrees (90, -90, or 180).
 * @returns {Promise<{ok: boolean, status: number, data: any}>} API response data.
 */
async function rotateImage(imageId, angle) {
  if (!imageId || typeof imageId !== "string") {
    throw new Error("A valid imageId string is required.");
  }

  const validAngles = [90, -90, 180];
  if (!validAngles.includes(angle)) {
    throw new Error("Angle must be one of: 90, -90, 180.");
  }

  const response = await fetch(`${API_BASE_URL}/transform/rotate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_id: imageId,
      angle,
    }),
  });

  return handleApiResponse(response);
}

/**
 * Flips an image session horizontally or vertically.
 * @param {string} imageId - Session image ID.
 * @param {'horizontal'|'vertical'} direction - Flip direction ('horizontal' or 'vertical').
 * @returns {Promise<{ok: boolean, status: number, data: any}>} API response data.
 */
async function flipImage(imageId, direction) {
  if (!imageId || typeof imageId !== "string") {
    throw new Error("A valid imageId string is required.");
  }

  const validDirections = ["horizontal", "vertical"];
  if (!validDirections.includes(direction)) {
    throw new Error("Direction must be one of: 'horizontal', 'vertical'.");
  }

  const response = await fetch(`${API_BASE_URL}/transform/flip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_id: imageId,
      direction,
    }),
  });

  return handleApiResponse(response);
}

/**
 * Exports an image session in the requested format as a Blob.
 * @param {string} imageId - Session image ID.
 * @param {string} [format='png'] - Target export format ('png', 'jpeg', 'jpg', 'webp').
 * @returns {Promise<Blob>} The exported image file Blob.
 */
async function exportImage(imageId, format = "png") {
  if (!imageId || typeof imageId !== "string") {
    throw new Error("A valid imageId string is required.");
  }

  const validFormats = ["png", "jpeg", "jpg", "webp"];
  const normalizedFormat =
    typeof format === "string" ? format.toLowerCase() : "";
  if (!validFormats.includes(normalizedFormat)) {
    throw new Error("Format must be one of: 'png', 'jpeg', 'jpg', 'webp'.");
  }

  const response = await fetch(`${API_BASE_URL}/images/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_id: imageId,
      format: normalizedFormat,
    }),
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      throw new Error("Failed to export image.");
    }
    throw new Error(errorData?.error?.message || "Failed to export image.");
  }

  return await response.blob();
}

/**
 * Converts an image session to a target format.
 * @param {string} imageId - Session image ID.
 * @param {string} targetFormat - Target format ('png', 'jpeg', 'jpg', 'webp').
 * @returns {Promise<{ok: boolean, status: number, data: any}>} API response data.
 */
async function convertImage(imageId, targetFormat) {
  if (!imageId || typeof imageId !== "string") {
    throw new Error("A valid imageId string is required.");
  }

  const validFormats = ["png", "jpeg", "jpg", "webp"];
  const normalizedFormat =
    typeof targetFormat === "string" ? targetFormat.toLowerCase() : "";
  if (!validFormats.includes(normalizedFormat)) {
    throw new Error(
      "Target format must be one of: 'png', 'jpeg', 'jpg', 'webp'.",
    );
  }

  const response = await fetch(`${API_BASE_URL}/images/convert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_id: imageId,
      target_format: normalizedFormat,
    }),
  });

  return handleApiResponse(response);
}

if (typeof window !== "undefined") {
  window.handleApiResponse = handleApiResponse;
  window.downloadBlob = downloadBlob;
  window.uploadImage = uploadImage;
  window.resizeImage = resizeImage;
  window.rotateImage = rotateImage;
  window.flipImage = flipImage;
  window.exportImage = exportImage;
  window.convertImage = convertImage;
}
