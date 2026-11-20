#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

PAT="${PAT:-}"
REPO="${REPO:-${BANK_REPO:-}}"
ROLE="${ROLE:-${BANK_ROLE:-kid}}"
SITE="${SITE:-${BANK_SITE:-}}"
ACCOUNT="${ACCOUNT:-${BANK_ACCOUNT:-}}"
OUT="${OUT:-$root/token-qr.svg}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

out_abs="$(realpath -m "$OUT")"
case "$out_abs" in
  "$root"/*)
    rel="${out_abs#"$root"/}"
    if ! git check-ignore -q -- "$rel"; then
      echo "Refusing to write QR to $rel inside the repo: it is not git-ignored." >&2
      exit 1
    fi
    ;;
esac

if [[ -z "$PAT" ]]; then
  while true; do
    read -r -s -p "GitHub PAT (github_pat_...): " PAT
    echo
    [[ -n "$PAT" ]] && break
    echo "PAT is required." >&2
  done
fi

if [[ -z "$REPO" ]]; then
  while true; do
    read -r -s -p "Ledger repo (owner/name): " REPO
    echo
    [[ -n "$REPO" ]] && break
    echo "Repo is required." >&2
  done
fi

if [[ "${ROLE,,}" != "parent" && -z "$ACCOUNT" ]]; then
  while true; do
    read -r -p "Kid account name (as in snapshot): " ACCOUNT
    [[ -n "$ACCOUNT" ]] && break
    echo "Account is required for kid pairings." >&2
  done
fi

export BANK_TOKEN="$PAT"
export BANK_REPO="$REPO"
export BANK_ROLE="$ROLE"
export BANK_ACCOUNT="$ACCOUNT"
if [[ -n "$SITE" ]]; then
  export BANK_SITE="$SITE"
fi

node scripts/token-qr.mjs --out "$OUT"
