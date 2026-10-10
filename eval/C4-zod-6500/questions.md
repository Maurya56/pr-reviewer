# C4: colinhacks/zod #6500, "stop the cycle walk from firing a default factory"

Case 4: a bug fix. It fixes the bug in B1 (zod #6387). Merged 2026-08-29, after the model's
training cutoff. 3 files, +177/−13 (one source file, `core/memoizer.ts`).

Note for scoring: the PR description was written for an earlier version of the fix. The merged
code takes a different approach (Q3), so a review that only restates the description gets Q3
wrong.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What was the bug, from a user's point of view?

**Answer:** A `.default(fn)` factory on an object property ran an extra time: on the first
parse of any container above it, even when the property was supplied, and at `z.compile()` time
before any parse. With `z.object({ TEST: z.string().default(() => { n++; return "d"; }) })`,
`parse({ TEST: "provided" })` left `n === 1`.

- 2: the default factory runs when it shouldn't, with at least one of the situations.
- 1: "fixes a default-value bug" without what happened.

### Q2. What is the root cause?

**Answer:** Before its first parse, a container walks its subtree once (`isRecursive()` in
`core/memoizer.ts`) to decide whether it can be re-entered. The walk enumerated every property
on each child's `def`, and `.default(fn)` exposes `defaultValue` as a getter that calls the
factory, so reading it ran user code. The result is cached per schema, hence exactly one extra
call. It was introduced by #6387 and released in 4.5.0.

- 2: the cycle-detection walk reading the getter-backed `defaultValue`.
- 1: "the walk has side effects" without naming the getter.

### Q3. How does the merged fix work, and does it match the PR description?

**Answer:** It replaces the generic scan of `def` with an explicit `switch` over `def.type` that
reads only the slots that hold child schemas (`shape` and `catchall` for objects, `element` for
arrays, `innerType` for wrappers, and so on). Leaf types are listed explicitly, and
`kind satisfies never` makes a new built-in type a compile error. Only the `default:` branch,
for user-defined kinds, still scans `def`, now skipping accessor properties. It does **not**
match the description, which says the walk skips accessors everywhere and that `merge()` now
writes `catchall` as a plain value. The final commit took both of those out, and `merge()` is
unchanged.

- 2: the per-type switch, and that the description is out of date (or that `merge()` isn't
  changed).
- 1: describes the switch without noticing the mismatch, or restates the description's
  accessor-skip approach as the fix.

### Q4. Is it fixed everywhere this pattern could bite?

**Answer:** For built-in types, yes: the switch never reads `defaultValue`, and the exhaustive
`switch` forces any new built-in type to be handled. User-defined kinds fall back to scanning
`def` with accessors skipped. `.prefault()` and `z.compile()` are covered by the same walk and
by the tests.

- 2: mentions the exhaustiveness check or the user-defined fallback.
- 1: says yes without why.

### Q5. What do the tests check?

**Answer:** Call counts for `.default()`, `.prefault()`, and `z.compile()` (`default.test.ts`),
and a cycle reachable only through a merged `catchall` (`cyclic-data.test.ts`), so the
refactored walk still sees cycles through `merge()`.

- 2: the call-count tests and the merged-catchall cycle test.
- 1: one of them.
