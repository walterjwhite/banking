import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRequest,
  issueUrl,
  normalizeAmount,
  requestBody,
} from "../src/request.js";

const REPO = "example-org/example-ledger";

test("normalizeAmount pads to two decimals", () => {
  assert.equal(normalizeAmount("25"), "25.00");
  assert.equal(normalizeAmount("25.5"), "25.50");
  assert.equal(normalizeAmount(" 0.09 "), "0.09");
});

test("normalizeAmount rejects unusable input", () => {
  assert.throws(() => normalizeAmount("25.555"));
  assert.throws(() => normalizeAmount("-5"));
  assert.throws(() => normalizeAmount("ten"));
  assert.throws(() => normalizeAmount(""));
});

test("buildRequest trims the description", () => {
  const request = buildRequest({
    account: "Sample",
    type: "deposit",
    amount: "25",
    description: "  cash  ",
  });
  assert.deepEqual(request, {
    account: "Sample",
    type: "deposit",
    amount: "25.00",
    description: "cash",
  });
});

test("requestBody contains a fenced json block", () => {
  const body = requestBody({
    account: "Sample",
    type: "deposit",
    amount: "25.00",
    description: "cash",
  });
  assert.match(body, /```json/);
  assert.match(body, /\/approve/);
});

test("issueUrl prefills the GitHub issue", () => {
  const url = issueUrl(
    buildRequest({
      account: "Sample",
      type: "deposit",
      amount: "25",
      description: "cash",
    }),
    REPO,
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/example-org/example-ledger/issues/new");
  assert.equal(parsed.searchParams.get("title"), "deposit: Sample 25.00");
  assert.match(parsed.searchParams.get("body"), /"amount": "25.00"/);
});
