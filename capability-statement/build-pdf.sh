#!/bin/bash
# Regenerates ../docs/assets/CodeRing_Capability_Statement.pdf from capability-statement.html
# using headless Chrome. Run from Git Bash: bash build-pdf.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
SRC="file:///$(cygpath -m "$DIR/capability-statement.html")"
OUT="$(cygpath -w "$DIR/../docs/assets/CodeRing_Capability_Statement.pdf")"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf="$OUT" "$SRC" 2>&1 | grep -i "written" || { echo "PDF generation failed"; exit 1; }
