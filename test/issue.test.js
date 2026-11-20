import assert from "node:assert/strict";
import { test } from "node:test";
import { createIssue, explainIssue, issueTitle, issuesUrl } from "../src/issue.js";

const TOKEN = "github_pat_example";
const REPO = "example-org/example-ledger";
const REQUEST = {
  account: "Sample",
  type: "deposit",
  amount: "25.00",
  description: "birthday money",
};

function fakeFetch(status, body = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test("issuesUrl targets the paired ledger issue collection", () => {
  assert.equal(
    issuesUrl(REPO),
    "https://api.github.com/repos/example-org/example-ledger/issues",
  );
});

test("issueTitle names the account and amount", () => {
  assert.equal(issueTitle(REQUEST), "deposit: Sample 25.00");
});

test("createIssue posts the request with the device key", async () => {
  const fetchImpl = fakeFetch(201, { number: 42, html_url: "https://github.com/x/y/issues/42" });
  const issue = await createIssue(REQUEST, TOKEN, REPO, fetchImpl);

  assert.deepEqual(issue, { number: 42, url: "https://github.com/x/y/issues/42" });
  const [call] = fetchImpl.calls;
  assert.equal(call.url, issuesUrl(REPO));
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(call.options.headers["content-type"], "application/json");

  const body = JSON.parse(call.options.body);
  assert.equal(body.title, "deposit: Sample 25.00");
  assert.match(body.body, /```json/);
  assert.match(body.body, /"amount": "25.00"/);
});

test("a read-only key is told to add Issues: write", async () => {
  await assert.rejects(
    () => createIssue(REQUEST, TOKEN, REPO, fakeFetch(403)),
    (error) => error.status === 403 && /Issues: read and write/.test(error.message),
  );
});

test("explainIssue covers the remaining statuses", () => {
  assert.match(explainIssue(401), /rejected/);
  assert.match(explainIssue(404), /cannot see/);
  assert.match(explainIssue(410), /Issues are disabled/);
  assert.match(explainIssue(500), /500/);
});
