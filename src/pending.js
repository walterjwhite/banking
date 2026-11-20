import { createConfirm } from "./confirm.js";
import { commentOnIssue, listOpenRequests } from "./issues.js";
import { readRepo, readRole, readToken } from "./token.js";

export function createPending({ section, list, status }) {
  let canApprove = false;

  async function refresh() {
    canApprove = readRole() === "parent";
    if (!canApprove) {
      section.hidden = true;
      return;
    }
    const token = readToken();
    const repo = readRepo();
    if (!token || !repo) {
      section.hidden = true;
      status.classList.remove("error");
      return;
    }
    try {
      paint(await listOpenRequests(token, repo));
    } catch (error) {
      section.hidden = false;
      status.classList.add("error");
      status.textContent = `Requests unavailable: ${error.message}`;
    }
  }

  function paint(requests) {
    section.hidden = false;
    status.classList.remove("error");
    status.textContent = requests.length ? "" : "Nothing is waiting for a parent.";
    list.replaceChildren(...requests.map(row));
  }

  function row(request) {
    const item = document.createElement("li");
    item.className = "request-row";
    const title = document.createElement("span");
    title.textContent = `#${request.number} ${request.title}`;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `from @${request.author}`;
    item.append(title, meta);
    item.append(canApprove ? actions(request) : link(request));
    return item;
  }

  function actions(request) {
    const group = document.createElement("span");
    group.className = "actions";
    for (const action of ["approve", "reject"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action === "reject" ? "ghost" : "";
      button.textContent = action === "approve" ? "Approve" : "Reject";
      button.addEventListener("click", () => {
        group.replaceChildren(createConfirm({ action, onConfirmed: () => send(request, action) }));
      });
      group.append(button);
    }
    group.append(link(request));
    return group;
  }

  async function send(request, action) {
    try {
      await commentOnIssue(request.number, `/${action}`, readToken(), readRepo());
      await refresh();
      status.classList.remove("error");
      status.textContent = `#${request.number} ${action === "approve" ? "approved" : "rejected"}. The ledger follows in a moment.`;
    } catch (error) {
      status.classList.add("error");
      status.textContent = error.message;
    }
  }

  return { refresh };
}

function link(request) {
  const anchor = document.createElement("a");
  anchor.href = request.url;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  anchor.textContent = "Open";
  return anchor;
}
