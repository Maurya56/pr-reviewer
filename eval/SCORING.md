# Scoring

Each row in `scoring.csv` is one review: one PR × one variant (`plain` or `explain-pr`) × one
run. Read the review (`results/<ts>/<id>/run-N/<variant>.md`) next to the PR's
`<id>/questions.md`, then fill the blank columns.

## Columns you fill

| Column | How to score |
| --- | --- |
| `comprehension` | For each question in `questions.md`, 0-2 by its rubric (2 correct and specific, 1 partly or vague, 0 missing or wrong). Sum them; `comprehension_max` is the ceiling. Score what the review says, not what you know. |
| `bug_surfaced` | Buggy PRs only: `y` if the review raises the known bug by the "Counts as surfaced" rule in `questions.md`, else `n`. Already `n/a` for tangled PRs. |
| `false_findings` | Problems or claims of fact in the review that are wrong when you check the code. Count each once, wherever it appears. |
| `true_findings` | Problems the review raises that are real when you check the code, including the known bug. |
| `signal_ratio` | `true_findings / (true_findings + false_findings)`. Leave blank when both are 0. |
| `notes` | Anything worth remembering: a misleading sentence, a good catch, slop the counter missed. |

## Columns filled automatically

| Column | Source |
| --- | --- |
| `status` | `ok`, `empty` (no review text), or `failed` (the run errored). Only score `ok` rows. |
| `cost_usd`, `turns`, `duration_s` | Claude's JSON result for that run. |
| `words` | Length of the review. |
| `slop_words` | Praise and filler words ("excellent", "comprehensive", "robust", ✅, ...). A cheap proxy, not a quality score. |
| `problems_listed` | explain-pr only: bullets under its `## Problems` heading. The plain review has no fixed format, so count its findings yourself. |

## Pre-filled by the AI judge (optional)

`eval/run.sh --judge` runs `eval/judge.py`, a separate `claude -p` that grades each review against
`questions.md` without knowing which variant wrote it, and from an empty folder so it can't look
at the code. Its values appear as `ai:7` or `ai:y`. Treat them as a first pass: check them and
overwrite with your own. The judge can't fill `false_findings`, `true_findings`, or
`signal_ratio`, because those need the code.

## Reading the results

- Compare variants on the same PR across runs before averaging across PRs: run-to-run spread is
  real, and `summary.md` in each PR folder shows the min-max.
- Weigh bug-finding on `after_model_cutoff: true` PRs (see `manifest.json`) more: on older PRs
  the model may remember the fix.
- A variant wins only if comprehension and signal hold up as well as cost; cheaper but wrong is
  not a win.
