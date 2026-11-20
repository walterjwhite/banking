const AMOUNT = /^\d+(?:\.\d{1,2})?$/;

export function normalizeAmount(value) {
  const text = String(value).trim();
  if (!AMOUNT.test(text)) throw new Error("Enter an amount like 25 or 25.50");
  const [whole, fraction = ""] = text.split(".");
  return `${Number(whole)}.${`${fraction}00`.slice(0, 2)}`;
}

export function buildRequest({ account, type, amount, description }) {
  return {
    account: String(account).trim(),
    type: String(type).trim(),
    amount: normalizeAmount(amount),
    description: String(description).trim(),
  };
}

export function requestBody(request) {
  return [
    "```json",
    JSON.stringify(request, null, 2),
    "```",
    "",
    "A parent can comment `/approve` to post this transaction.",
  ].join("\n");
}

export function issueUrl(request, repo) {
  const params = new URLSearchParams({
    title: `${request.type}: ${request.account} ${request.amount}`,
    body: requestBody(request),
  });
  return `https://github.com/${repo}/issues/new?${params}`;
}
