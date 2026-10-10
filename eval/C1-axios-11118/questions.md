# C1: axios/axios #11118, "tolerate nullish handlers in syncHandlerEntries"

Case 1: a small change in a function. Merged 2026-08-13, after the model's training cutoff.
2 files, +72/−4 (one source file).

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What was broken, and for whom?

**Answer:** If user code set an interceptor manager's public `handlers` to `null` or
`undefined` (e.g. `axios.interceptors.request.handlers = null`), every later request threw
`TypeError: Cannot read properties of null (reading 'length')`, because `syncHandlerEntries()`
read `handlers.length` without checking. It was a regression from #11087, merged but unreleased;
v1.19.0 tolerated a nullish `handlers`.

- 2: the nullish `handlers` crash on every request, and that it's an unreleased regression.
- 1: "fixes a crash in interceptors" without the trigger.

### Q2. Where exactly were the unguarded reads, and how are they fixed?

**Answer:** Several places, not one, all in `lib/core/InterceptorManager.js`: the
`else if (handlers.length !== ...)` branch and the trailing `internals.handlersLength =
handlers.length` in `syncHandlerEntries`, the loop in `trimHandlers`, and the `finally` block of
`forEach`. A new `countHandlers(handlers)` helper treats nullish as 0, and `trimHandlers`
returns early on nullish.

- 2: names `countHandlers` and at least two of the guarded sites, including the `forEach`
  `finally` block.
- 1: names only `syncHandlerEntries`.

### Q3. What else does this change affect besides the crash?

**Answer:** `use()` now replaces a nullish `handlers` with a fresh `[]` before registering, so
after `handlers = null` a new interceptor works again and the manager recovers. The guarded
helpers run on every request: the request pipeline in `lib/core/Axios.js` walks interceptors
with `forEach`. `clear()` already guarded with `if (this.handlers)`.

- 2: notes the new `use()` behaviour, or that the change sits on every request's path.
- 1: says nothing else is affected without checking.

### Q4. What do the tests cover?

**Answer:** Eight cases, run for both `null` and `undefined`: `forEach` doesn't throw, a
**repeated** `forEach` doesn't throw (that hits the `handlers === handlersRef` branch where the
reported stack trace lands, which one call doesn't reach), `eject` doesn't throw, and the
manager recovers once `handlers` is an array again. All eight fail before the change.

- 2: names the repeated-`forEach` case (or why one call isn't enough) and the null/undefined
  parametrization.
- 1: says tests were added without what they check.

### Q5. What is deliberately left out?

**Answer:** Two related issues from the same earlier change: `eject(String(id))` now silently
does nothing, because lookups go through a `Map` rather than an array index; and a test indexes
handlers by id, which only holds while nothing below those slots is trimmed.

- 2: names the `eject(String(id))` no-op.
- 1: says some follow-ups were left out without which.
