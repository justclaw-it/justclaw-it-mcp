#!/bin/sh
# Publish the JustClaw-It skills to ClawHub (https://clawhub.ai).
#
#   npm i -g clawhub && clawhub login        # once
#   ./clawhub/publish.sh                     # dry run (default): validates, publishes nothing
#   ./clawhub/publish.sh --publish           # real publish
#
# CLAWHUB_OWNER selects the publisher handle (org); unset = your personal account.
set -eu
cd "$(dirname "$0")/.."

MODE="--dry-run"
[ "${1:-}" = "--publish" ] && MODE=""
OWNER_FLAG=""
[ -n "${CLAWHUB_OWNER:-}" ] && OWNER_FLAG="--owner ${CLAWHUB_OWNER}"
SHA=$(git rev-parse HEAD)

publish() { # <slug> <display name> <topics>
  # shellcheck disable=SC2086
  clawhub skill publish "$PWD/skills/$1" \
    --slug "$1" --name "$2" $OWNER_FLAG \
    --categories development,research \
    --topics "$3" \
    --source-repo justclaw-it/justclaw-it-mcp --source-commit "$SHA" --source-ref main --source-path "skills/$1" \
    $MODE
}

publish justclaw-it-search  "JustClaw-It Search"  "mcp,components,code-search,licensing"
publish justclaw-it-pull    "JustClaw-It Pull"    "mcp,components,attribution,licensing"
publish justclaw-it-starter "JustClaw-It Starter" "mcp,components,scaffolding,starter"
