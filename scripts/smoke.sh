#!/usr/bin/env bash
# Smoke-test the built CLI on whatever `node` is on PATH: a throwaway repo where a branch changes
# a Python function that another file calls. CI runs this on Node 14 (the oldest supported
# runtime) after building on a current Node, since the test suite itself needs Node 18+.
#
# Usage: npm run build && scripts/smoke.sh

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(mktemp -d)"
trap 'rm -rf "$repo"' EXIT
export GIT_AUTHOR_NAME=smoke GIT_AUTHOR_EMAIL=s@x GIT_COMMITTER_NAME=smoke GIT_COMMITTER_EMAIL=s@x

cd "$repo"
git init -q -b main
printf 'def total(xs):\n    return sum(xs)\n' > calc.py
printf 'from calc import total\n\n\ndef handler(req):\n    return total(req.items)\n' > app.py
git add -A && git commit -qm base
git switch -qc feature
printf 'def total(xs):\n    return sum(x for x in xs if x > 0)\n' > calc.py
git commit -qam "Ignore negative values in total"

out="$(node "$root/dist/cli.js" context --base main --stdout)"
fail() { echo "smoke: $1 (node $(node -v))" >&2; echo "$out" >&2; exit 1; }
grep -q "Logic: +1/−1 in 1 file" <<<"$out" || fail "size line missing or wrong"
grep -q "## Changed functions" <<<"$out" || fail "call graph missing"
grep -q '`handler` (`app.py:5`' <<<"$out" || fail "caller not found"
echo "smoke: ok on node $(node -v)"
