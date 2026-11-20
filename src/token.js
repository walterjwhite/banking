import { REPO_KEY, ROLE_KEY, TOKEN_KEY } from "./config.js";

const REPO_SHAPE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** A bare key, a #token=… hash, or a whole pairing URL all mean the same thing. */
export function pairingFromText(text) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  if (looksLikeToken(value)) return { token: value, role: "kid", repo: null };
  const hash = value.includes("#") ? value.slice(value.indexOf("#") + 1) : value;
  if (!hash.includes("token=")) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = (params.get("token") ?? "").trim();
  if (!token) return null;
  const repo = (params.get("repo") ?? "").trim();
  return {
    token,
    role: params.get("role") === "parent" ? "parent" : "kid",
    repo: looksLikeRepo(repo) ? repo : null,
  };
}

export function pairingFromHash(hash) {
  return pairingFromText(hash);
}

export function tokenFromHash(hash) {
  return pairingFromHash(hash)?.token ?? null;
}

/** Keeps a hash this app produced out of the address bar and the history. */
export function claimHashToken(hash, { storage, onClaimed } = {}) {
  const claimed = pairingFromHash(hash);
  if (!claimed) return null;
  if (storage) {
    saveToken(claimed.token, storage);
    saveRole(claimed.role, storage);
    if (claimed.repo) saveRepo(claimed.repo, storage);
  }
  if (onClaimed) onClaimed(claimed.token);
  return claimed.token;
}

export function looksLikeToken(value) {
  return /^[A-Za-z0-9_]{20,}$/.test(String(value).trim());
}

export function looksLikeRepo(value) {
  return REPO_SHAPE.test(String(value).trim());
}

export function readToken(storage = globalThis.localStorage) {
  return storage?.getItem(TOKEN_KEY) ?? null;
}

export function saveToken(token, storage = globalThis.localStorage) {
  storage?.setItem(TOKEN_KEY, String(token).trim());
}

export function clearToken(storage = globalThis.localStorage) {
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(ROLE_KEY);
  storage?.removeItem(REPO_KEY);
}

export function readRole(storage = globalThis.localStorage) {
  return storage?.getItem(ROLE_KEY) === "parent" ? "parent" : "kid";
}

export function saveRole(role, storage = globalThis.localStorage) {
  storage?.setItem(ROLE_KEY, role === "parent" ? "parent" : "kid");
}

export function readRepo(storage = globalThis.localStorage) {
  const repo = storage?.getItem(REPO_KEY);
  return repo ? repo.trim() : null;
}

export function saveRepo(repo, storage = globalThis.localStorage) {
  storage?.setItem(REPO_KEY, String(repo).trim());
}

export function pairingUrl(siteUrl, token, role = "kid", repo = null) {
  const url = new URL(siteUrl);
  url.hash = `token=${encodeURIComponent(token)}`;
  if (role === "parent") url.hash += "&role=parent";
  if (repo) url.hash += `&repo=${encodeURIComponent(repo)}`;
  return url.toString();
}

/** Eight hex characters that identify a key without revealing it. */
export async function keyFingerprint(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(token).trim()),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
