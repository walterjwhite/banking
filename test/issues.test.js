import assert from "node:assert/strict";
import { test } from "node:test";
import { commentOnIssue, issueWebUrl, issuesUrl, listOpenRequests } from "../src/issues.js";

const TOKEN = "github_pat_example";
const REPO = "example-org/example-ledger";

function fakeFetch(status, body = []) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test("issuesUrl lists the paired ledger issues", () => {
  assert.equal(
    issuesUrl(REPO),
    "https://api.github.com/repos/example-org/example-ledger/issues",
  );
});

test("issueWebUrl links to the issue page", () => {
  assert.equal(
    issueWebUrl(42, REPO),
    "https://github.com/example-org/example-ledger/issues/42",
  );
});

test("listOpenRequests keeps issues and drops pull requests", async () => {
  const fetchImpl = fakeFetch(200, [
    { number: 7, title: "deposit: Sample 25.00", user: { login: "kid" }, html_url: "https://x/7" },
    { number: 8, title: "a pull request", pull_request: {} },
  ]);
  const requests = await listOpenRequests(TOKEN, REPO, fetchImpl);

  assert.deepEqual(requests, [
    { number: 7, title: "deposit: Sample 25.00", author: "kid", url: "https://x/7" },
  ]);
  assert.match(fetchImpl.calls[0].url, /state=open/);
  assert.equal(fetchImpl.calls[0].options.headers.authorization, `Bearer ${TOKEN}`);
});

test("commentOnIssue posts the verb", async () => {
  const fetchImpl = fakeFetch(201, { id: 1 });
  await commentOnIssue(7, "/approve", TOKEN, REPO, fetchImpl);

  const [call] = fetchImpl.calls;
  assert.equal(call.url, `${issuesUrl(REPO)}/7/comments`);
  assert.equal(call.options.method, "POST");
  assert.deepEqual(JSON.parse(call.options.body), { body: "/approve" });
});

test("a key without Issues: write is explained", async () => {
  await assert.rejects(
    () => commentOnIssue(7, "/approve", TOKEN, REPO, fakeFetch(403)),
    (error) => error.status === 403 && /Issues: read and write/.test(error.message),
  );
});
