import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCharge, chargeIssue, collectAnswers, newChargeId } from "../src/charge.js";

const ENTRY = {
  id: "mess.table",
  label: "Table not wiped",
  kind: "debit",
  amount: "2.00",
  evidence: "required",
  fields: [
    { name: "location", label: "Where", type: "choice", required: true, options: ["kitchen table", "dining table"] },
    { name: "count", label: "How many", type: "number", required: false, options: [] },
  ],
};

test("collectAnswers trims, validates and skips optional blanks", () => {
  const answers = collectAnswers(ENTRY, (name) =>
    ({ location: " kitchen table ", count: "" })[name],
  );
  assert.deepEqual(answers, { location: "kitchen table" });
});

test("collectAnswers rejects missing required and unknown choices", () => {
  assert.throws(() => collectAnswers(ENTRY, () => ""), /Fill in Where/);
  assert.throws(
    () => collectAnswers(ENTRY, (name) => (name === "location" ? "garage" : "")),
    /has to be one of/,
  );
  assert.throws(
    () => collectAnswers(ENTRY, (name) => (name === "location" ? "kitchen table" : "lots")),
    /has to be a number/,
  );
});

test("buildCharge keeps the ledger-facing keys and adds the report data", () => {
  const report = buildCharge({
    id: "00000000-0000-4000-8000-000000000000",
    entry: ENTRY,
    subject: "Kid A",
    reportedBy: "Parent",
    note: "   ",
    occurredAt: "2026-11-21T10:00:00.000Z",
    policy: { version: 3, currency: "USD" },
    answers: { location: "kitchen table" },
    evidence: [{ path: "evidence/2026-11/a.jpg", sha256: "abc" }],
  });

  assert.equal(report.type, "charge");
  assert.equal(report.account, "Kid A");
  assert.equal(report.amount, "2.00");
  assert.equal(report.charge, "mess.table");
  assert.equal(report.kind, "debit");
  assert.equal(report.description, "Table not wiped");
  assert.equal(report.reported_by, "Parent");
  assert.equal(report.occurred_at, "2026-11-21T10:00:00.000Z");
  assert.deepEqual(report.policy, { version: 3, currency: "USD" });
  assert.equal(report.evidence[0].path, "evidence/2026-11/a.jpg");
});

test("buildCharge requires an entry and a subject", () => {
  assert.throws(() => buildCharge({ entry: null, subject: "Kid A" }), /Choose a charge/);
  assert.throws(() => buildCharge({ entry: ENTRY, subject: "  " }), /account to charge/);
});

test("chargeIssue fences json and asks for /approve", () => {
  const issue = chargeIssue(
    buildCharge({ entry: ENTRY, subject: "Kid A", occurredAt: "2026-11-21T10:00:00.000Z" }),
  );
  assert.equal(issue.title, "charge: Kid A 2.00");
  assert.match(issue.body, /```json/);
  assert.match(issue.body, /"charge": "mess.table"/);
  assert.match(issue.body, /\/approve/);
});

test("newChargeId falls back to a random UUID shape", () => {
  const id = newChargeId({ getRandomValues: (bytes) => bytes.fill(7) });
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
