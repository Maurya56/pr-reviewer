"""Build the scoring sheet for one eval run.

Usage: python3 -I eval/score.py <eval/results/<timestamp>>

Writes scoring.csv (edit it in a spreadsheet) and scoring.md (read it) into that folder. Automatic
columns come from each PR's results.json. Human columns start blank; when judge.json exists they
are pre-filled and prefixed "ai:" so they're never mistaken for a human's scores. See
eval/SCORING.md for what each column means.
"""

import csv
import json
import pathlib
import re
import statistics
import sys

EVAL = pathlib.Path(__file__).resolve().parent
COLUMNS = [
    "pr", "kind", "run", "variant", "status", "cost_usd", "turns", "duration_s", "words", "slop_words",
    "problems_listed", "comprehension", "comprehension_max", "bug_surfaced", "false_findings",
    "true_findings", "signal_ratio", "notes",
]


def question_count(pr_id: str) -> int:
    path = EVAL / pr_id / "questions.md"
    return len(re.findall(r"^### Q\d+", path.read_text(), re.M)) if path.exists() else 0


def judge_for(pr_dir: pathlib.Path, run: int, runs: int) -> dict:
    path = (pr_dir if runs == 1 else pr_dir / f"run-{run}") / "judge.json"
    return json.loads(path.read_text()) if path.exists() else {}


def main() -> None:
    root = pathlib.Path(sys.argv[1])
    manifest = {p["id"]: p for p in json.loads((EVAL / "manifest.json").read_text())["prs"]}
    rows = []
    for results_file in sorted(root.glob("*/results.json")):
        pr_dir = results_file.parent
        data = json.loads(results_file.read_text())
        kind = manifest.get(pr_dir.name, {}).get("kind", "?")
        qmax = question_count(pr_dir.name)
        for r in data["results"]:
            row = {c: "" for c in COLUMNS}
            row.update(pr=pr_dir.name, kind=kind, run=r["run"], variant=r["variant"], status=r["status"],
                       comprehension_max=qmax * 2)
            for k in ("cost_usd", "turns", "duration_s", "words", "slop_words"):
                row[k] = r.get(k, "")
            row["problems_listed"] = r.get("problems", "") if r.get("problems") is not None else ""
            if kind != "buggy":
                row["bug_surfaced"] = "n/a"
            grade = judge_for(pr_dir, r["run"], data["runs"]).get(r["variant"], {})
            if "questions" in grade:
                row["comprehension"] = f"ai:{sum(int(q.get('score', 0)) for q in grade['questions'])}"
            if kind == "buggy" and grade.get("bug_surfaced") in ("y", "n"):
                row["bug_surfaced"] = f"ai:{grade['bug_surfaced']}"
            rows.append(row)

    with open(root / "scoring.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    md = [f"# Scoring sheet: {root.name}", "",
          "Fill the blank columns (see eval/SCORING.md). Values starting with `ai:` were pre-filled",
          "by the blind AI judge: check and overwrite them. Edit scoring.csv, then rerun score.py to",
          "refresh this file; it keeps nothing of its own.", "",
          "| " + " | ".join(COLUMNS) + " |", "| " + " | ".join("---" for _ in COLUMNS) + " |"]
    md += ["| " + " | ".join(str(row[c]) for c in COLUMNS) + " |" for row in rows]

    md += ["", "## Automatic columns, per variant", "",
           "| Variant | Reviews OK | Mean cost | Mean turns | Mean words | Mean slop words | AI comprehension | AI bug surfaced |",
           "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for variant in ("plain", "explain-pr"):
        ok = [r for r in rows if r["variant"] == variant and r["status"] == "ok"]
        mean = lambda k: statistics.mean(float(r[k]) for r in ok) if ok else 0
        comp = [(int(r["comprehension"][3:]), r["comprehension_max"]) for r in ok if str(r["comprehension"]).startswith("ai:")]
        comp_pct = f"{100 * sum(a for a, _ in comp) / max(1, sum(b for _, b in comp)):.0f}%" if comp else "-"
        bugs = [r["bug_surfaced"] for r in ok if str(r["bug_surfaced"]).startswith("ai:")]
        bug_rate = f"{sum(b == 'ai:y' for b in bugs)}/{len(bugs)}" if bugs else "-"
        md.append(f"| {variant} | {len(ok)}/{sum(r['variant'] == variant for r in rows)} | ${mean('cost_usd'):.3f} | "
                  f"{mean('turns'):.1f} | {mean('words'):.0f} | {mean('slop_words'):.1f} | {comp_pct} | {bug_rate} |")

    (root / "scoring.md").write_text("\n".join(md) + "\n")
    print(f"wrote {root / 'scoring.csv'} and {root / 'scoring.md'} ({len(rows)} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
