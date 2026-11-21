import { normalizeAmount } from "./request.js";

/**
 * A charge report is the generic request: a catalogue id from the ledger plus
 * whatever fields that entry declares. Nothing about tables or messes lives
 * here — the shell never decides what a charge is or what it costs.
 */

export function newChargeId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === "function") return cryptoImpl.randomUUID();
  const bytes =
    typeof cryptoImpl?.getRandomValues === "function"
      ? cryptoImpl.getRandomValues(new Uint8Array(16))
      : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

export function buildCharge({
  id = newChargeId(),
  entry,
  subject,
  reportedBy = "",
  note = "",
  occurredAt,
  policy = null,
  answers = {},
  evidence = [],
}) {
  if (!entry?.id) throw new Error("Choose a charge from the ledger's list.");
  const account = String(subject ?? "").trim();
  if (!account) throw new Error("Choose the account to charge.");
  const text = String(note ?? "").trim();
  const kind = entry.kind === "credit" ? "credit" : "debit";
  return {
    id: String(id),
    // The ledger validates type as a transaction, so a debit posts as a
    // withdrawal and a credit as a deposit; `charge` still names the entry.
    type: kind === "credit" ? "deposit" : "withdrawal",
    charge: entry.id,
    label: entry.label,
    kind,
    account,
    amount: normalizeAmount(entry.amount),
    description: text || entry.label,
    reported_by: String(reportedBy ?? "").trim(),
    occurred_at: occurredAt ?? new Date().toISOString(),
    policy,
    answers,
    evidence,
  };
}

export function chargeIssue(report) {
  return {
    title: `${report.type}: ${report.account} ${report.amount}`,
    body: [
      "```json",
      JSON.stringify(report, null, 2),
      "```",
      "",
      `A parent can comment \`/approve\` to post this ${report.type} of ${report.amount} for “${report.label}”.`,
    ].join("\n"),
  };
}

/** Config-declared extras; the ledger still revalidates them against its copy. */
export function collectAnswers(entry, read) {
  const answers = {};
  for (const field of entry?.fields ?? []) {
    const value = String(read(field.name) ?? "").trim();
    if (!value) {
      if (field.required) throw new Error(`Fill in ${field.label}.`);
      continue;
    }
    if (field.type === "choice" && !field.options.includes(value)) {
      throw new Error(`${field.label} has to be one of: ${field.options.join(", ")}.`);
    }
    if (field.type === "number" && !Number.isFinite(Number(value))) {
      throw new Error(`${field.label} has to be a number.`);
    }
    answers[field.name] = value;
  }
  return answers;
}
