import { API, SNAPSHOT_CACHE_KEY } from "./config.js";

export class SnapshotError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "SnapshotError";
    this.status = status;
  }
}

export function snapshotUrl(repo) {
  return `${API}/repos/${repo}/contents/snapshot.json`;
}

export function repoUrl(repo) {
  return `${API}/repos/${repo}`;
}

export function authHeaders(token) {
  return {
    accept: "application/vnd.github.raw",
    authorization: `Bearer ${token}`,
  };
}

export async function loadSnapshot(token, repo, fetchImpl = globalThis.fetch) {
  if (!repo) throw new SnapshotError("No ledger repository is paired with this device.", 0);
  const response = await fetchImpl(snapshotUrl(repo), {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (response.ok) return response.json();
  const message = await explainStatus(response.status, token, repo, fetchImpl);
  throw new SnapshotError(message, response.status);
}

/** A 404 means "no key access" or "no snapshot.json"; ask the repo which. */
export async function explainStatus(status, token, repo, fetchImpl = globalThis.fetch) {
  if (status !== 404) return explain(status, repo);
  return (await repoVisible(token, repo, fetchImpl))
    ? "The ledger is reachable, but snapshot.json is missing (404). The branch that holds it has not been published."
    : explain(status, repo);
}

async function repoVisible(token, repo, fetchImpl) {
  try {
    const response = await fetchImpl(repoUrl(repo), {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function explain(status, repo) {
  if (status === 401) return "That key was rejected (401). It may have expired or been revoked.";
  if (status === 403) return "GitHub refused the key (403): a rate limit or a missing permission (Contents: read).";
  if (status === 404) return `That key cannot see ${repo} (404). Check that the key can access that repository.`;
  if (status === 0) return "No connection to GitHub.";
  return `Could not reach ${repo} (${status}).`;
}

/** Balances are not secret once they are on the phone; keep the last copy. */
export function saveCached(snapshot) {
  try {
    globalThis.localStorage?.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* a full or blocked store only costs the offline copy */
  }
}

export function readCached() {
  try {
    const text = globalThis.localStorage?.getItem(SNAPSHOT_CACHE_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
