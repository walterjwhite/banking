import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bytesToBase64,
  contentsUrl,
  evidencePath,
  explainUpload,
  preparePhoto,
  scaleToFit,
  uploadEvidence,
} from "../src/evidence.js";

const TOKEN = "github_pat_example";
const REPO = "example-org/example-ledger";

test("scaleToFit caps the long edge at 1080p without enlarging", () => {
  assert.deepEqual(scaleToFit(4000, 3000), { width: 1440, height: 1080, scale: 0.36 });
  assert.deepEqual(scaleToFit(1080, 1920), { width: 608, height: 1080, scale: 0.5625 });
  assert.deepEqual(scaleToFit(800, 600), { width: 800, height: 600, scale: 1 });
  assert.deepEqual(scaleToFit(0, 0), { width: 0, height: 0, scale: 1 });
});

test("evidencePath is dated and keyed by the report id", () => {
  assert.equal(
    evidencePath(new Date("2026-11-21T23:00:00.000Z"), "abc-123"),
    "evidence/2026-11/abc-123.jpg",
  );
  assert.match(evidencePath("not a date", "id/with spaces"), /^evidence\/\d{4}-\d{2}\/idwithspaces\.jpg$/);
});

test("bytesToBase64 converts without a call-stack blowup", () => {
  assert.equal(bytesToBase64(new Uint8Array([0x48, 0x49])), "SEk=");
  assert.equal(bytesToBase64(new Uint8Array(100_000).fill(65)).length, 133_336);
});

test("uploadEvidence PUTs base64 content to the ledger", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 201,
      json: async () => ({ content: { html_url: "https://github.com/x/y/blob/main/evidence/2026-11/a.jpg", sha: "abc" } }),
    };
  };
  const stored = await uploadEvidence(
    { repo: REPO, token: TOKEN, path: "evidence/2026-11/a.jpg", bytes: new Uint8Array([0x48, 0x49]) },
    fetchImpl,
  );

  assert.equal(calls[0].url, contentsUrl(REPO, "evidence/2026-11/a.jpg"));
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[0].options.headers.authorization, `Bearer ${TOKEN}`);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.content, "SEk=");
  assert.equal(body.message, "evidence: evidence/2026-11/a.jpg");
  assert.equal(stored.path, "evidence/2026-11/a.jpg");
  assert.equal(stored.sha, "abc");
});

test("uploadEvidence explains a key that cannot store files", async () => {
  await assert.rejects(
    () =>
      uploadEvidence(
        { repo: REPO, token: TOKEN, path: "evidence/2026-11/a.jpg", bytes: new Uint8Array([1]) },
        async () => ({ ok: false, status: 403, json: async () => ({}) }),
      ),
    (error) => error.status === 403 && /Contents: read and write/.test(error.message),
  );
  assert.match(explainUpload(422), /422/);
});

test("preparePhoto resizes, shrinks under the byte cap and hashes", async () => {
  const seen = [];
  const prepared = await preparePhoto(
    { name: "mess.jpg" },
    {
      maxBytes: 1200,
      decode: async () => ({ width: 4000, height: 3000, close() {} }),
      encode: async (image, width, height, quality) => {
        seen.push({ width, height, quality });
        return { size: Math.round((width * height) / 1000), arrayBuffer: async () => new ArrayBuffer(0) };
      },
    },
  );

  assert.equal(seen[0].width, 1440);
  assert.equal(seen[0].height, 1080);
  assert.ok(seen.length > 1, "expected a second pass to get under the cap");
  assert.ok(prepared.bytes <= 1200);
  assert.equal(prepared.mediaType, "image/jpeg");
  assert.match(prepared.sha256, /^[0-9a-f]{64}$/);
});
