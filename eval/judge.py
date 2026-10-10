"""Blind AI pre-grading of reviews against an answer key. Optional: a human's scores are the real ones.

Usage: python3 -I eval/judge.py <results/<ts>/<id>> <eval/<id>/questions.md>

For every review (run-N/plain.md, run-N/explain-pr.md, or the same files directly in the folder),
asks `claude -p` to score each comprehension question 0-2 and, for buggy PRs, whether the known
bug was surfaced. The judge isn't told which variant wrote the review, and runs from an empty
temp folder so it grades only what the review says, not what it could look up. Writes
judge.json next to each review set.
"""

import json
import pathlib
import re
import subprocess
import sys
import tempfile

PROMPT = """You are grading a code review of a pull request against an answer key. Grade only
what the review actually says; do not give credit for things it doesn't say, and do not use your
own knowledge of the project.

For each question in the answer key, score how well the review answers it, using the rubric under
that question: 2 (correct and specific), 1 (partly right or vague), 0 (missing or wrong). A review
doesn't need to use the same words, but it must contain the substance.

{bug_instruction}

Reply with only a JSON object, no prose, in exactly this shape:
{{"questions": [{{"id": "Q1", "score": 0, "why": "one short sentence"}}], {bug_shape}}}

=== ANSWER KEY ===
{key}

=== REVIEW TO GRADE ===
{review}
"""

BUG_INSTRUCTION = """The answer key has a "Known bug" section. Decide whether the review surfaces that
bug, using the "Counts as surfaced" rule in that section: "y" or "n"."""


def grade(review: str, key: str, buggy: bool) -> dict:
    prompt = PROMPT.format(
        key=key,
        review=review,
        bug_instruction=BUG_INSTRUCTION if buggy else "There is no known bug for this PR.",
        bug_shape='"bug_surfaced": "y", "bug_why": "one short sentence"' if buggy else '"bug_surfaced": "n/a"',
    )
    with tempfile.TemporaryDirectory() as empty:
        proc = subprocess.run(
            ["claude", "-p", "--output-format", "json", "--max-turns", "2"],
            input=prompt, capture_output=True, text=True, cwd=empty, timeout=600,
        )
    result = json.loads(proc.stdout).get("result", "")
    match = re.search(r"\{.*\}", result, re.S)
    if not match:
        raise ValueError(f"judge returned no JSON: {result[:200]!r}")
    return json.loads(match.group(0))


def main() -> None:
    pr_dir, questions = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    key = questions.read_text()
    buggy = "## Known bug" in key
    run_dirs = sorted(pr_dir.glob("run-*")) or [pr_dir]
    for run_dir in run_dirs:
        grades = {"grader": "ai (blind; a human's scores override)"}
        for variant in ("plain", "explain-pr"):
            review_file = run_dir / f"{variant}.md"
            if not review_file.exists() or not review_file.read_text().strip():
                grades[variant] = {"error": "no review"}
                continue
            try:
                grades[variant] = grade(review_file.read_text(), key, buggy)
            except Exception as error:  # keep grading the rest; record what failed
                grades[variant] = {"error": str(error)}
            print(f"judged {run_dir.name} {variant}", file=sys.stderr)
        (run_dir / "judge.json").write_text(json.dumps(grades, indent=2) + "\n")


if __name__ == "__main__":
    main()
