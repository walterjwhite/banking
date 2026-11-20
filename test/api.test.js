import assert from "node:assert/strict";
import { test } from "node:test";
import { authHeaders, explain, loadSnapshot, repoUrl, snapshotUrl } from "../src/api.js";

const TOKEN = "github_pat_example";
const REPO = "example-org/example-ledger";

function sequenceFetch(...statuses) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    const status = statuses.length > 1 ? statuses.shift() : statuses[0];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ accounts: [{ name: "Sample" }] }),
    };
  };
  impl.calls = calls;
  return impl;
}

test("snapshotUrl targets the paired ledger repository", () => {
  assert.equal(
    snapshotUrl(REPO),
    "https://api.github.com/repos/example-org/example-ledger/contents/snapshot.json",
  );
});

test("repoUrl targets the repository itself", () => {
  assert.equal(repoUrl(REPO), "https://api.github.com/repos/example-org/example-ledger");
});

test("loadSnapshot requires a paired repo", async () => {
  await assert.rejects(
    () => loadSnapshot(TOKEN, null, sequenceFetch(200)),
    /No ledger repository/,
  );
});

test("loadSnapshot sends the key and returns the snapshot", async () => {
  const fetchImpl = sequenceFetch(200);
  const snapshot = await loadSnapshot(TOKEN, REPO, fetchImpl);

  assert.deepEqual(snapshot, { accounts: [{ name: "Sample" }] });
  assert.equal(fetchImpl.calls[0].url, snapshotUrl(REPO));
  assert.equal(fetchImpl.calls[0].options.headers.authorization, `Bearer ${TOKEN}`);
});

test("authHeaders asks for the raw file", () => {
  assert.equal(authHeaders(TOKEN).accept, "application/vnd.github.raw");
});

test("loadSnapshot explains a rejected key", async () => {
  await assert.rejects(
    () => loadSnapshot(TOKEN, REPO, sequenceFetch(401)),
    (error) => error.status === 401 && /expired or been revoked/.test(error.message),
  );
});

test("a 404 on a repo the key cannot see blames the key", async () => {
  await assert.rejects(
    () => loadSnapshot(TOKEN, REPO, sequenceFetch(404, 404)),
    (error) =>
      error.status === 404 &&
      /cannot see example-org\/example-ledger/.test(error.message),
  );
});

test("a 404 on a visible repo blames the missing snapshot", async () => {
  await assert.rejects(
    () => loadSnapshot(TOKEN, REPO, sequenceFetch(404, 200)),
    (error) => error.status === 404 && /snapshot\.json is missing/.test(error.message),
  );
});

test("explain covers the remaining statuses", () => {
  assert.match(explain(403, REPO), /permission/);
  assert.match(explain(0, REPO), /No connection/);
  assert.match(explain(500, REPO), /500/);
});
