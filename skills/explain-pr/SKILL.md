---
name: explain-pr
description: Explain the current branch's PR for a human reviewer (intent, before/after flow, reading order, per-change why, risk hotspots), then give prioritized findings. Use when asked to explain, walk through, or review a PR or branch.
argument-hint: "[base-branch]"
allowed-tools: Read Grep Glob Bash(git diff *) Bash(git log *) Bash(git merge-base *) Bash(git rev-parse *) Bash(git show *) Bash(git status *) Bash(git branch *)
---

Review the current branch as a pull request.

- **Base branch:** `$ARGUMENTS` (if empty, use `main`).
- Read the review prompt and follow it exactly, using the base branch above. Look for it, in
  order, relative to this skill's base directory:
  1. `../../prompts/review.md` (installed as a plugin: the prompt ships at the plugin root)
  2. `review.md` (linked into `~/.claude/skills`: a symlink to `prompts/review.md`)
- If neither file is readable, tell the user the skill was installed without its prompt
  (see the pr-reviewer README), and stop.
- This is read-only. Do not edit, stage, or commit anything.
