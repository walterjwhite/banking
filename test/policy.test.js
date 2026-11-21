import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogUrl, explainCatalog, loadCatalog, parseCatalog } from "../src/policy.js";

const TOKEN = "github_pat_example";
const REPO = "example-org/example-ledger";

function fakeFetch(status, body = "") {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test("catalogUrl reads the charge list from the paired ledger", () => {
  assert.equal(
    catalogUrl(REPO),
    "https://api.github.com/repos/example-org/example-ledger/contents/charges.json",
  );
});

test("parseCatalog keeps usable entries and pads amounts", () => {
  const catalog = parseCatalog(
    JSON.stringify({
      version: 3,
      currency: "cad",
      items: [
        {
          id: "mess.table",
          label: "Table not wiped",
          amount: "2",
          kind: "debit",
          evidence: "required",
          fields: [{ name: "location", label: "Where", type: "choice", options: ["kitchen table"] }],
        },
        { id: "bad-amount", label: "No amount", amount: "two dollars" },
        { id: "mess.table", label: "Duplicate id", amount: "9" },
      ],
    }),
  );
  assert.equal(catalog.version, 3);
  assert.equal(catalog.currency, "CAD");
  assert.equal(catalog.items.length, 1);
  const [entry] = catalog.items;
  assert.equal(entry.amount, "2.00");
  assert.equal(entry.evidence, "required");
  assert.deepEqual(entry.fields, [
    { name: "location", label: "Where", type: "choice", required: false, options: ["kitchen table"] },
  ]);
});

test("parseCatalog defaults and drops unrenderable pieces", () => {
  const catalog = parseCatalog(
    JSON.stringify({
      items: [
        { id: "chore", label: "Dishes", amount: "1.5" },
        { id: "empty-choice", label: "Broken", amount: "1", fields: [{ name: "x", type: "choice" }] },
      ],
    }),
  );
  assert.equal(catalog.version, 0);
  assert.equal(catalog.currency, "USD");
  assert.equal(catalog.items.length, 1);
  assert.equal(catalog.items[0].amount, "1.50");
  assert.equal(catalog.items[0].kind, "debit");
  assert.equal(catalog.items[0].evidence, "optional");
  assert.deepEqual(catalog.items[0].fields, []);
});

test("parseCatalog rejects text that is not an object", () => {
  assert.equal(parseCatalog("not json"), null);
  assert.equal(parseCatalog("[]"), null);
});

test("a missing charges.json is an empty list, not an error", async () => {
  const fetchImpl = fakeFetch(404);
  const catalog = await loadCatalog(TOKEN, REPO, fetchImpl);
  assert.deepEqual(catalog, { version: 0, currency: "USD", items: [], missing: true });
  assert.equal(fetchImpl.calls[0].options.headers.authorization, `Bearer ${TOKEN}`);
});

test("loadCatalog parses the raw file from the ledger", async () => {
  const fetchImpl = fakeFetch(200, JSON.stringify({ version: 1, items: [{ id: "a", label: "A", amount: "1" }] }));
  const catalog = await loadCatalog(TOKEN, REPO, fetchImpl);
  assert.equal(catalog.items[0].id, "a");
  assert.equal(fetchImpl.calls[0].url, catalogUrl(REPO));
});

test("a key without Contents: read is explained", async () => {
  await assert.rejects(
    () => loadCatalog(TOKEN, REPO, fakeFetch(403)),
    (error) => error.status === 403 && /Contents: read/.test(error.message),
  );
  assert.match(explainCatalog(401), /rejected/);
  assert.match(explainCatalog(500), /500/);
});
