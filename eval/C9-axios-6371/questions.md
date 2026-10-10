# C9: axios/axios #6371, "feat(adapter): add fetch adapter"

Case 9: a big new feature in an existing codebase. Merged 2024-04-28. 21 files, +1015/−127.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What does it add, and when is it used?

**Answer:** A `fetch` adapter (`lib/adapters/fetch.js`, about 200 lines), registered in
`lib/adapters/adapters.js`. The default adapter list becomes `['xhr', 'http', 'fetch']`, so fetch
is used only where neither XMLHttpRequest nor Node's `http` exists (e.g. some edge or worker
runtimes). Users can pick it explicitly with `adapter: 'fetch'`, and pass extra options through
the new `fetchOptions` config.

- 2: the new adapter, that it's last in the default list (a fallback, not the new default), and
  explicit opt-in.
- 1: "adds fetch support" without when it's chosen.

### Q2. Where does it plug in, and what existing code changed to make room for it?

**Answer:** Logic the XHR adapter had inline is pulled out into shared helpers that both
adapters use: `helpers/resolveConfig.js` (URL, headers, and auth resolution),
`helpers/progressEventReducer.js` (progress events), `helpers/composeSignals.js` (merge cancel
signals and the timeout into one `AbortController`), and `helpers/trackStream.js` (progress on
streams). `xhr.js` shrinks by about 130 lines. Default transforms pass `ReadableStream` and
`Response` bodies through, new type checks land in `utils.js`, and the types gain `'fetch'`,
`fetchOptions`, a `'formdata'` response type, and `lengthComputable` on progress events.

- 2: names the shared helpers extracted from `xhr.js` (at least two) and that XHR was refactored
  onto them.
- 1: says xhr was changed without how.

### Q3. What's the risk for existing users who never use fetch?

**Answer:** The XHR adapter (what browser users get by default) is rewritten onto the new shared
helpers, so a regression there would hit most browser users even though fetch is opt-in.
Progress events also change shape (new `lengthComputable`). And the internal `throttle` helper
changes how it's forced: from an argument `throttled(true, args)` to `this === true` via
`updateProgress.call(true)`, which works only because modules run in strict mode.

- 2: identifies the XHR refactor as the main risk for non-fetch users, with any of the specifics.
- 1: "should be low risk since fetch is opt-in" without noticing the XHR rewrite.

### Q4. Is timeout handling consistent with the other adapters?

**Answer:** No. In `helpers/composeSignals.js` the fetch path's timeout error reads
`` `timeout ${timeout} of ms exceeded` `` (garbled: "timeout 5000 of ms exceeded"), while xhr and
http say `'timeout of ' + timeout + 'ms exceeded'`. The fetch path also never reads
`config.timeoutErrorMessage`, so a custom timeout message is ignored with `adapter: 'fetch'`.
Both are checkable in the code.

- 2: finds the garbled message or the ignored `timeoutErrorMessage`.
- 1: says timeouts go through `composeSignals` without comparing them to the other adapters.

### Q5. How is it tested?

**Answer:** A new `test/unit/adapters/fetch.js` (about 370 lines) against a new local test
server helper (`test/helpers/server.js`), plus CI and rollup config changes to run and bundle it.

- 2: the dedicated fetch test suite and the test server.
- 1: "tests added" without specifics.
