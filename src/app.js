import { loadSnapshot, readCached, saveCached } from "./api.js";
import { createPairing } from "./onboarding.js";
import { createPending } from "./pending.js";
import { renderAccounts, renderAccountOptions, renderActivity, transactionRows } from "./render.js";
import { createRequestForm } from "./request-form.js";
import {
  claimHashToken,
  clearToken,
  keyFingerprint,
  readAccount,
  readRepo,
  readRole,
  readToken,
} from "./token.js";

const PAGE_SIZE = 25;

const nodes = {
  accounts: document.querySelector("#accounts"),
  activity: document.querySelector("#activity"),
  activityAll: document.querySelector("#activity-all"),
  freshness: document.querySelector("#freshness"),
  hint: document.querySelector("#request-hint"),
  forget: document.querySelector("#forget"),
  request: document.querySelector("#request-form"),
  device: document.querySelector("#device"),
  nav: document.querySelector("#nav"),
  navHome: document.querySelector("#nav-home"),
  navTransactions: document.querySelector("#nav-transactions"),
  pendingSection: document.querySelector("#pending-section"),
  pendingList: document.querySelector("#pending"),
  pendingStatus: document.querySelector("#pending-status"),
  transactions: document.querySelector("#transactions"),
  transactionsMore: document.querySelector("#transactions-more"),
  transactionsStatus: document.querySelector("#transactions-status"),
  viewHome: document.querySelector("#view-home"),
  viewTransactions: document.querySelector("#view-transactions"),
};

let scopedTransactions = [];
let shownTransactions = 0;

const pending = createPending({
  section: nodes.pendingSection,
  list: nodes.pendingList,
  status: nodes.pendingStatus,
});

const pairing = createPairing({
  section: document.querySelector("#pairing"),
  form: document.querySelector("#token-form"),
  input: document.querySelector("#token"),
  hint: document.querySelector("#token-hint"),
  onConnect: connect,
});

init();

async function init() {
  createRequestForm({ form: nodes.request, hint: nodes.hint, onFiled: pending.refresh });
  nodes.forget.addEventListener("click", forget);
  nodes.navHome.addEventListener("click", () => showView("home"));
  nodes.navTransactions.addEventListener("click", () => showView("transactions"));
  nodes.activityAll.addEventListener("click", () => showView("transactions"));
  nodes.transactionsMore.addEventListener("click", () => renderTransactions(false));

  let claimed = null;
  try {
    claimed = claimHashToken(location.hash, { storage: localStorage, onClaimed: stripHash });
  } catch {
    claimed = null;
  }

  const token = claimed ?? readToken();
  if (token) {
    await describeDevice(token);
    return connect(token);
  }
  if (location.hash.includes("token=")) {
    pairing.show(
      "This device could not keep the key from the link. Paste the pairing link below — on iOS a scanned link opens Safari, whose storage is separate from the home-screen app.",
      { error: true },
    );
    return;
  }
  pairing.show("Scan the QR code a parent shows you, or paste the pairing link they sent.");
}

async function describeDevice(token) {
  const account = readAccount();
  const scope = account ? ` · ${account}` : "";
  nodes.device.textContent = `${readRole()}${scope} · key ${await keyFingerprint(token)}`;
  nodes.device.hidden = false;
}

async function connect(token) {
  pairing.hide();
  nodes.freshness.textContent = "connecting";
  try {
    const snapshot = await loadSnapshot(token, readRepo());
    saveCached(scopedCache(snapshot));
    paint(snapshot, "online");
  } catch (error) {
    failed(error);
  }
  pending.refresh();
}

/** The stored key is only removed by Forget key; a failed read never deletes it. */
function failed(error) {
  const cached = readCached();
  if (cached) paint(cached, "offline");
  else nodes.freshness.textContent = "no access";
  pairing.show(`${error.message ?? "Could not reach the ledger."}${savedKeyNote()}`, { error: true });
}

function savedKeyNote() {
  try {
    return readToken() ? " The saved key is still on this device — press Connect to retry it, or paste a new pairing link." : "";
  } catch {
    return "";
  }
}

function paint(snapshot, state) {
  const scoped = scopeSnapshot(snapshot);
  scopedTransactions = scoped.transactions;
  shownTransactions = 0;
  nodes.nav.hidden = false;
  if (scoped.missing) nodes.accounts.replaceChildren(scopeNotice());
  else renderAccounts(nodes.accounts, scoped.accounts);
  renderAccountOptions(nodes.request.elements.namedItem("account"), scoped.accounts);
  renderActivity(nodes.activity, scoped.transactions);
  nodes.activityAll.hidden = scoped.transactions.length <= 5;
  nodes.freshness.textContent =
    state === "offline" ? "offline" : new Date(snapshot.generated_at).toLocaleDateString();
  nodes.forget.hidden = false;
  showView("home");
}

function scopeSnapshot(snapshot) {
  const accounts = snapshot.accounts ?? [];
  const transactions = snapshot.transactions ?? [];
  if (readRole() === "parent") return { accounts, transactions, missing: false };
  const account = readAccount();
  return {
    accounts: accounts.filter((item) => item.name === account),
    transactions: transactions.filter((item) => item.account === account),
    missing: !account,
  };
}

function scopedCache(snapshot) {
  const scoped = scopeSnapshot(snapshot);
  return {
    generated_at: snapshot.generated_at,
    accounts: scoped.accounts,
    transactions: scoped.transactions,
  };
}

function scopeNotice() {
  const card = document.createElement("article");
  card.className = "card";
  card.append(
    Object.assign(document.createElement("h2"), { textContent: "No account paired" }),
    Object.assign(document.createElement("p"), {
      className: "meta",
      textContent: "This device needs account=<name> in its pairing link before it can show balances.",
    }),
  );
  return card;
}

function showView(view) {
  const home = view === "home";
  nodes.viewHome.hidden = !home;
  nodes.viewTransactions.hidden = home;
  nodes.navHome.classList.toggle("active", home);
  nodes.navHome.setAttribute("aria-current", home ? "page" : "false");
  nodes.navTransactions.classList.toggle("active", !home);
  nodes.navTransactions.setAttribute("aria-current", home ? "false" : "page");
  if (!home) renderTransactions(true);
}

function renderTransactions(reset = false) {
  if (reset) shownTransactions = 0;
  const next = scopedTransactions.slice(shownTransactions, shownTransactions + PAGE_SIZE);
  const rows = transactionRows(next);
  if (reset) nodes.transactions.replaceChildren(...rows);
  else nodes.transactions.append(...rows);
  shownTransactions += next.length;
  nodes.transactionsStatus.classList.remove("error");
  nodes.transactionsStatus.textContent = scopedTransactions.length
    ? `${shownTransactions} of ${scopedTransactions.length}`
    : "No transactions yet.";
  nodes.transactionsMore.hidden = shownTransactions >= scopedTransactions.length;
}

function forget() {
  clearToken();
  location.reload();
}

function stripHash() {
  history.replaceState({}, "", location.pathname + location.search);
}

registerServiceWorker();

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
