# Eval

Measures pr-reviewer against a plain Claude review on real public PRs, before and after any
product change.

- `manifest.json`: 17 PRs covering all 12 review cases from the research doc (each PR lists its
  `cases`; the case names are at the bottom of the file). Five are tangled (10+ files, refactor
  mixed with features), four are known-buggy (merged, later fixed by another PR, recorded under
  `fix`; C9's bug was found by a deep review), and the rest were picked for a single case, including an AI-agent PR with the issue it was
  asked to solve (`ask`) and a C++ PR. 12 of the 17 were merged after the model's training
  cutoff.
- `<id>/questions.md`: 3-5 comprehension questions with answers and scoring rubrics, and for
  buggy PRs the known bug, quoted from the fix commit.
- `run.sh`: fetches each PR into its own repo and runs `scripts/compare.sh` on it.
- `judge.py`: optional blind AI pre-grading.
- `score.py`: builds the scoring sheet.
- `SCORING.md`: how to score.

## Run it

```bash
npm run build                          # the eval reviews with this checkout's build
eval/run.sh                            # all PRs, 3 runs per variant
eval/run.sh --runs 1 B1-zod-6387       # one PR, one run
eval/run.sh --judge                    # also pre-fill scores with the AI judge
```

Results land in `eval/results/<timestamp>/`: one folder per PR with each review (`plain.md`,
`explain-pr.md`), its raw JSON, `results.json`, and `summary.md`. The folder also holds
`scoring.csv` and `scoring.md` for all PRs. A full run is 17 PRs × 2 variants × 3 runs = 102
reviews, roughly $20-35 and 2-4 hours; `--runs 1` is about a third of that. C10 (zod #6085,
+8,818 lines) is by far the most expensive single PR.

## Why each PR gets its own repo

`run.sh` fetches only the PR's commits and the history before them, with no remote branches. A
normal clone would also contain the later fix commit ("Regressed in #6387"), which the reviewer
could find with `git log --all`.

## Adding a PR

Add an entry to `manifest.json` (`base_sha..head_sha` must be exactly the PR; for a merge commit
that's its first parent and second parent) and write `<id>/questions.md` from the PR's
description and diff. For a buggy PR, take the bug from the fix commit's message and check it in
the code.
