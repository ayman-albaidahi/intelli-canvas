async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/images", {
    method: "POST",
    body: formData,
  });

  const result = await response.json();
  return { ok: response.ok, status: response.status, data: result };
}
