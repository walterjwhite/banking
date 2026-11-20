import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimHashToken,
  keyFingerprint,
  looksLikeRepo,
  looksLikeToken,
  pairingFromHash,
  pairingFromText,
  pairingUrl,
  readRepo,
  readRole,
  tokenFromHash,
} from "../src/token.js";

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
}

test("tokenFromHash reads the key a QR delivers", () => {
  assert.equal(tokenFromHash("#token=github_pat_abc"), "github_pat_abc");
  assert.equal(tokenFromHash("#token=a%20b"), "a b");
  assert.equal(tokenFromHash("#token="), null);
  assert.equal(tokenFromHash("#nothing=1"), null);
  assert.equal(tokenFromHash(""), null);
});

test("pairingFromText accepts a whole link, a hash, or a bare key", () => {
  const link = "https://walterjwhite.github.io/banking/#token=github_pat_abc&role=parent&repo=example-org%2Fexample-ledger";
  assert.equal(pairingFromText(link).token, "github_pat_abc");
  assert.equal(pairingFromText(link).role, "parent");
  assert.equal(pairingFromText(link).repo, "example-org/example-ledger");
  assert.equal(pairingFromText("#token=github_pat_abc").role, "kid");
  assert.equal(pairingFromText("#token=github_pat_abc").repo, null);
  assert.equal(pairingFromText("github_pat_11ABCDEFG0123456789").role, "kid");
  assert.equal(pairingFromText("github_pat_11ABCDEFG0123456789").repo, null);
  assert.equal(pairingFromText("hello there"), null);
  assert.equal(pairingFromText(""), null);
});

test("pairingFromHash marks only approving devices as parents", () => {
  assert.equal(pairingFromHash("#token=github_pat_abc").role, "kid");
  assert.equal(pairingFromHash("#token=github_pat_abc&role=parent").role, "parent");
  assert.equal(pairingFromHash("#token=github_pat_abc&role=owner").role, "kid");
  assert.equal(pairingFromHash("#token=github_pat_abc&repo=example-org%2Fexample-ledger").repo, "example-org/example-ledger");
  assert.equal(pairingFromHash("#role=parent"), null);
});

test("claimHashToken stores the key, role and repo once and strips them", () => {
  const storage = memoryStorage();
  let stripped = 0;
  const token = claimHashToken("#token=github_pat_abc&role=parent&repo=example-org%2Fexample-ledger", {
    storage,
    onClaimed: () => {
      stripped += 1;
    },
  });
  assert.equal(token, "github_pat_abc");
  assert.equal(storage.getItem("family-bank.token"), "github_pat_abc");
  assert.equal(storage.getItem("family-bank.role"), "parent");
  assert.equal(readRepo(storage), "example-org/example-ledger");
  assert.equal(stripped, 1);
  assert.equal(claimHashToken("", { storage }), null);
  assert.equal(stripped, 1);
});

test("readRole defaults to kid and readRepo defaults to null", () => {
  const storage = memoryStorage();
  assert.equal(readRole(storage), "kid");
  assert.equal(readRepo(storage), null);
});

test("pairingUrl adds role and repo only when asked", () => {
  assert.equal(
    pairingUrl("https://example.test/banking/", "github_pat_abc"),
    "https://example.test/banking/#token=github_pat_abc",
  );
  assert.equal(
    pairingUrl("https://example.test/banking/", "github_pat_abc", "parent", "example-org/example-ledger"),
    "https://example.test/banking/#token=github_pat_abc&role=parent&repo=example-org%2Fexample-ledger",
  );
  assert.equal(
    pairingUrl("https://example.test/banking/", "github_pat_abc", "kid", "example-org/example-ledger"),
    "https://example.test/banking/#token=github_pat_abc&repo=example-org%2Fexample-ledger",
  );
});

test("looksLikeRepo accepts owner/name only", () => {
  assert.equal(looksLikeRepo("example-org/example-ledger"), true);
  assert.equal(looksLikeRepo("example-org"), false);
  assert.equal(looksLikeRepo("example-org/example-ledger/extra"), false);
});

test("keyFingerprint is short, stable and key-specific", async () => {
  const first = await keyFingerprint("github_pat_abc");
  assert.equal(first, await keyFingerprint("github_pat_abc"));
  assert.notEqual(first, await keyFingerprint("github_pat_abd"));
  assert.match(first, /^[0-9a-f]{8}$/);
});

test("looksLikeToken rejects prose", () => {
  assert.equal(looksLikeToken("github_pat_11ABCDEFG0123456789"), true);
  assert.equal(looksLikeToken("scan this please"), false);
  assert.equal(looksLikeToken("short"), false);
});
