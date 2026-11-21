import { buildCharge, chargeIssue, collectAnswers, newChargeId } from "./charge.js";
import { evidencePath, preparePhoto, uploadEvidence } from "./evidence.js";
import { money } from "./format.js";
import { postIssue } from "./issue.js";
import { newIssueUrl } from "./request.js";
import { readAccount, readRepo, readRole, readToken } from "./token.js";

/** Renders whatever the ledger's charge catalogue declares; nothing is hardcoded here. */
export function createChargeForm({ section, form, meta, hint, onFiled }) {
  let catalog = null;
  let accounts = [];
  let fields = new Map();
  let previewUrl = null;

  form.addEventListener("submit", submit);

  function render(next, { accounts: scope = [], defaultSubject = null, note = "" } = {}) {
    catalog = next;
    accounts = scope;
    form.replaceChildren();
    section.hidden = false;
    if (!catalog?.items?.length) {
      meta.textContent = note || "No charges are configured in the ledger yet.";
      return;
    }
    if (!accounts.length) {
      meta.textContent = note || "Balances are not loaded, so there is no account to charge.";
      return;
    }
    meta.textContent = [note, `Charge list v${catalog.version || 1}.`].filter(Boolean).join(" ");
    build(defaultSubject);
  }

  function build(defaultSubject) {
    const charge = document.createElement("select");
    charge.name = "charge";
    charge.id = "charge-entry";
    charge.required = true;
    for (const entry of catalog.items) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = `${entry.label} — ${money(entry.amount, catalog.currency)}`;
      charge.append(option);
    }

    const subject = document.createElement("select");
    subject.name = "subject";
    subject.id = "charge-subject";
    subject.required = true;
    for (const account of accounts) {
      const option = document.createElement("option");
      option.value = account.name;
      option.textContent = account.name;
      subject.append(option);
    }
    if (defaultSubject && accounts.some((account) => account.name === defaultSubject)) {
      subject.value = defaultSubject;
    }

    const extras = document.createElement("div");
    extras.className = "charge-fields";

    const occurred = document.createElement("input");
    occurred.type = "datetime-local";
    occurred.name = "occurred";
    occurred.required = true;
    occurred.value = localStamp(new Date());

    const note = document.createElement("input");
    note.type = "text";
    note.name = "note";
    note.placeholder = "what happened";

    const photo = document.createElement("input");
    photo.type = "file";
    photo.name = "photo";
    photo.accept = "image/*";
    photo.setAttribute("capture", "environment");

    const preview = document.createElement("img");
    preview.className = "photo-preview";
    preview.alt = "the picture that will be sent";
    preview.hidden = true;

    const photoNote = document.createElement("p");
    photoNote.className = "hint";
    photoNote.textContent = "Kept at up to 1920×1080 JPEG, with location metadata removed.";

    const photoLabel = wrap("Photo", photo);
    photoLabel.append(preview, photoNote);

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.textContent = "Send to a parent";

    form.replaceChildren(
      wrap("Charge", charge),
      wrap("Account", subject),
      extras,
      wrap("When", occurred),
      wrap("Note", note),
      photoLabel,
      submitButton,
    );

    fill(extras, currentEntry(), photoLabel);

    charge.addEventListener("change", () => {
      fill(extras, currentEntry(), photoLabel);
      hint.textContent = "";
      hint.classList.remove("error");
    });

    photo.addEventListener("change", () => {
      releasePreview(preview, photoNote);
      const file = photo.files?.[0];
      if (!file) return;
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.hidden = false;
      photoNote.textContent = `${file.name} — kept at up to 1920×1080 JPEG.`;
    });
  }

  function fill(extras, entry, photoLabel) {
    fields = new Map();
    photoLabel.firstChild.textContent = entry?.evidence === "required" ? "Photo (required)" : "Photo";
    const rows = [];
    for (const field of entry?.fields ?? []) {
      const control = fieldControl(field);
      fields.set(field.name, control);
      rows.push(wrap(field.label, control));
    }
    extras.replaceChildren(...rows);
    extras.hidden = rows.length === 0;
  }

  function currentEntry() {
    return catalog?.items.find((item) => item.id === form.elements.namedItem("charge")?.value) ?? null;
  }

  function readForm() {
    const at = form.elements.namedItem("occurred")?.value;
    return {
      entry: currentEntry(),
      subject: form.elements.namedItem("subject")?.value ?? "",
      note: form.elements.namedItem("note")?.value ?? "",
      occurredAt: at ? new Date(at).toISOString() : new Date().toISOString(),
      file: form.elements.namedItem("photo")?.files?.[0] ?? null,
      answer: (name) => fields.get(name)?.value ?? "",
    };
  }

  function fail(message) {
    hint.classList.add("error");
    hint.replaceChildren(message);
  }

  function releasePreview(preview, photoNote) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.hidden = true;
    preview.removeAttribute("src");
    photoNote.textContent = "Kept at up to 1920×1080 JPEG, with location metadata removed.";
  }

  async function submit(event) {
    event.preventDefault();
    if (!catalog) return;
    const data = readForm();
    if (!data.entry) return fail("Choose a charge.");
    const token = readToken();
    const repo = readRepo();
    if (!token) return fail("Connect this device first.");
    if (data.entry.evidence === "required" && !data.file) {
      return fail("This charge needs a photo. Take one before sending.");
    }
    let answers;
    try {
      answers = collectAnswers(data.entry, data.answer);
    } catch (error) {
      return fail(error.message);
    }

    const id = newChargeId();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    hint.classList.remove("error");
    hint.replaceChildren(data.file ? "Resizing the photo…" : "Filing the report…");

    const details = {
      id,
      entry: data.entry,
      subject: data.subject,
      reportedBy: readAccount() ?? readRole(),
      note: data.note,
      occurredAt: data.occurredAt,
      policy: { version: catalog.version, currency: catalog.currency },
      answers,
    };

    let evidence = [];
    try {
      if (data.file) {
        const prepared = await preparePhoto(data.file);
        hint.replaceChildren("Saving the photo to the ledger…");
        const stored = await uploadEvidence({
          repo,
          token,
          path: evidencePath(new Date(data.occurredAt), id),
          bytes: new Uint8Array(await prepared.blob.arrayBuffer()),
        });
        evidence = [
          {
            path: stored.path,
            url: stored.url,
            media_type: prepared.mediaType,
            width: prepared.width,
            height: prepared.height,
            bytes: prepared.bytes,
            sha256: prepared.sha256,
          },
        ];
      }
      hint.replaceChildren("Filing the report…");
      const report = buildCharge({ ...details, evidence });
      const issue = await postIssue(chargeIssue(report), token, repo);
      form.reset();
      const photo = form.elements.namedItem("photo");
      if (photo) releasePreview(form.querySelector(".photo-preview"), photo.parentElement.querySelector(".hint"));
      hint.replaceChildren(`Report #${issue.number} is waiting for a parent.`);
      const occurredAgain = form.elements.namedItem("occurred");
      if (occurredAgain) occurredAgain.value = localStamp(new Date());
      if (onFiled) onFiled();
    } catch (error) {
      fail(error.message);
      const fallback = fallbackLink(details, evidence);
      if (fallback) hint.append(" ", fallback);
    } finally {
      button.disabled = false;
    }
  }

  function fallbackLink(details, evidence) {
    const repo = readRepo();
    if (!repo) return null;
    try {
      const link = document.createElement("a");
      link.href = newIssueUrl(chargeIssue(buildCharge({ ...details, evidence })), repo);
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open the prefilled issue and attach the photo there";
      return link;
    } catch {
      return null;
    }
  }

  return { render };
}

function fieldControl(field) {
  let control;
  if (field.type === "choice") {
    control = document.createElement("select");
    for (const option of field.options) {
      const item = document.createElement("option");
      item.value = option;
      item.textContent = option;
      control.append(item);
    }
  } else {
    control = document.createElement("input");
    control.type = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
    if (field.type === "number") {
      control.inputMode = "decimal";
      control.step = "any";
    }
  }
  control.name = `answer-${field.name}`;
  control.required = field.required;
  control.dataset.field = field.name;
  return control;
}

function wrap(text, control) {
  const label = document.createElement("label");
  label.append(document.createTextNode(text), control);
  return label;
}

function localStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
