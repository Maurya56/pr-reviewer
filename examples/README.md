# Examples

This folder will hold **real review outputs** from running pr-reviewer on actual pull requests,
so you can judge the output format before installing anything.

Each example will be a folder like:

```text
examples/<repo>-pr-<number>/
  README.md         # link to the PR, size of the diff, base branch used
  plain-review.md   # a plain "review this PR" output from the same model, for comparison
  explain-pr.md     # the six-section pr-reviewer output
  tokens.md         # input/output tokens for both (and, from Phase 1, raw diff vs context file)
```

The "before/after" comparison is the point. It should show whether a human can understand the PR
faster from `explain-pr.md` than from the plain review, and at what token cost.

Contributions welcome: run `/explain-pr` on a public PR and open a PR adding it here.
