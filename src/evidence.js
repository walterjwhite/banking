import { API } from "./config.js";

/**
 * Photos are re-encoded through a canvas: that caps them at 1080p and drops
 * EXIF (including GPS) on the way. The result is uploaded to the private
 * ledger with the Contents API, then the issue body carries the path and hash.
 */

export const MAX_PHOTO_WIDTH = 1920;
export const MAX_PHOTO_HEIGHT = 1080;
export const MAX_PHOTO_BYTES = 1_500_000;

export class EvidenceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "EvidenceError";
    this.status = status;
  }
}

export function scaleToFit(width, height, maxWidth = MAX_PHOTO_WIDTH, maxHeight = MAX_PHOTO_HEIGHT) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return { width: 0, height: 0, scale: 1 };
  const scale = Math.min(1, maxWidth / w, maxHeight / h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

export async function preparePhoto(file, options = {}) {
  const {
    maxWidth = MAX_PHOTO_WIDTH,
    maxHeight = MAX_PHOTO_HEIGHT,
    maxBytes = MAX_PHOTO_BYTES,
    quality = 0.82,
    decode = decodeImage,
    encode = encodeJpeg,
  } = options;
  const image = await decode(file);
  try {
    const fit = scaleToFit(image.width, image.height, maxWidth, maxHeight);
    let width = fit.width;
    let height = fit.height;
    let attempt = quality;
    let blob = await encode(image, width, height, attempt);
    while (blob.size > maxBytes && width > 320 && height > 180) {
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
      attempt = Math.max(0.5, attempt - 0.08);
      blob = await encode(image, width, height, attempt);
    }
    return {
      blob,
      width,
      height,
      bytes: blob.size,
      mediaType: "image/jpeg",
      sha256: await sha256Hex(blob),
    };
  } finally {
    image.close?.();
  }
}

export function evidencePath(when, id, dir = "evidence") {
  const date = when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date();
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const safe = String(id).replace(/[^A-Za-z0-9._-]/g, "");
  return `${dir}/${month}/${safe}.jpg`;
}

export function contentsUrl(repo, path) {
  return `${API}/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadEvidence({ repo, token, path, bytes, message = null }, fetchImpl = globalThis.fetch) {
  if (!repo) throw new EvidenceError("No ledger repository is paired with this device.", 0);
  const response = await fetchImpl(contentsUrl(repo, path), {
    method: "PUT",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: message ?? `evidence: ${path}`,
      content: bytesToBase64(bytes),
    }),
  });
  if (response.ok) {
    const body = await response.json();
    return {
      path,
      url: body.content?.html_url ?? null,
      sha: body.content?.sha ?? null,
    };
  }
  throw new EvidenceError(explainUpload(response.status), response.status);
}

export function explainUpload(status) {
  if (status === 401) return "That key was rejected (401). It may have expired or been revoked.";
  if (status === 403)
    return "This key can read the ledger but not store the photo. Saving evidence needs Contents: read and write.";
  if (status === 404) return "That key cannot write to the ledger repository (404).";
  if (status === 422) return "GitHub refused the upload (422). A file with that name may already exist.";
  if (status === 0) return "No connection to GitHub, so the photo was not saved.";
  return `Could not save the photo (${status}).`;
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  throw new EvidenceError("This browser cannot read that picture.", 0);
}

async function encodeJpeg(image, width, height, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new EvidenceError("This browser cannot resize that picture.", 0);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new EvidenceError("That picture could not be resized.", 0);
  return blob;
}

async function sha256Hex(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
