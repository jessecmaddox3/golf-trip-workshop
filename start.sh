#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Install the current Node.js LTS release from https://nodejs.org/en/download and run this file again."
  exit 1
fi
exec node scripts/launch.mjs "$@"
