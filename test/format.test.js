import assert from "node:assert/strict";
import { test } from "node:test";
import { money, percent, signed } from "../src/format.js";

test("money formats ledger strings as currency", () => {
  assert.equal(money("1234.56"), "$1,234.56");
  assert.equal(money("0.05"), "$0.05");
  assert.equal(money("-12.30"), "-$12.30");
});

test("signed shows the direction of a posting", () => {
  assert.equal(signed("25.00"), "+$25.00");
  assert.equal(signed("-25.00"), "−$25.00");
});

test("percent renders an annual rate", () => {
  assert.equal(percent(0.04), "4.00%");
  assert.equal(percent(undefined), "—");
});
