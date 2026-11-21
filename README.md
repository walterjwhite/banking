# Family Bank — shell

The installable app shell for the family bank. This repository is **public and
holds no family data**: no snapshot, no balances, no names. Balances are read at
runtime from the private ledger repository with a key that each phone receives
once, in person.

## How a phone gets its key

Every person mints their **own** fine-grained token from their own GitHub
account, scoped to the ledger repository only, with a 90-day expiry, named after
the device (`phone-a`, `phone-b`).

| Account | Ledger role | Token permissions | Can approve |
| --- | --- | --- | --- |
| Parent | `write` | `Contents: read` (+ `Issues: read and write` to file, + `Contents: write` to save photos) | yes |
| Child (13+) | `read` | `Contents: read` + `Issues: read and write` | no |

`/approve` is judged by the commenter's repository permission, so a child's
account can file requests but can never approve one. Children under 13 cannot
hold a GitHub account: their devices get `Contents: read` only and a parent
files the request. Invite children to the ledger organization rather than adding
them as outside collaborators — fine-grained tokens cannot reach an
organization's repositories that way — and the organization default already
grants `read`.

1. Create the token: Resource owner your org/user, **Only select repositories** → the
   ledger, expiry 90 days.
2. Generate the QR with that token and the ledger repo:

   ```bash
   ./scripts/generate-qr-code.sh
   # prompts for PAT, repo, and (for kids) the account name; writes token-qr.svg
   # kid: BANK_TOKEN=... BANK_REPO=owner/name BANK_ACCOUNT="Kid A" npm run qr
   # parent: BANK_TOKEN=... BANK_REPO=owner/name npm run qr -- --role parent
   ```

3. The device scans it. The key and ledger repo land in the URL fragment, the app
   stores them in `localStorage`, and `history.replaceState` drops them from the
   address bar and history.

   If the scan opens Safari instead of the installed app, paste the link into the
   app's Connect panel: iOS keeps separate storage for home-screen apps. The
   panel shows `<role> · key <fingerprint>` once a key is held. Kid pairings carry
   `account=<name>`; the app filters balances and activity to that account, while
   parent pairings see every account.
4. Delete `token-qr.svg` once the device is paired — the image *is* the key.
   Revoke the token on GitHub when a device is lost or replaced.

The fragment never reaches the web server, so hosting the shell publicly does
not expose the key to the host.

## Run

```bash
npm install      # only for the QR generator (devDependency)
npm test         # node --test suites
npm run dev      # http://localhost:4173
npm run build    # emits content-hashed shell assets into dist/
npm run preview  # serves dist/
```

The app itself has no runtime dependencies and no bundler.

## Publish

`.github/workflows/pages.yml` runs the tests, builds `dist/` and deploys it with
`actions/upload-pages-artifact` + `actions/deploy-pages`. Enable **Settings →
Pages → Source: GitHub Actions** once; every push to `main` then publishes.

`scripts/build.mjs` fails if `public/snapshot.json` exists, so the site cannot
accidentally ship balances.

## Calculators

`compounding.html` and `purchase-power.html` are standalone calculator pages,
linked from the home view. They use Tailwind and Chart.js, which the build
vendors into `dist/assets/` with content-hashed names so the pages work
offline; `tailwind.css` is the Tailwind input scanned from the page markup.

## What the app reads

```
GET https://api.github.com/repos/owner/ledger-repo/contents/snapshot.json
Authorization: Bearer <per-device key>
Accept: application/vnd.github.raw
```

A failed read keeps the key and reopens the connect panel with the reason; a 404 is
resolved one step further, so the message says whether the key is blind to the repo
or `snapshot.json` is missing from the branch. Balances fall back to the last cached
copy and show `offline`. The service
worker never touches `api.github.com` — that request always goes to the network.

## Request flow

The form files the issue itself, no GitHub account involved:

```
POST https://api.github.com/repos/owner/ledger-repo/issues
Authorization: Bearer <device key>
{ "title": "deposit: Sample 25.00", "body": "...fenced json..." }
```

A parent comments `/approve`; the ledger workflow posts the transaction and
regenerates `snapshot.json`. If the key cannot file issues (403) the form falls
back to opening the prefilled "new issue" page, which needs a signed-in account
with access.

Filing needs `Issues: read and write` on the key, and that same permission lets
the key comment as its owner. Because `/approve` is judged by the commenter's
repository role, a key minted by an approving parent must not reach a child: the
workflow would see the parent and the request could approve itself. Either keep
child keys at `Contents: read` and file requests from a parent device, or mint
the filing key from a separate account that has only **read** on the ledger.

The request body is what the workflow applies, so `verify-request` re-runs on
every edit and a parent always sees the current numbers.

## Charges and evidence

The shell knows no charge names and no amounts. `charges.json` in the ledger is the
whole policy, read with the device key exactly like `snapshot.json`:

```json
{
  "version": 3,
  "currency": "USD",
  "items": [
    {
      "id": "mess.table",
      "label": "Table not wiped",
      "kind": "debit",
      "amount": "2.00",
      "evidence": "required",
      "fields": [
        { "name": "location", "label": "Where", "type": "choice", "options": ["kitchen table", "dining table"] },
        { "name": "extra_mess", "label": "Anything else left out", "type": "text" }
      ]
    },
    { "id": "chore.dishes", "label": "Dishes done", "kind": "credit", "amount": "1.00" }
  ]
}
```

An entry only needs `id`, `label` and `amount`; `kind` defaults to `debit`,
`evidence` to `optional` (or `required`/`none`), and `fields` is empty. Field
types the shell can draw are `text`, `choice`, `number` and `date`; an entry
whose `choice` field has no `options` is skipped rather than shown broken.
Missing or unreadable `charges.json` simply hides the form and keeps the last
cached copy for offline use — the app never invents a charge.

Reporting a charge creates the same kind of issue as a deposit or withdrawal, with
the catalogue id in the fenced JSON:

```
POST /repos/owner/ledger-repo/issues
{
  "id": "<uuid>", "type": "charge", "charge": "mess.table", "kind": "debit",
  "account": "Kid A", "amount": "2.00", "description": "table",
  "reported_by": "Parent", "occurred_at": "2026-11-21T18:04:00.000Z",
  "policy": { "version": 3, "currency": "USD" },
  "answers": { "location": "kitchen table" },
  "evidence": [{ "path": "evidence/2026-11/<uuid>.jpg", "sha256": "…", "width": 1440, "height": 1080, "bytes": 184320 }]
}
```

No amount is trusted from the phone: the workflow re-reads its own
`charges.json`, looks up `charge`, recomputes the amount and rejects an `id` it
has already posted. The `policy.version` and `reported_by` are there so a
mismatch or a disputed charge is visible in the issue. A charge type the workflow
does not know must fail closed and leave the issue open.

**The photo.** The picture is decoded, drawn onto a canvas capped at
1920×1080 and re-encoded as JPEG (about 1.5 MB at most), which also drops EXIF
including GPS. The bytes go to `evidence/<year>-<month>/<report id>.jpg` in the
ledger through the Contents API, and the issue carries the path, hash, size and
dimensions. That upload needs `Contents: read and write` on the parent's key; a
key without it gets a clear message plus the prefilled issue link, where the
photo can be attached by hand in the browser. Evidence lands on the ledger's
default branch and is never served by this public shell.

**What a report carries:** the catalogue entry and its policy version, the
account charged, the account that filed it, when the mess happened anyway (the
phone clock is not the ledger clock), the free-text note, the config-declared
answers, and the evidence list with a SHA-256 so a swapped picture is obvious.
The same path covers credits: a `kind: "credit"` entry posts money back, so
chores and messes share one form, one approval step and one audit trail.

## Approving from the app

Pair the parent's device with the parent role:

```bash
ROLE=parent ./scripts/generate-qr-code.sh
# or: BANK_TOKEN=github_pat_... BANK_REPO=owner/name npm run qr -- --role parent
```

A QR is only written when a key is passed. If the script refuses, it names any
older file still sitting at `--out` — scanning that stale image is the usual
reason a device pairs with no key at all.

That device gets a **Waiting for a parent** list with **Approve** and **Reject**
buttons. The first action asks the parent to choose a 4-8 digit PIN, and every
later action needs it, so a stray tap or a child holding the phone posts nothing.
The PIN is kept as a PBKDF2 hash in device storage, never sent anywhere. Actions
post a comment with the device key:

- `/approve` — the ledger workflow posts the transaction and closes the issue.
- `/reject` — closes the issue without writing to the ledger.

Kid devices do not get the **Waiting for a parent** list; it is parent-only so
siblings' requests stay private.

This is a convenience gate, not a credential boundary. Children's devices hold a
key minted by a parent's account, so that key can comment as the parent; only
separate GitHub accounts make the identity enforceable.

## Install on a phone

Pair the key before or after installing: the installed app and the browser tab
share the same origin storage, so either order works.

### Android (Chrome)

1. Open https://walterjwhite.github.io/banking/ in Chrome, not in an in-app
   browser opened from a chat app.
2. Accept the **Install app** banner, or use ⋮ → **Add to Home screen** /
   **Install app**.
3. The coin icon opens full screen, with no address bar.

### iOS (Safari)

1. Open the URL in **Safari**. Chrome, Firefox and in-app viewers cannot install
   on iOS.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. iOS never shows an install prompt; this is the only path.

### What the installed app keeps

- The shell (HTML, CSS, JS, icons) is precached, so the icon launches with no
  signal and shows the last balances marked `offline`.
- The key stays in device storage, so you do not re-scan on every launch. When
  online it fetches fresh balances from the GitHub API.

### What makes it ask for a key again

- Clearing site data (iOS: Settings → Safari → Clear History and Website Data;
  Android: Chrome → Site settings → Storage), or private browsing.
- Removing the home-screen icon on Android may take its storage with it.
- The 90-day token expiring: the app reports `401` and keeps the key, so a fresh
  QR re-pairs without touching anything else.

### Requirements and updates

- Service workers need HTTPS or `localhost`; `http://<lan-ip>` will not install.
- `npm run build` hashes shell assets and derives the SW cache name, so releases
  bust caches automatically; `public/sw.js` keeps the dev-server cache name.

The shell is this repository, so `git clone` restores it anywhere. The ledger is
separate, private, and never published.
