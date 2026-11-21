import { API, CATALOG_CACHE_KEY, CATALOG_FILE } from "./config.js";

/**
 * The charge catalogue is data, not code: `charges.json` lives in the private
 * ledger and is read with the same per-device key as snapshot.json. The shell
 * only renders it, and the amount it shows is a hint — the ledger workflow
 * re-reads its own copy before it posts a charge.
 */

export class CatalogError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CatalogError";
    this.status = status;
  }
}

const AMOUNT = /^\d+(?:\.\d{1,2})?$/;
const FIELDS = new Set(["text", "choice", "number", "date"]);
const EVIDENCE = new Set(["required", "optional", "none"]);

export function catalogUrl(repo, file = CATALOG_FILE) {
  return `${API}/repos/${repo}/contents/${file}`;
}

export async function loadCatalog(token, repo, fetchImpl = globalThis.fetch) {
  if (!repo) throw new CatalogError("No ledger repository is paired with this device.", 0);
  const response = await fetchImpl(catalogUrl(repo), {
    headers: { accept: "application/vnd.github.raw", authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.ok) {
    const catalog = parseCatalog(await response.text());
    if (!catalog) throw new CatalogError(`${CATALOG_FILE} is not valid JSON.`, 0);
    return catalog;
  }
  if (response.status === 404) return { version: 0, currency: "USD", items: [], missing: true };
  throw new CatalogError(explainCatalog(response.status), response.status);
}

export function explainCatalog(status) {
  if (status === 401) return "That key was rejected (401). It may have expired or been revoked.";
  if (status === 403) return "GitHub refused the key (403): a rate limit or a missing permission (Contents: read).";
  if (status === 404) return `The ledger has no ${CATALOG_FILE}, so no charges are configured.`;
  if (status === 0) return "No connection to GitHub.";
  return `Could not read the charge list (${status}).`;
}

/** Drops entries the shell cannot render instead of trusting the whole file. */
export function parseCatalog(text) {
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const seen = new Set();
  const items = [];
  for (const raw of Array.isArray(data.items) ? data.items : []) {
    const item = normalizeItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  const currency = text_(data.currency).toUpperCase();
  return {
    version: Number.isInteger(Number(data.version)) ? Number(data.version) : 0,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    items,
  };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = text_(raw.id);
  const label = text_(raw.label);
  const amount = text_(raw.amount);
  if (!id || !label || !AMOUNT.test(amount)) return null;
  const evidence = text_(raw.evidence).toLowerCase();
  const rawFields = Array.isArray(raw.fields) ? raw.fields : [];
  const fields = rawFields.map(normalizeField);
  // A field the shell cannot draw would silently weaken the report the ledger
  // expects, so the whole entry is skipped rather than shown half-filled.
  if (fields.some((field) => !field)) return null;
  return {
    id,
    label,
    kind: raw.kind === "credit" ? "credit" : "debit",
    amount: padAmount(amount),
    description: text_(raw.description),
    evidence: EVIDENCE.has(evidence) ? evidence : "optional",
    fields,
  };
}

function normalizeField(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = text_(raw.name);
  if (!name) return null;
  const type = FIELDS.has(raw.type) ? raw.type : "text";
  const options = (Array.isArray(raw.options) ? raw.options : []).map(text_).filter(Boolean);
  if (type === "choice" && options.length === 0) return null;
  return {
    name,
    label: text_(raw.label) || name,
    type,
    required: Boolean(raw.required),
    options,
  };
}

function padAmount(amount) {
  const [whole, fraction = ""] = amount.split(".");
  return `${Number(whole)}.${`${fraction}00`.slice(0, 2)}`;
}

function text_(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function saveCachedCatalog(catalog) {
  try {
    globalThis.localStorage?.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
  } catch {
    /* a full or blocked store only costs the offline copy */
  }
}

export function readCachedCatalog() {
  try {
    const text = globalThis.localStorage?.getItem(CATALOG_CACHE_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
