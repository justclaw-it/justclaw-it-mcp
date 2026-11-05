#!/bin/sh
# Run before every push: secret scan + leak grep. This repo is a thin public connector:
# no server code, no internal hosts/IPs, no keys, no personal repo names.
#   scripts/precheck.sh             gitleaks (history + working tree) + grep
#   scripts/precheck.sh --grep-only grep only (CI runs gitleaks separately)
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--grep-only" ]; then
  if command -v gitleaks >/dev/null 2>&1; then GL="gitleaks"
  elif command -v uvx >/dev/null 2>&1; then GL="uvx gitleaks"
  else echo "precheck: install gitleaks (or uv) first" >&2; exit 1; fi
  if git rev-parse HEAD >/dev/null 2>&1; then $GL detect --source . --no-banner --redact; fi
  $GL detect --source . --no-git --no-banner --redact
fi

# Internal patterns that must never appear (tailnet IPs, host names, personal repos, live keys).
PATTERN='(^|[^0-9.])100\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|tail[0-9a-f]{6,}\.ts\.net|mperkins|vps-|cobalt-components-mcp|cobalt_live_[A-Za-z0-9_-]{20,}'
if git ls-files -co --exclude-standard | grep -v -x -e scripts/precheck.sh | xargs grep -n -E "$PATTERN" 2>/dev/null; then
  echo "precheck: internal pattern found (above)" >&2
  exit 1
fi
echo "precheck: clean"
