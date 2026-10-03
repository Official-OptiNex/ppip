#!/bin/sh
HERE="$(cd "$(dirname "$0")" && pwd)"
PAGE="file://$HERE/app/index.html"
for B in google-chrome chromium chromium-browser microsoft-edge; do
  if command -v $B >/dev/null 2>&1; then $B --app="$PAGE" --user-data-dir="$HERE/.browser-profile" --no-first-run >/dev/null 2>&1 & exit 0; fi
done
xdg-open "$HERE/app/index.html"
