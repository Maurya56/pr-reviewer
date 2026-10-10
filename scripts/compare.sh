#!/usr/bin/env bash
# Compare a plain Claude review with /explain-pr on the current branch, side by side.
#
# Usage (run inside the repo you want reviewed, on the PR branch):
#   compare.sh [base-branch] [out-dir]
#
# Both runs use the same model, the same read-only tools, and run in parallel. The plain run has
# the Skill tool blocked, so it can't quietly load explain-pr. Writes plain.md, explain-pr.md, the
# raw JSON, and summary.md (tokens, cost, turns, plus a scoring sheet) to out-dir.

set -euo pipefail

base="${1:-main}"
out="${2:-${TMPDIR:-/tmp}/pr-reviewer-compare-$(date +%Y%m%d-%H%M%S)}"

command -v claude >/dev/null || { echo "compare.sh: the claude CLI is not on PATH" >&2; exit 1; }
command -v python3 >/dev/null || { echo "compare.sh: python3 is needed for the summary" >&2; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "compare.sh: run this inside the repo to review" >&2; exit 1; }
# Inside pr-reviewer itself, CLAUDE.md and prompts/review.md teach the plain run the format.
if [ -f "$(git rev-parse --show-toplevel)/.claude-plugin/plugin.json" ] &&
  grep -q '"name": "pr-reviewer"' "$(git rev-parse --show-toplevel)/.claude-plugin/plugin.json"; then
  echo "compare.sh: don't run this inside pr-reviewer: the plain review would copy its format. Use another repo." >&2
  exit 1
fi
mkdir -p "$out"

read_only=(Read Grep Glob
  "Bash(git diff:*)" "Bash(git log:*)" "Bash(git merge-base:*)" "Bash(git show:*)"
  "Bash(git status:*)" "Bash(git rev-parse:*)" "Bash(git branch:*)")

echo "Reviewing $(git branch --show-current) against $base (both runs in parallel, a few minutes)..."

claude -p "Review the changes on the current branch as a pull request against $base." \
  --output-format json --allowedTools "${read_only[@]}" --disallowedTools Skill SlashCommand \
  > "$out/plain.json" 2> "$out/plain.err" &
plain_pid=$!

claude -p "Use the explain-pr skill to review the current branch as a pull request against $base." \
  --output-format json --allowedTools "${read_only[@]}" Skill "Bash(pr-reviewer context:*)" \
  > "$out/explain-pr.json" 2> "$out/explain-pr.err" &
explain_pid=$!

status=0
wait "$plain_pid" || { echo "plain run failed, see $out/plain.err" >&2; status=1; }
wait "$explain_pid" || { echo "explain-pr run failed, see $out/explain-pr.err" >&2; status=1; }

python3 - "$out" "$base" "$(git branch --show-current)" <<'EOF'
import json, sys, pathlib

out, base, branch = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]

def load(name):
    try:
        data = json.loads((out / f"{name}.json").read_text())
    except (OSError, json.JSONDecodeError):
        return None
    (out / f"{name}.md").write_text(data.get("result", ""))
    return data

def row(label, d):
    if d is None:
        return f"| {label} | failed | | | | | |"
    if not d.get("result", "").strip():
        return f"| {label} | empty review: rerun (see {label}.json) | | | | | |"
    u = d.get("usage", {})
    tokens_in = u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)
    text = d.get("result", "")
    return (f"| {label} | {tokens_in:,} | {u.get('output_tokens', 0):,} | ${d.get('total_cost_usd', 0):.3f} "
            f"| {d.get('num_turns', 0)} | {d.get('duration_ms', 0) / 1000:.0f}s | {len(text.split()):,} |")

plain, explain = load("plain"), load("explain-pr")
used_skill = explain is not None and "TL;DR" in explain.get("result", "")

summary = f"""# Review comparison: `{branch}` vs `{base}`

| Run | Input tokens | Output tokens | Cost | Turns | Time | Words |
| --- | --- | --- | --- | --- | --- | --- |
{row("plain", plain)}
{row("explain-pr", explain)}

explain-pr format detected: {"yes" if used_skill else "NO: the run may not have loaded the skill"}

Read `plain.md` and `explain-pr.md`, then score each 1-5:

| Question | plain | explain-pr |
| --- | --- | --- |
| After 2 minutes of reading, could you explain what the PR does? | | |
| Is the intent correct? | | |
| Did the diagram help you see the change? | | |
| Real bugs found (count) | | |
| False or made-up claims (count) | | |
| Would you paste its findings into the PR as-is? | | |
| Which would you rather get on every PR? | | |
"""
(out / "summary.md").write_text(summary)
print(summary)
EOF

echo "Outputs in: $out"
exit "$status"
