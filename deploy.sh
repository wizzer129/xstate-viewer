#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root no matter where the script is invoked from.
cd "$(dirname "$0")"

# Build the UI before deploying.
bun run pages:build

bun run pages:deploy -- --project-name xstate-viewer
