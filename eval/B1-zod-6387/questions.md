# B1: colinhacks/zod #6387, "parse input containing reference cycles"

Known-buggy. Fixed by [#6500](https://github.com/colinhacks/zod/pull/6500). Merged 2026-08-16,
after the model's training cutoff. 5 files, +865/−10.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What problem does this PR solve, and what did users see before it?

**Answer:** Parsing input that contains a reference cycle (an object that points back to itself
or an ancestor) used to fail with a `RangeError` (stack overflow), and `safeParse` threw too, so
it couldn't be caught through the result. After the PR, cyclic input parses and the output
mirrors the cycle (`out.self === out`).

- 2: names cyclic/self-referencing input and the crash (`RangeError` / stack overflow / uncatchable).
- 1: says "adds support for recursive data" without the before-state.

### Q2. How does it work, and where does the mechanism live?

**Answer:** A new memoizer (`core/memoizer.ts`) is attached to classic container schemas
(object, array, tuple, record, map, set) with `attachMemoizer(inst)` before their `init`. Before
parsing children it registers the output object it is about to fill, keyed on `(schema, input)`,
so a back-reference to the same input resolves to that same output object. Core only gains a
small seam (`$ZodMemoizer.alloc`, one line per container), and `zod/mini` doesn't attach it.

- 2: memoizer registers the output before children are parsed, keyed by schema and input, and
  it's opt-in per container in classic (not mini).
- 1: "caches visited objects" without when or how.

### Q3. What behaviour changes even for data with no cycles?

**Answer:** Under a recursive schema, two positions holding the same input object now produce
the same output object (`out.kids[0] === out.kids[1]`), where before they were independent
copies. Non-recursive schemas are unchanged and still copy.

- 2: shared input objects now share one output object, only under recursive schemas.
- 1: mentions identity or sharing changes without the recursive-schema condition.

### Q4. What happens when a cycle passes through a `.transform()`?

**Answer:** It throws `ZodCyclicError`: the transform's output doesn't exist yet when the
back-reference needs it, so the PR chooses a clear error over a silently wrong graph.

- 2: throws a dedicated cyclic error, with the reason.
- 1: says transforms on cycles are unsupported, without the outcome.

### Q5. What does the PR cost?

**Answer:** Recursive schemas parsing ordinary acyclic data get about 2.7× slower (a memo lookup
and insert per node), and the maximum nesting depth drops from about 3400 to about 1100 levels
because of the extra stack frame per container. Non-recursive parsing and `zod/mini` (+34 bytes)
are essentially unchanged.

- 2: names the recursive-schema slowdown and the lower depth limit.
- 1: names one of them.

## Known bug

`isRecursive()` in `packages/zod/src/v4/core/memoizer.ts` walks a schema's definition with
`for (const key in def)` and reads `def[key]`. `.default(fn)` exposes `defaultValue` as a getter
that calls `fn` (`classic/schemas.ts`, `get defaultValue()`), so the walk runs the user's default
factory: an extra call on the first parse of a container, a call even when the key is present
and no default is needed, and a call at `z.compile()` time before any parse.

From the fix commit (84e416fb, #6500): "isRecursive() walks a schema's def looking for child
schemas, and `.default(fn)` exposes `defaultValue` as a getter that calls `fn`. The walk's
`for...in` therefore ran the user's factory [...] Regressed in #6387, released in v4.5.0."

**Counts as surfaced (y)** if the review says the `isRecursive` walk over `def` can invoke getters
or user callbacks (the default factory specifically, or getter-backed def properties in general)
and so cause side effects or extra calls. A generic "the walk might be slow" does not count.
