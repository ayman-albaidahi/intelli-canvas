async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/images", {
    method: "POST",
    body: formData,
  });

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("The API returned an invalid response.");
  }

  return { ok: response.ok, status: response.status, data: result };
}

async function transformImage(path, payload) {
  const response = await fetch(`/api/transform/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("The API returned an invalid response.");
  }

  return { ok: response.ok, status: response.status, data: result };
}

function getImageContentUrl(imageId) {
  return `/api/images/${encodeURIComponent(imageId)}/content`;
}
