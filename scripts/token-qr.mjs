/**
 * Turns a fine-grained key into a QR a parent can show on screen or print.
 * The image itself is the secret: delete it after the device is paired.
 *
 *   BANK_TOKEN=github_pat_... BANK_REPO=owner/name npm run qr -- --url https://example.test/banking/
 *   BANK_TOKEN=github_pat_... BANK_REPO=owner/name npm run qr -- --role parent
 */
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";
import { looksLikeRepo, pairingUrl } from "../src/token.js";

const SITE_URL = "https://walterjwhite.github.io/banking/";
const TOKEN_SHAPE = /^(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,})$/;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message, out) {
  console.error(message);
  console.error(
    "\nusage: BANK_TOKEN=<key> BANK_REPO=<owner/name> [BANK_ACCOUNT=<name>] npm run qr -- [--role kid|parent] [--account <name>] [--url <site>] [--repo <owner/name>] [--out <file>]",
  );
  if (out && existsSync(out)) {
    console.error(`warning: ${out} was NOT regenerated and still holds an older key — delete it.`);
  }
  process.exit(1);
}

const out = argument("out") ?? "token-qr.svg";
const site = argument("url") ?? process.env.BANK_SITE ?? SITE_URL;
const role = (argument("role") ?? process.env.BANK_ROLE ?? "kid").toLowerCase();
const token = (process.env.BANK_TOKEN ?? argument("token") ?? "").trim();
const repo = (argument("repo") ?? process.env.BANK_REPO ?? "").trim();
const accountInput = (argument("account") ?? process.env.BANK_ACCOUNT ?? "").trim();

if (!token) fail("No key supplied; put it in BANK_TOKEN so it stays out of shell history.", out);
if (!TOKEN_SHAPE.test(token)) fail("That does not look like a GitHub token (github_pat_… or ghp_…).", out);
if (!repo) fail("No ledger repo supplied; put it in BANK_REPO as owner/name so it stays out of shell history.", out);
if (!looksLikeRepo(repo)) fail("The ledger repo must look like owner/name.", out);
if (role !== "kid" && role !== "parent") fail("--role must be kid or parent.", out);
const account = role === "parent" ? "" : accountInput;
if (role === "kid" && !account) fail("Kid pairings need an account name; pass --account or BANK_ACCOUNT.", out);

try {
  const svg = await QRCode.toString(pairingUrl(site, token, role, repo, account || null), {
    type: "svg",
    margin: 2,
    width: 480,
    errorCorrectionLevel: "M",
  });
  writeFileSync(out, svg);
  const fingerprint = createHash("sha256").update(token).digest("hex").slice(0, 8);
  console.log(`wrote ${out} for ${new URL(site).href} as a ${role} device`);
  console.log(`repo ${repo}${account ? ` · account ${account}` : ""} · key ${fingerprint} · ${token.length} chars · ${role}`);
  console.log("Show it to the device, then delete the file: it contains the key.");
} catch (error) {
  fail(`Could not build the QR: ${error.message}`, out);
}
