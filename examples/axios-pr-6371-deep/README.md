# axios/axios #6371, deep review

[feat(adapter): add fetch adapter](https://github.com/axios/axios/pull/6371): 21 files,
+1015/−127. [`explain-pr-deep.md`](explain-pr-deep.md) is `/explain-pr-deep` run against the
PR's real base commit (12 turns, $0.40, about 3 minutes, 2,963 words).

What a deep review adds over the short one, on this PR:

- One section per change, including the XHR adapter's refactor onto the new shared helpers,
  which every browser user runs, so "fetch is opt-in" doesn't mean nothing changed.
- Corners a short review skips: `parseProtocol` now runs on the fully resolved URL,
  `toFiniteNumber(null, 100)` used to return 0, and download progress counts compressed bytes
  when the response is gzipped.
- **A real bug the PR shipped with:** `trackStream` calls `onFinish()` unguarded, and both
  fetch call sites can pass no (or a falsy) `onFinish`. axios fixed exactly this two months
  later, in [#6518](https://github.com/axios/axios/pull/6518) (`onFinish && onFinish(e)`).
