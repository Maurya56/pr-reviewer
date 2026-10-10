# Codex integration (placeholder)

Status: **not built yet.** Planned for Phase 3.

The goal is for Codex to produce the same six-section review as Claude Code's `/explain-pr`,
driven by the **same prompt**: [`prompts/review.md`](../../prompts/review.md). There will be no
Codex-specific copy of the review instructions. Each integration is just a thin wrapper that
points at that file and passes a base branch.

## Planned approach

1. **AGENTS.md recipe:** a short snippet to add to a repo's `AGENTS.md` that tells Codex:
   "When asked to explain or review a PR, follow `prompts/review.md`, using `main` as the base
   branch unless one is given."
2. **Custom prompt:** a Codex custom prompt file that wraps `prompts/review.md` and takes an
   optional base-branch argument, mirroring `/explain-pr [base-branch]`.
3. **Phase 1 context file:** once `npx pr-reviewer context` exists, both wrappers will run it
   first and feed the compact context file to the model instead of the raw diff.

## Try it manually today

Paste the contents of `prompts/review.md` into a Codex session on your PR branch and add:

```text
Base branch: main
```
