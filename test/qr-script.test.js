import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.join(process.cwd(), "scripts", "token-qr.mjs");
const work = mkdtempSync(path.join(tmpdir(), "bank-qr-"));
const TOKEN = `github_pat_${"A".repeat(24)}`;
const REPO = "example-org/example-ledger";

function run(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("without a key it warns that the old QR is stale and writes nothing", () => {
  const out = path.join(work, "stale.svg");
  writeFileSync(out, "<svg>old</svg>");

  const result = run(["--out", out], { BANK_TOKEN: "" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No key supplied/);
  assert.match(result.stderr, /still holds an older key/);
  assert.equal(readFileSync(out, "utf8"), "<svg>old</svg>");
});

test("a junk value is not accepted as a key", () => {
  const result = run(["--out", path.join(work, "junk.svg")], { BANK_TOKEN: "not-a-key" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not look like a GitHub token/);
});

test("a key without a repo is refused", () => {
  const result = run(["--out", path.join(work, "norepo.svg")], {
    BANK_TOKEN: TOKEN,
    BANK_REPO: "",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No ledger repo supplied/);
});

test("a parent QR is written and its key fingerprint printed", () => {
  const out = path.join(work, "parent.svg");

  const result = run(["--role", "parent", "--out", out], { BANK_TOKEN: TOKEN, BANK_REPO: REPO });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /as a parent device/);
  assert.match(result.stdout, new RegExp(`repo ${REPO}`));
  assert.match(result.stdout, /key [0-9a-f]{8}/);
  assert.match(readFileSync(out, "utf8"), /<svg/);
});

test("a kid QR needs an account name", () => {
  const result = run(["--out", path.join(work, "kid-no-account.svg")], {
    BANK_TOKEN: TOKEN,
    BANK_REPO: REPO,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /account name/);
});

test("a kid QR carries the account name", () => {
  const out = path.join(work, "kid.svg");

  const result = run(["--account", "Kid A", "--out", out], { BANK_TOKEN: TOKEN, BANK_REPO: REPO });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /account Kid A/);
  assert.match(result.stdout, /as a kid device/);
  assert.match(readFileSync(out, "utf8"), /<svg/);
});
