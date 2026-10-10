#!/usr/bin/env bash
# Run the pr-reviewer review non-interactively and print a PR comment body to stdout.
# Used by action.yml; runs locally too, inside the repo to review with the PR head checked out.
#
# Usage: ci-review.sh <base-branch> [model] [short|deep]
# Needs: claude (Claude Code CLI) and jq on PATH; pr-reviewer on PATH makes it faster and cheaper.

set -euo pipefail

base="${1:?usage: ci-review.sh <base-branch> [model] [short|deep]}"
model="${2:-}"
depth="${3:-short}"
case "$depth" in short|deep) ;; *) echo "ci-review.sh: depth must be short or deep" >&2; exit 2 ;; esac
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Same instructions as the Claude Code skill: the header from build-skill.mjs, then the prompt.
{
  printf 'Review the current branch as a pull request. **Base branch:** `%s`. **Depth: %s.**\n' "$base" "$depth"
  printf 'Follow every instruction below exactly. This is read-only: do not edit, stage, or commit anything.\n\n'
  cat "$root/prompts/review.md"
} > "$work/prompt.md"

args=(-p --output-format json --allowedTools Read Grep Glob
  "Bash(pr-reviewer context:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git merge-base:*)"
  "Bash(git show:*)" "Bash(git status:*)" "Bash(git rev-parse:*)" "Bash(git branch:*)")
if [ -n "$model" ]; then args+=(--model "$model"); fi

claude "${args[@]}" < "$work/prompt.md" > "$work/result.json"

# Drop any preamble ("Now I have the context...") the model wrote before the review proper.
review="$(jq -r '.result // ""' "$work/result.json" | awk '/^## In short/ { found = 1 } found')"
if [ -z "${review// /}" ]; then
  echo "ci-review.sh: Claude returned an empty review" >&2
  jq '{subtype, is_error, num_turns, permission_denials}' "$work/result.json" >&2 || true
  exit 1
fi

meta="$(jq -r '"\(.num_turns) turns · $\(.total_cost_usd * 1000 | round / 1000) · \(.duration_ms / 1000 | round)s"' "$work/result.json")"

# The marker lets action.yml find and update this comment on the next push instead of adding one.
printf '<!-- pr-reviewer -->\n%s\n\n<sub>Reviewed by [pr-reviewer](https://github.com/theaiowlandswan/pr-reviewer) against `%s` · %s</sub>\n' \
  "$review" "$base" "$meta"
