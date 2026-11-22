# Splitting an owner into checking and savings

Status: **proposal — not implemented.** Nothing below ships family data to this
public repository.

## Short answer

Easier than it looks on the phone, and harder than it looks in the ledger.

- The shell **already** shows a rate per account (`src/render.js` prints
  `account.type` and `account.annual_rate`) and never decides what a charge costs
  (`charges.json` in the ledger does). So *different rates per account* is a data
  change, not code.
- Fees do not need a new mechanism either: a debit entry in `charges.json` is
  exactly the feature that already covers "table not wiped" and "dishes done".
- What is genuinely new: **account identity** (today `account.name` is both the
  posting key and a kid's pairing scope), **a transfer that touches two
  balances**, and **rules that post money nobody filed** (a sweep).
- Rough effort: about a day of shell work here, a few days in the private ledger
  workflow, plus a one-time migration of existing balances. No new dependency,
  no schema break if the new fields stay additive.

| Area | Change | Difficulty |
| --- | --- | --- |
| Rate per account | Already rendered; ledger accrues per account + `last_interest` | Trivial (ledger only) |
| Overdraft fee | One more debit in `charges.json`; optionally auto-posted | Small (ledger only) |
| Two accounts per kid | Add `owner`/`product` to snapshot accounts, scope by owner | Small (this repo) |
| Savings sweep | Ledger rule using a `cover_from` link; no new phone payload | Medium (ledger) |
| Transfer, no approval | New request type, two legs, auto-posted when same-owner | Largest single piece |
| Existing balances | Opening-balance split + history attribution | Small, one time |
| Stock market product | Same shape as savings until it needs live prices | Later; ledger-heavy |

The split is **low-to-moderate difficulty overall, and most of it is not in this
repository.** This repo is a data-free shell; it can only be exact about its own
side.

## Where the split belongs

Keep the rule the repo already follows: *the shell renders, the ledger decides.*

- Rates, fee amounts, sweep links and limits live in the ledger.
- `snapshot.json` carries the **effective** values so the phone needs no second
  file read. `src/api.js` passes the snapshot through unvalidated, so additive
  fields are backward compatible: an older cached snapshot still paints, and a
  newer phone ignores fields it does not know.
- The phone may *preview* an overdraft ("$5 fee, covered from savings"), but the
  ledger recomputes at approval time, exactly like `charges.json` amounts today.

## Data sketch

Today a snapshot account is effectively `{ name, type, balance, annual_rate,
last_interest }` and `name` is the posting key. Two accounts per child:

```json
{
  "generated_at": "2026-11-22T09:00:00.000Z",
  "accounts": [
    {
      "id": "kid-a.checking",
      "name": "Kid A · Checking",
      "owner": "Kid A",
      "product": "checking",
      "type": "checking",
      "balance": "4.00",
      "annual_rate": 0,
      "last_interest": "2026-11-01",
      "overdraft": { "fee": "5.00", "cover_from": "kid-a.savings", "limit": "0.00" }
    },
    {
      "id": "kid-a.savings",
      "name": "Kid A · Savings",
      "owner": "Kid A",
      "product": "savings",
      "type": "savings",
      "balance": "18.50",
      "annual_rate": 0.04,
      "last_interest": "2026-11-01"
    }
  ]
}
```

Notes:

- `name` stays the human label **and** the posting key, so an unmodified shell
  keeps working and existing transactions still resolve.
- `owner` is what a pairing scopes on. Today `src/app.js` filters
  `item.name === account`; with two accounts that hides half of a child's money.
  The one QR stays valid if pairing matches `owner`.
- Transactions gain `owner` going forward (`{ "account": "Kid A · Checking",
  "owner": "Kid A", ... }`), so history follows the child, not the account.

## The fee is just a charge

`charges.json` already models money that leaves because a rule was broken:

```json
{ "id": "fee.overdraft", "label": "Overdraft fee", "kind": "debit", "amount": "5.00" }
```

That is the whole shell-side story. A parent files it from their phone like
`mess.table`, it posts a `withdrawal`, and the existing approval, `policy.version`
and duplicate-`id` checks all apply unchanged. **No shell code.**

One optional upgrade, entirely in the ledger: when an approved withdrawal
overdraws a checking account with no cover, the workflow posts the requested
withdrawal *and* the fee itself, tagged `auto: true` and `source: "<issue>"`.
That removes the "did a parent notice?" step. Add it only after the manual entry
has been used — otherwise the fee is invisible until it appears.

Decisions the ledger has to make either way:

- Does the account go negative, or is the withdrawal cut to the balance?
  (Recommendation: allow the negative, charge one fee, require a parent to clear
  it — a bank that silently refuses is harder to learn from than one that charges.)
- One fee per event, or per day while negative? (Recommendation: per event, and
  never twice for the same request id.)
- A fee is not a punishment the child chooses, so the form should not default to
  it and a kid device should not be able to file it at all. A catalogue entry
  with `"filed_by": "ledger"` skipped by `src/policy.js` is the cheap version of
  that; letting only parents file it is the cheaper version.

## Transfers: no approval, but still validated

A transfer between a child's own accounts moves no money into or out of the
family, so gating it behind a parent undoes the point of the practice. The
request travels the same way as everything else — an issue with fenced JSON, filed
by the device key (`src/request.js`) — but the ledger posts it on open instead of
waiting for `/approve`:

```json
{ "type": "transfer", "from": "Kid A · Checking", "to": "Kid A · Savings",
  "amount": "5.00", "description": "move to savings" }
```

The workflow still has to validate the untrusted request, because "auto-approved"
is not "trusted":

1. `from` and `to` both exist, and both have the same `owner`.
2. `from !== to`; amount is positive with at most two decimals.
3. `from` has the balance (or the sweep rule below supplies it).
4. This issue has not already posted a transfer — re-running must not double it.

Because of (1), the worst a forged or replayed request can do is move the child's
own money between the child's own accounts. That is the property that makes
skipping approval safe; if the rule ever allows different owners, approval comes
back.

Atomicity is the real work: both legs are written in one workflow run, or
neither. A debit that posts while the credit fails creates money out of nothing,
which no other request type can do.

Shell side, this is one new request type plus a small form: From (the child's
accounts), To, Amount, and a title like
`transfer: Kid A · Checking → Kid A · Savings 5.00`. Note that a child under 13
holds a `Contents: read` key and cannot file an issue at all (see the README's
permission table), so on their device a parent files it — the auto-post still
skips the approval step.

## The sweep

`overdraft.cover_from` names the account to draw on. On a withdrawal that
overdraws checking, the workflow moves the shortfall from savings first, then
charges the fee only if savings cannot cover it. Three postings at most, one
workflow run, no new phone payload.

Record the sweep as a transfer tagged `rule: "sweep"` rather than as two silent
rows. Money moving without explanation is the fastest way to lose a child's
interest in the whole exercise, and the tag also makes the ledger's own history
readable.

Ordering, one line: sweep → still negative → fee → still negative → allow it and
flag for a parent.

## Migration of existing balances

A one-time job in the ledger, not in the shell:

1. Split each existing balance into checking + savings with explicit opening
   entries, so the sum of the two still equals the old balance.
2. Keep the old account entry as archived (or backfill `owner` on old rows) so
   historical transactions still resolve to a child.
3. The shell falls back gracefully either way: if a transaction has no `owner`,
   match it by the set of account names the child owns.

Without step 2, a child's older activity silently disappears from their scoped
view — the most likely bug in this whole change.

## Shell changes, concretely

| File | Change |
| --- | --- |
| `src/app.js` | `scopeSnapshot` matches `owner` (plus owned `name`s), not a single `name` |
| `src/render.js` | Card shows product and rate; a child's cards sit together |
| `src/request.js` | Accept `type: "transfer"` with `from`/`to` |
| `src/request-form.js` | From/To selectors when the type is `transfer` |
| `src/policy.js` | Skip ledger-only catalogue entries, if that flag is used |

`scopeSnapshot` currently lives inside the DOM-bound `src/app.js` and is
therefore untestable; the suite only covers pure modules. Extracting it would let
the owner-scoping rule get a test, which is the one part of this change that can
silently hide money.

## Later: a stock-market product

Same shape as savings — `product: "stock"` — until it needs a price. The jump in
complexity is not the account, it is the valuation:

- The snapshot needs `units` and a price (plus `cost_basis` if you want to show
  gains, which is the whole point of the exercise).
- The ledger needs a price source and a rule for when prices refresh, which turns
  a workflow that only reacts to issues into one that also runs on a schedule.
- Transfers stop being ±dollars: a contribution buys units at that day's price,
  and a withdrawal sells them. Fractional units and rounding become a real
  question rather than a hypothetical.
- The card must say plainly that this is a simulation, not ownership of a
  security; kids should not walk away thinking they hold shares.

Worth doing once the two-account split has been lived with for a while. Doing it
now would put a price feed in the middle of a change that has not yet proven it
works.

## Order of work

1. Ledger emits `owner`/`product`/`overdraft` in `snapshot.json` (shell keeps
   working untouched).
2. Shell scopes by owner and labels the two cards. **Ship and live with it.**
3. `fee.overdraft` in `charges.json`, filed by a parent.
4. Transfer request type, auto-posted by the ledger when same-owner.
5. Sweep.
6. Optional: the workflow posts the fee itself; then the stock product.

Steps 1–2 are the whole visible feature. Step 4 is the largest single piece, and
it is ledger work: the shell change is a form and a payload.
