#!/bin/bash
# Process Engineer (portable). Double-click to open.
HERE="$(cd "$(dirname "$0")" && pwd)"
PAGE="file://$HERE/app/index.html"
PROFILE="$HERE/.browser-profile"
for APP in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  if [ -x "$APP" ]; then "$APP" --app="$PAGE" --user-data-dir="$PROFILE" --no-first-run >/dev/null 2>&1 & exit 0; fi
done
open "$HERE/app/index.html"
