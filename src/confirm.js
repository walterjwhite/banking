import { checkPin, hasPin, looksLikePin, setPin } from "./pin.js";

/**
 * Two-step confirmation for an approval action: the parent's PIN has to be
 * typed, so a stray tap or a child holding the phone cannot post anything.
 */
export function createConfirm({ action, onConfirmed }) {
  const setting = !hasPin();
  const form = document.createElement("form");
  form.className = "confirm";

  const input = document.createElement("input");
  input.type = "password";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.maxLength = 8;
  input.required = true;
  input.placeholder = setting ? "new PIN, 4-8 digits" : "parent PIN";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = setting ? `Set PIN and ${action}` : action;

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "link";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => form.remove());

  const note = document.createElement("p");
  note.className = "hint";

  form.append(input, submit, cancel, note);
  form.addEventListener("submit", (event) => submitPin(event, { action, input, note, setting, submit, form, onConfirmed }));
  return form;
}

async function submitPin(event, { action, input, note, setting, submit, form, onConfirmed }) {
  event.preventDefault();
  const pin = input.value.trim();
  if (!looksLikePin(pin)) {
    note.classList.add("error");
    note.textContent = "The PIN is 4 to 8 digits.";
    return;
  }
  if (setting) await setPin(pin);
  else if (!(await checkPin(pin))) {
    note.classList.add("error");
    note.textContent = "Wrong PIN.";
    input.value = "";
    return;
  }
  submit.disabled = true;
  note.classList.remove("error");
  note.textContent = `${action}ing…`;
  await onConfirmed();
  form.remove();
}
