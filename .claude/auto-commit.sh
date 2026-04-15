#!/bin/bash
# Hook: auto commit & push after Claude edits/writes a file

REPO="c:/Users/NATIPONG/Downloads/hepatitis-screening"

# Parse file_path from hook JSON on stdin
f=$(node -e "
  let d='';
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => {
    try { process.stdout.write((JSON.parse(d).tool_input || {}).file_path || ''); }
    catch(e) {}
  });
")

[ -n "$f" ] || exit 0

git -C "$REPO" add "$f"
git -C "$REPO" diff --staged --quiet && exit 0
git -C "$REPO" commit -m "auto: update $f"
git -C "$REPO" push
