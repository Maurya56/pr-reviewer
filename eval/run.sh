#!/usr/bin/env bash
# Run the pr-reviewer eval: review every PR in eval/manifest.json with a plain Claude review and
# with pr-reviewer, N times each, and save the outputs, tokens, and cost under eval/results/.
#
# Usage: eval/run.sh [--runs N] [--judge] [--prepare-only] [id ...]
#   --runs N         reviews per variant per PR (default 3)
#   --judge          also let a blind AI judge pre-fill comprehension and bug columns (eval/judge.py)
#   --prepare-only   just fetch the PR repos into eval/.cache/
#   id ...           only these PRs (default: all in the manifest)
#
# Each PR gets its own repo in eval/.cache/<id>/ holding only history up to the PR, fetched by
# commit. A normal clone would also contain the later fix commit ("Regressed in #6387"), and the
# reviewer could find it with `git log --all`.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
eval_dir="$root/eval"
cache="$eval_dir/.cache"
runs=3
judge=0
prepare_only=0
ids=()

while [ $# -gt 0 ]; do
  case "$1" in
    --runs) runs="$2"; shift 2 ;;
    --judge) judge=1; shift ;;
    --prepare-only) prepare_only=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) ids+=("$1"); shift ;;
  esac
done

field() { # field <id> <key>: one value from the manifest
  python3 -I -c 'import json,sys; m=json.load(open(sys.argv[1])); print(next(p for p in m["prs"] if p["id"]==sys.argv[2])[sys.argv[3]])' \
    "$eval_dir/manifest.json" "$1" "$2"
}

if [ ${#ids[@]} -eq 0 ]; then
  while IFS= read -r id; do ids+=("$id"); done < <(python3 -I -c 'import json,sys; [print(p["id"]) for p in json.load(open(sys.argv[1]))["prs"]]' "$eval_dir/manifest.json")
fi

prepare() { # prepare <id>: a repo with branch `base` and the PR checked out as `pr-<id>`
  local id="$1" work="$cache/$1"
  local repo base head
  repo="$(field "$id" repo)"; base="$(field "$id" base_sha)"; head="$(field "$id" head_sha)"
  if [ ! -d "$work/.git" ]; then
    echo "fetching $id ($repo)..." >&2
    mkdir -p "$work"
    git -C "$work" init -q
    git -C "$work" fetch -q --depth=200 "https://github.com/$repo.git" "$head" "$base"
    # Deepen until the merge base is present (long-lived PR branches).
    for depth in 1000 5000; do
      git -C "$work" merge-base "$base" "$head" >/dev/null 2>&1 && break
      git -C "$work" fetch -q --depth="$depth" "https://github.com/$repo.git" "$head" "$base"
    done
  fi
  git -C "$work" branch -f base "$base" >/dev/null
  git -C "$work" checkout -q -f -B "pr-$id" "$head"
  git -C "$work" merge-base base HEAD >/dev/null || { echo "$id: no merge base in fetched history" >&2; return 1; }
}

for id in "${ids[@]}"; do prepare "$id"; done
[ "$prepare_only" -eq 1 ] && { echo "prepared ${#ids[@]} PRs in $cache"; exit 0; }

# Review with this checkout's build of pr-reviewer, not whatever is installed globally.
[ -f "$root/dist/cli.js" ] || { echo "run 'npm run build' first" >&2; exit 1; }
mkdir -p "$cache/bin"
printf '#!/bin/sh\nexec node "%s/dist/cli.js" "$@"\n' "$root" > "$cache/bin/pr-reviewer"
chmod +x "$cache/bin/pr-reviewer"
export PATH="$cache/bin:$PATH"

out="$eval_dir/results/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"
git -C "$root" rev-parse HEAD > "$out/pr-reviewer-commit.txt"
git -C "$root" diff --quiet || echo "dirty" >> "$out/pr-reviewer-commit.txt"

for id in "${ids[@]}"; do
  echo "=== $id ($(field "$id" title))" >&2
  # A failed run (an error, a usage cap) shouldn't stop the other PRs or the scoring sheet.
  (cd "$cache/$id" && "$root/scripts/compare.sh" --runs "$runs" base "$out/$id") ||
    echo "$id: some runs failed; see summary.md. Continuing." >&2
  if [ "$judge" -eq 1 ]; then
    python3 -I "$eval_dir/judge.py" "$out/$id" "$eval_dir/$id/questions.md" ||
      echo "$id: judging failed; continuing." >&2
  fi
done

python3 -I "$eval_dir/score.py" "$out"
echo "Results: $out" >&2
