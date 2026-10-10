#!/usr/bin/env bash
# Compare a plain Claude review with /explain-pr on the current branch, side by side.
#
# Usage (run inside the repo you want reviewed, on the PR branch):
#   compare.sh [--runs N] [base-branch] [out-dir]
#
# Both variants use the same model and the same read-only tools, and run in parallel. The plain
# run has the Skill tool blocked, so it can't quietly load explain-pr. With --runs N (default 1)
# each variant runs N times, into out-dir/run-1, run-2, ...; with one run the files go straight
# into out-dir. Writes each review as markdown plus its raw JSON, results.json with per-run
# metrics, and summary.md.

set -euo pipefail

runs=1
positional=()
while [ $# -gt 0 ]; do
  case "$1" in
    --runs) runs="$2"; shift 2 ;;
    *) positional+=("$1"); shift ;;
  esac
done
base="${positional[0]:-main}"
out="${positional[1]:-${TMPDIR:-/tmp}/pr-reviewer-compare-$(date +%Y%m%d-%H%M%S)}"
root="$(cd "$(dirname "$0")/.." && pwd)"

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

status=0
for i in $(seq 1 "$runs"); do
  dir="$out"
  [ "$runs" -gt 1 ] && dir="$out/run-$i"
  mkdir -p "$dir"
  echo "Run $i/$runs: reviewing $(git branch --show-current) against $base (both variants in parallel)..." >&2

  claude -p "Review the changes on the current branch as a pull request against $base." \
    --output-format json --allowedTools "${read_only[@]}" --disallowedTools Skill SlashCommand \
    > "$dir/plain.json" 2> "$dir/plain.err" &
  plain_pid=$!

  claude -p "Use the explain-pr skill to review the current branch as a pull request against $base." \
    --output-format json --allowedTools "${read_only[@]}" Skill "Bash(pr-reviewer context:*)" \
    > "$dir/explain-pr.json" 2> "$dir/explain-pr.err" &
  explain_pid=$!

  wait "$plain_pid" || { echo "run $i: plain failed, see $dir/plain.err" >&2; status=1; }
  wait "$explain_pid" || { echo "run $i: explain-pr failed, see $dir/explain-pr.err" >&2; status=1; }
done

commit="$(git -C "$root" rev-parse --short HEAD)$(git -C "$root" diff --quiet || echo "-dirty")"

python3 -I - "$out" "$base" "$(git branch --show-current)" "$runs" "$commit" <<'EOF'
import json, re, statistics, sys, pathlib

out, base, branch, runs, commit = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
VARIANTS = ["plain", "explain-pr"]
SLOP = re.compile(r"\b(excellent|elegant|clean|solid|well-crafted|comprehensive|clever|robust|great|outstanding|exemplary)\b|✅|⚠️|🔍", re.I)

def problems_count(text):
    """Bullets under the explain-pr '## Problems' heading; None when the section is missing."""
    m = re.search(r"^## Problems\s*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    if not m:
        return None
    return sum(1 for line in m.group(1).splitlines() if re.match(r"\s*- ", line) and "none found" not in line.lower())

def metrics(run, variant, d):
    row = {"run": run, "variant": variant}
    if d is None:
        return {**row, "status": "failed"}
    text = d.get("result", "") or ""
    if d.get("is_error"):
        # e.g. "Spending cap reached": Claude reports these as results with is_error set.
        return {**row, "status": f"error: {text.strip()[:80]}"}
    u = d.get("usage", {})
    row.update(
        status="ok" if text.strip() else "empty",
        input_tokens=u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0),
        output_tokens=u.get("output_tokens", 0),
        cost_usd=round(d.get("total_cost_usd", 0), 4),
        turns=d.get("num_turns", 0),
        duration_s=round(d.get("duration_ms", 0) / 1000),
        words=len(text.split()),
        slop_words=len(SLOP.findall(text)),
    )
    if variant == "explain-pr":
        row["format_ok"] = "## In short" in text
        row["problems"] = problems_count(text)
    return row

rows = []
for i in range(1, runs + 1):
    d = out if runs == 1 else out / f"run-{i}"
    for v in VARIANTS:
        try:
            data = json.loads((d / f"{v}.json").read_text())
            (d / f"{v}.md").write_text(data.get("result", "") or "")
        except (OSError, json.JSONDecodeError):
            data = None
        rows.append(metrics(i, v, data))

(out / "results.json").write_text(json.dumps(
    {"branch": branch, "base": base, "runs": runs, "pr_reviewer_commit": commit, "results": rows}, indent=2) + "\n")

def fmt(values, money=False):
    vals = [v for v in values if v is not None]
    if not vals:
        return "-"
    f = (lambda x: f"${x:.3f}") if money else (lambda x: f"{x:,.0f}")
    mean = statistics.mean(vals)
    return f(mean) if len(vals) == 1 else f"{f(mean)} ({f(min(vals))}-{f(max(vals))})"

lines = [f"# Review comparison: `{branch}` vs `{base}`", "",
         f"{runs} run(s) per variant, pr-reviewer at `{commit}`. Means, with min-max across runs.", "",
         "| Variant | OK runs | Input tokens | Output tokens | Cost | Turns | Time (s) | Words | Slop words |",
         "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
for v in VARIANTS:
    ok = [r for r in rows if r["variant"] == v and r["status"] == "ok"]
    col = lambda k: [r.get(k) for r in ok]
    lines.append(f"| {v} | {len(ok)}/{runs} | {fmt(col('input_tokens'))} | {fmt(col('output_tokens'))} | "
                 f"{fmt(col('cost_usd'), money=True)} | {fmt(col('turns'))} | {fmt(col('duration_s'))} | "
                 f"{fmt(col('words'))} | {fmt(col('slop_words'))} |")
bad = [r for r in rows if r["status"] != "ok" or (r["variant"] == "explain-pr" and not r.get("format_ok"))]
for r in bad:
    lines.append(f"\n- run {r['run']} {r['variant']}: {r['status']}"
                 + ("" if r.get("format_ok", True) else ", explain-pr format missing (skill may not have loaded)"))
summary = "\n".join(lines) + "\n"
(out / "summary.md").write_text(summary)
print(summary)
EOF

echo "Outputs in: $out" >&2
exit "$status"
