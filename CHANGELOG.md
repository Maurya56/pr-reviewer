# Changelog

## v0.2.0 (2026-10-12)

First release.

### Commands

- `/explain-pr [base]`: explains a PR in at most 300 words (what changed and why, one example
  traced through the old and new code, up to 5 files to read), then lists problems, each with
  the line that proves it.
- `/explain-pr-deep [base]`: one section per change (example, code walk, what else it touches,
  edge cases, design trade-off), what each test proves, and every changed file.
- Available as a Claude Code plugin, Codex custom prompts, and a GitHub Action (`depth: short`
  or `deep`) that posts one PR comment and updates it on every push.

### `pr-reviewer context` CLI

- Removes lockfiles, build output, generated files, snapshots, pure renames, and
  whitespace-only changes from the diff.
- Counts changed lines exactly, split into logic, tests, config, docs, and removed noise.
- Call graph for Python, TypeScript, JavaScript, Go, C, and C++: changed functions (added,
  modified, removed), their callers with file and line, and callers the PR didn't update.
- Runs on Node 14.18 or newer. Install with `npm install -g github:theaiowlandswan/pr-reviewer`.

### Evaluation

- `eval/`: 17 public PRs covering 12 review cases, 4 of them known-buggy, 11 merged after the
  model's training cutoff. Each has comprehension questions with answers checked against the
  code. `eval/run.sh` compares pr-reviewer with a plain Claude review.

### Known limitations

- The full 17-PR evaluation hasn't been run yet. Published results come from single runs on
  click #3818 and axios #6371.
- On zod #6387 (a known bug), neither a plain review nor `/explain-pr` found the bug in 2 runs
  each.
- The call graph matches callers by function name, so common names can include unrelated
  functions. It doesn't follow calls into other repos.
