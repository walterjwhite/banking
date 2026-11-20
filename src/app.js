import { loadSnapshot, readCached, saveCached } from "./api.js";
import { createPairing } from "./onboarding.js";
import { createPending } from "./pending.js";
import { renderAccounts, renderAccountOptions, renderActivity } from "./render.js";
import { createRequestForm } from "./request-form.js";
import { claimHashToken, clearToken, keyFingerprint, readRepo, readRole, readToken } from "./token.js";

const nodes = {
  accounts: document.querySelector("#accounts"),
  activity: document.querySelector("#activity"),
  freshness: document.querySelector("#freshness"),
  hint: document.querySelector("#request-hint"),
  forget: document.querySelector("#forget"),
  request: document.querySelector("#request-form"),
  device: document.querySelector("#device"),
  pendingSection: document.querySelector("#pending-section"),
  pendingList: document.querySelector("#pending"),
  pendingStatus: document.querySelector("#pending-status"),
};

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
  nodes.device.textContent = `${readRole()} · key ${await keyFingerprint(token)}`;
  nodes.device.hidden = false;
}

async function connect(token) {
  pairing.hide();
  nodes.freshness.textContent = "connecting";
  try {
    const snapshot = await loadSnapshot(token, readRepo());
    saveCached(snapshot);
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
  renderAccounts(nodes.accounts, snapshot.accounts);
  renderAccountOptions(nodes.request.elements.namedItem("account"), snapshot.accounts);
  renderActivity(nodes.activity, snapshot.transactions);
  nodes.freshness.textContent =
    state === "offline" ? "offline" : new Date(snapshot.generated_at).toLocaleDateString();
  nodes.forget.hidden = false;
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
