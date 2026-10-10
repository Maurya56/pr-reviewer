# pallets/click #3818

[Fix race condition on `KeyboardInterrupt` in `Command.main()`](https://github.com/pallets/click/pull/3818):
4 files, +273/−37 (52 lines of logic, 179 of tests, the rest docs). Reviewed against the PR's
real base commit, same model and same read-only tools for both, with `scripts/compare.sh`.

- [`explain-pr.md`](explain-pr.md): pr-reviewer
- [`plain-review.md`](plain-review.md): "Review the changes on the current branch as a pull request"

| Run | Input tokens | Output tokens | Cost | Turns | Time | Words |
| --- | --- | --- | --- | --- | --- | --- |
| Plain Claude review | 230,789 | 3,514 | $0.17 | 12 | 103s | 1,006 |
| pr-reviewer | 88,434 | 1,355 | $0.10 | 6 | 46s | 554 |

One run each; costs vary between runs.
