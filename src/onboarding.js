import { looksLikeToken, pairingFromText, readToken, saveRepo, saveRole, saveToken } from "./token.js";

/** The connect panel shown when the device holds no key. */
export function createPairing({ section, form, input, hint, onConnect }) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      const stored = storedToken();
      if (stored) {
        input.value = "";
        hint.textContent = "";
        onConnect(stored);
        return;
      }
      hint.textContent = "Paste the pairing link a parent sent, or the key itself.";
      return;
    }
    const pairing = pairingFromText(text);
    if (!pairing || !looksLikeToken(pairing.token)) {
      hint.textContent = "Paste the pairing link a parent sent, or the key itself.";
      return;
    }
    try {
      saveToken(pairing.token);
      saveRole(pairing.role);
      if (pairing.repo) saveRepo(pairing.repo);
    } catch {
      hint.textContent = "This browser blocks storage, so the key cannot be kept.";
      return;
    }
    input.value = "";
    hint.textContent = "";
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
    show(message = "") {
      section.hidden = false;
      hint.textContent = message;
      input.focus();
    },
    hide() {
      section.hidden = true;
      hint.textContent = "";
    },
  };
}
