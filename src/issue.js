import { API } from "./config.js";
import { requestBody } from "./request.js";

export class IssueError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "IssueError";
    this.status = status;
  }
}

export function issuesUrl(repo) {
  return `${API}/repos/${repo}/issues`;
}

export function issueTitle(request) {
  return `${request.type}: ${request.account} ${request.amount}`;
}

export async function createIssue(request, token, repo, fetchImpl = globalThis.fetch) {
  return postIssue(
    { title: issueTitle(request), body: requestBody(request) },
    token,
    repo,
    fetchImpl,
  );
}

/** The shared filing path: deposits, withdrawals and charge reports. */
export async function postIssue({ title, body }, token, repo, fetchImpl = globalThis.fetch) {
  if (!repo) throw new IssueError("No ledger repository is paired with this device.", 0);
  const response = await fetchImpl(issuesUrl(repo), {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ title, body }),
  });
  if (response.ok) {
    const issue = await response.json();
    return { number: issue.number, url: issue.html_url };
  }
  throw new IssueError(explainIssue(response.status), response.status);
}

export function explainIssue(status) {
  if (status === 401) return "That key was rejected (401). It may have expired or been revoked.";
  if (status === 403) return "This key can read balances but not file requests. It needs Issues: read and write.";
  if (status === 404) return "That key cannot see the ledger repository (404).";
  if (status === 410) return "Issues are disabled on the ledger repository.";
  if (status === 422) return "GitHub rejected the request (422). Check the account and amount.";
  return `Could not file the request (${status}).`;
}
