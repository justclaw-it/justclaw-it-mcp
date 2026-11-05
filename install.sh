#!/bin/sh
# JustClaw-It installer: connects your coding agents to the JustClaw-It component registry.
#
#   curl -fsSL https://justclaw.it.com/install | sh
#   curl -fsSL https://justclaw.it.com/install | sh -s -- --clients claude-code,cursor
#
# All this does is run `npx @justclaw-it/cli init` (source: https://github.com/justclaw-it/justclaw-it-mcp).
# Your API key is written only to your agents' own config files on this machine.
set -eu

# JUSTCLAW_IT_CLI_PACKAGE overrides the package (e.g. a local tarball for testing).
PKG="${JUSTCLAW_IT_CLI_PACKAGE:-@justclaw-it/cli@latest}"
# Same floor as the CLI's package.json "engines" (>=18.17).
MIN_NODE_MAJOR=18
MIN_NODE_MINOR=17
DOCS_URL="https://justclaw.it.com/docs/quickstart"

say() { printf '%s\n' "$*"; }
die() { printf 'justclaw-it: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ is required. Install it from https://nodejs.org (or: brew install node / your package manager), then re-run."
command -v npx >/dev/null 2>&1 || die "npx not found. It ships with npm; reinstall Node.js from https://nodejs.org."

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]' 2>/dev/null || echo 0)
{ [ "$NODE_MAJOR" -gt "$MIN_NODE_MAJOR" ] || { [ "$NODE_MAJOR" -eq "$MIN_NODE_MAJOR" ] && [ "$NODE_MINOR" -ge "$MIN_NODE_MINOR" ]; }; } 2>/dev/null \
  || die "Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ is required (found $(node -v 2>/dev/null || echo none))."

# The npm "latest" tag pointed at a 0.0.0-stage placeholder before the first release; never run that.
# Skipped when JUSTCLAW_IT_CLI_PACKAGE points somewhere else (local tarball, pinned version).
# A registry that can't be reached (offline, proxy) is not "unpublished": fall through and let npx
# report the real error. Only an E404 or an empty/placeholder version stops here.
if [ -z "${JUSTCLAW_IT_CLI_PACKAGE:-}" ] && command -v npm >/dev/null 2>&1; then
  NOT_PUBLISHED="the JustClaw-It CLI is not published on npm yet"
  if CLI_VERSION=$(npm view --json=false "$PKG" version 2>/dev/null); then
    case "$CLI_VERSION" in
      ""|0.0.0*) die "${NOT_PUBLISHED}${CLI_VERSION:+ (found placeholder ${CLI_VERSION})}. Connect your agent with one command instead: ${DOCS_URL}" ;;
    esac
  elif npm view --json=false "$PKG" version 2>&1 | grep -q 'E404'; then
    die "${NOT_PUBLISHED}. Connect your agent with one command instead: ${DOCS_URL}"
  else
    say "JustClaw-It: couldn't reach the npm registry to check the CLI version; trying anyway."
  fi
fi

say "JustClaw-It: running npx ${PKG} init"

# When piped from curl, stdin is the script itself; reattach the terminal so init can prompt for the key.
if [ ! -t 0 ] && (exec </dev/tty) 2>/dev/null; then
  exec npx -y --package="$PKG" justclaw-it init "$@" </dev/tty
fi
exec npx -y --package="$PKG" justclaw-it init "$@"
