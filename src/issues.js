import { API } from "./config.js";
import { IssueError, explainIssue, issuesUrl } from "./issue.js";

export { issuesUrl };

export function issueWebUrl(number, repo) {
  return `https://github.com/${repo}/issues/${number}`;
}

function headers(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
  };
}

export async function listOpenRequests(token, repo, fetchImpl = globalThis.fetch) {
  if (!repo) throw new IssueError("No ledger repository is paired with this device.", 0);
  const response = await fetchImpl(`${issuesUrl(repo)}?state=open&per_page=20`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!response.ok) throw new IssueError(explainIssue(response.status), response.status);
  const issues = await response.json();
  return issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      author: issue.user?.login ?? "unknown",
      url: issue.html_url ?? issueWebUrl(issue.number, repo),
    }));
}

export async function commentOnIssue(number, body, token, repo, fetchImpl = globalThis.fetch) {
  if (!repo) throw new IssueError("No ledger repository is paired with this device.", 0);
  const response = await fetchImpl(`${issuesUrl(repo)}/${number}/comments`, {
    method: "POST",
    headers: { ...headers(token), "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new IssueError(explainIssue(response.status), response.status);
  return response.json();
}
