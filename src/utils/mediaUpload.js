import { apiBaseUrl } from "../lib/api";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export function isUploadedImageUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function dataUrlToBlob(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid data URL format.");
  }
  const meta = dataUrl.slice(0, commaIndex);
  const mimeMatch = meta.match(/^data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : "application/octet-stream";
  const isBase64 = meta.includes(";base64");
  const rawData = dataUrl.slice(commaIndex + 1);

  if (isBase64) {
    const byteCharacters = atob(rawData);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([byteNumbers], { type: mimeType });
  }

  const decoded = decodeURIComponent(rawData);
  return new Blob([decoded], { type: mimeType });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!String(src || "").startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not process image."));
    img.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas conversion to Blob failed."));
        }
      },
      type,
      quality
    );
  });
}

export async function uploadImageDataUrl(dataUrl, { kind, token } = {}) {
  if (!dataUrl) {
    return dataUrl;
  }

  if (isUploadedImageUrl(dataUrl)) {
    return dataUrl;
  }

  let blob = dataUrlToBlob(dataUrl);

  const isJpeg = blob.type === "image/jpeg" || blob.type === "image/jpg";
  const isPng = blob.type === "image/png";
  const isWebp = blob.type === "image/webp";

  // Re-encode non-jpeg/png/webp through canvas
  if (!isJpeg && !isPng && !isWebp) {
    const isSourcePng = blob.type.toLowerCase().includes("png");
    const targetType = isSourcePng ? "image/png" : "image/jpeg";
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not process image on canvas.");
    }
    if (targetType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    blob = await canvasToBlob(canvas, targetType, targetType === "image/jpeg" ? 0.92 : undefined);
  }

  // If larger than 2 MB, re-encode to webp with qualities [0.9, 0.8, 0.7, 0.6]
  if (blob.size > MAX_BYTES) {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not process image on canvas.");
    }
    ctx.drawImage(img, 0, 0);

    let underLimitBlob = null;
    const qualities = [0.9, 0.8, 0.7, 0.6];
    for (const q of qualities) {
      const candidate = await canvasToBlob(canvas, "image/webp", q);
      if (candidate.size <= MAX_BYTES) {
        underLimitBlob = candidate;
        break;
      }
    }

    if (!underLimitBlob) {
      throw new Error("This image is too large. Please use an image under 2 MB.");
    }

    blob = underLimitBlob;
  }

  let contentType = blob.type;
  if (contentType === "image/jpg") {
    contentType = "image/jpeg";
  }

  let presignRes;
  try {
    presignRes = await fetch(`${apiBaseUrl || ""}/api/media/presign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ kind, contentType })
    });
  } catch {
    throw new Error("Failed to connect to image upload service.");
  }

  if (presignRes.status === 503) {
    return dataUrl;
  }

  if (presignRes.status === 401 || presignRes.status === 403) {
    throw new Error("Your session expired or you do not have permission to upload images. Please sign in again.");
  }

  if (!presignRes.ok) {
    let msg = "Could not prepare image upload.";
    try {
      const errorData = await presignRes.json();
      if (errorData && typeof errorData.message === "string") {
        msg = errorData.message;
      }
    } catch {
      // Use fallback msg
    }
    throw new Error(msg);
  }

  let presignData;
  try {
    presignData = await presignRes.json();
  } catch {
    throw new Error("Invalid response from image upload service.");
  }

  if (!presignData || !presignData.url || !presignData.publicUrl) {
    throw new Error("Image upload service returned incomplete presign data.");
  }

  const formData = new FormData();
  if (presignData.fields && typeof presignData.fields === "object") {
    for (const [key, value] of Object.entries(presignData.fields)) {
      formData.append(key, value);
    }
  }

  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  formData.append("file", blob, `upload.${ext}`);

  let s3Res;
  try {
    s3Res = await fetch(presignData.url, {
      method: "POST",
      body: formData
    });
  } catch {
    throw new Error("Image upload failed. Please try again.");
  }

  if (!s3Res.ok) {
    console.warn(`[mediaUpload] S3 upload failed with status ${s3Res.status}`);
    throw new Error("Image upload failed. Please try again.");
  }

  return presignData.publicUrl;
}
