import { looksLikeToken, pairingFromText, readToken, saveAccount, saveRepo, saveRole, saveToken } from "./token.js";

/** The connect panel shown when the device holds no key. */
export function createPairing({ section, form, input, hint, onConnect }) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      const stored = storedToken();
      if (stored) {
        input.value = "";
        setHint(hint, "", false);
        onConnect(stored);
        return;
      }
      setHint(hint, "Paste the pairing link a parent sent, or the key itself.", true);
      return;
    }
    const pairing = pairingFromText(text);
    if (!pairing || !looksLikeToken(pairing.token)) {
      setHint(hint, "Paste the pairing link a parent sent, or the key itself.", true);
      return;
    }
    try {
      saveToken(pairing.token);
      saveRole(pairing.role);
      saveAccount(pairing.role === "parent" ? null : pairing.account);
      if (pairing.repo) saveRepo(pairing.repo);
    } catch {
      setHint(hint, "This browser blocks storage, so the key cannot be kept.", true);
      return;
    }
    input.value = "";
    setHint(hint, "", false);
    onConnect(pairing.token);
  });

  function storedToken() {
    try {
      return readToken();
    } catch {
      return null;
    }
  }

  return {
    show(message = "", { error = false } = {}) {
      section.hidden = false;
      setHint(hint, message, error);
      input.focus();
    },
    hide() {
      section.hidden = true;
      setHint(hint, "", false);
    },
  };
}

function setHint(hint, message, error) {
  hint.textContent = message;
  hint.classList.toggle("error", error);
}
