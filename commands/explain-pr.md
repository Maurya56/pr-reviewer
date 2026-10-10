---
description: Explain the current branch's PR for a human reviewer, then give prioritized findings
argument-hint: "[base-branch]"
---

Use the `explain-pr` skill (named `pr-reviewer:explain-pr` when installed as a plugin) to review the
current branch as a pull request. Base branch: `$ARGUMENTS` (if empty, use `main`).

This command only exists so older Claude Code versions, which don't list skills in the `/` menu,
can still run the review. The skill and `prompts/review.md` hold the actual instructions.
