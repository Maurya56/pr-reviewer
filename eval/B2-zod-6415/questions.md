# B2: colinhacks/zod #6415, "install derived internals on a per-constructor prototype"

Known-buggy. Fixed by [#6429](https://github.com/colinhacks/zod/pull/6429). Merged 2026-08-17,
after the model's training cutoff. 4 files, +106/−57.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What does this PR change, and why?

**Answer:** Memory. Wrapper schemas (`optional`, `nullable`, `readonly`, `catch`, ...) installed
their lazily-computed internals (`values`, `pattern`, ...) as accessors on every instance's
`_zod` object, which gives each object an expensive shape (about 1.2 KB for two accessors). Now
each constructor owns a prototype for its `_zod` objects, and those accessors are installed once
on it. `z.string().nullable()` drops from 3.2 KB to 1.5 KB; an object of ten optional keys from
31.3 KB to 18.5 KB.

- 2: per-instance lazy accessors moved to a shared per-constructor prototype, to cut memory.
- 1: "memory optimization" or "refactor of lazy properties" without the mechanism.

### Q2. How do the lazy fields still behave lazily, including for recursive schemas?

**Answer:** The getter on the prototype computes the value from the internals object it's read
on, then caches it as an own property, so later reads are plain property reads. Before
computing, it installs a placeholder own property (`undefined`), so a recursive schema that
reads its own field while it's still being built gets the placeholder instead of re-running the
getter forever.

- 2: compute on first read, cache as an own property, placeholder for re-entrant reads.
- 1: "cached after first access" without the re-entrancy part.

### Q3. Where does most of the diff come from, and what was left alone?

**Answer:** 33 of 34 call sites in `core/schemas.ts` switch mechanically from per-instance
`defineLazy` to the new `util.defineLazyInternal`. `$ZodLazy`'s `innerType` stays per-instance,
because it holds genuine per-instance state rather than a value derived from `def`.

- 2: the mechanical call-site conversion, and the `$ZodLazy` exception with its reason.
- 1: one of the two.

### Q4. What new building blocks does the PR add?

**Answer:** In `core/core.ts`, `$constructor` creates a `zodProto` per constructor and builds
`_zod` with an `Internals` constructor function whose prototype is `zodProto`. In
`core/util.ts`, `defineLazyInternal(inst, key, compute)` installs the accessor on that prototype.

- 2: names both: the per-constructor internals prototype, and the new helper.
- 1: names one.

## Known bug

Two regressions, both in `defineLazyInternal` (`packages/zod/src/v4/core/util.ts`):

1. **A derived type can't override its base.** The helper returns early with
   `if (key in proto) return;`. A derived constructor runs its base's `init` first, and the base
   installs the field on the shared prototype, so the derived type's own definition is silently
   skipped. `$ZodExactOptional` calls `$ZodOptional.init(inst, def)` and then tries to
   "Override values/pattern to NOT add undefined"; that override never takes effect, so
   `z.exactOptional(...)` carries a stray `undefined` in `values`, and `z.templateLiteral`
   accepts input it should reject.
2. **A mid-construction value gets memoized.** A value read through the re-entrancy placeholder
   during a recursive build is cached, freezing whichever node was visited first at its
   unfinished value.

From the fix commit (9f0a3d81, #6429): "Fixes two regressions from #6415. A derived constructor
could no longer override what its base installed on the shared `_zod` prototype, so
`z.exactOptional(...)` carried a stray `undefined` in `values` and `z.templateLiteral` accepted
input it should reject. And a value resolved through a recursion break was memoized, freezing
whichever node was visited first at its mid-construction value."

**Counts as surfaced (y)** if the review identifies either one: that `if (key in proto) return`
means the first installer wins, so subclasses or derived types (e.g. `exactOptional` over
`optional`) can't override a field; or that caching a value computed while the placeholder is in
place can memoize an incomplete result.
