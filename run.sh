#!/usr/bin/env bash
# Build the site and check internal links. No scraping: data is maintained by hand.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-$( [ -x .venv/bin/python ] && echo .venv/bin/python || echo python3 )}
case "${1:-build}" in
  build) $PY scripts/build.py && $PY scripts/check_links.py ;;
  serve) $PY scripts/build.py && $PY -m http.server "${PORT:-8787}" -d dist ;;
  *) echo "usage: ./run.sh [build|serve]"; exit 1 ;;
esac
