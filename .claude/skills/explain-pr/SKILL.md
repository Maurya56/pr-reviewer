---
name: explain-pr
description: Explain the current branch's PR for a human reviewer (intent, before/after flow, reading order, per-change why, risk hotspots), then give prioritized findings. Use when asked to explain, walk through, or review a PR or branch.
argument-hint: "[base-branch]"
allowed-tools: Read Grep Glob Bash(git diff *) Bash(git log *) Bash(git merge-base *) Bash(git rev-parse *) Bash(git show *) Bash(git status *) Bash(git branch *)
---

Review the current branch as a pull request.

- **Base branch:** `$ARGUMENTS` (if empty, use `main`).
- Read `review.md` in this skill's base directory and follow it exactly, using the base
  branch above. (It is a symlink to `prompts/review.md` in the pr-reviewer repo.)
- If that file is missing or unreadable, tell the user the skill was installed without its
  prompt (see the pr-reviewer README), and stop.
- This is read-only. Do not edit, stage, or commit anything.
