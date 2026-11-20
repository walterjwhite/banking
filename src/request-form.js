import { createIssue } from "./issue.js";
import { buildRequest, issueUrl } from "./request.js";
import { readRepo, readToken } from "./token.js";

export function createRequestForm({ form, hint, onFiled }) {
  const button = form.querySelector("button[type=submit]");
  form.addEventListener("submit", (event) => submit(event, form, hint, button, onFiled));
}

async function submit(event, form, hint, button, onFiled) {
  event.preventDefault();
  let request;
  try {
    request = buildRequest(fields(form));
  } catch (error) {
    hint.replaceChildren(error.message);
    return;
  }
  const token = readToken();
  const repo = readRepo();
  if (!token) {
    hint.replaceChildren("Connect this device first.");
    return;
  }

  button.disabled = true;
  hint.replaceChildren("Filing the request…");
  try {
    const issue = await createIssue(request, token, repo);
    form.reset();
    hint.replaceChildren(`Request #${issue.number} is waiting for a parent.`);
    if (onFiled) onFiled();
  } catch (error) {
    hint.replaceChildren(error.message);
    if (repo) hint.append(" ", fallbackLink(request, repo));
  } finally {
    button.disabled = false;
  }
}

function fallbackLink(request, repo) {
  const link = document.createElement("a");
  link.href = issueUrl(request, repo);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open the prefilled issue instead";
  return link;
}

function fields(form) {
  const value = (name) => form.elements.namedItem(name).value;
  return {
    account: value("account"),
    type: value("type"),
    amount: value("amount"),
    description: value("description"),
  };
}
