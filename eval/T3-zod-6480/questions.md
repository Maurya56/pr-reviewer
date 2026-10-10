# T3: colinhacks/zod #6480, "validate without building the output, and keep schemas out of dictionary mode"

Tangled: six separate concerns (a rename, a codegen flag, an inlining split, a V8 object-shape
fix with small behaviour changes, eager compilation, and a vocabulary cleanup). Merged
2026-08-28, after the model's training cutoff. 21 files, +633/−202.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What are the separate changes in this PR?

**Answer:**
1. Rename: `z.isValid` / `z.isValidAsync` become `z.validate` / `z.validateAsync` (never
   released, so no deprecation).
2. An `assertOnly` codegen flag: `compileFn(schema, { assertOnly: true })` emits the same checks
   without building the output.
3. `validate` was too big for V8 to inline; everything off the compiled happy path moves into
   `validateFallback`.
4. Object schemas after the first were in V8 dictionary mode because `shape` was a per-instance
   accessor (`defineLazy`); it now uses `installLazyProp`, an accessor on the prototype that
   caches a data property per instance.
5. `compile()` builds the parser and the validator up front instead of lazily.
6. Vocabulary: `fastpass` becomes `compileFn` (`CompiledFn`, `CompileFnOptions`), `skipValue`
   becomes `buildsValue`.

- 2: identifies at least four of the six as distinct changes.
- 1: identifies two or three, or describes it as one performance change.

### Q2. In assert-only mode, when does a node skip building its value?

**Answer:** Only when its value is unread **and** it has no checks of its own (a check reads
what was built). Only object, array, optional, and nullable propagate the flag; transforms and
pipes always build their output (the second half of a pipe validates it); a `defaulted` optional
still builds; tuples and records are deliberately left out.

- 2: the "unread and no checks" rule, plus which node types participate or are excluded.
- 1: "skips building values it doesn't need" without the rule.

### Q3. Which user-visible behaviours change because of the `shape` fix?

**Answer:** `delete schema.shape` now clears the cached value and the next read recomputes it,
instead of removing the property for good; assigning `schema.shape` a second time no longer
throws in strict mode (the cached property is writable); `hasOwnProperty("shape")` is false
until the first read. A self-referential shape still breaks its cycle: a re-entrant read now
gets `undefined` from a placeholder data property.

- 2: names at least two of the delete, reassign, and hasOwnProperty changes.
- 1: says the shape change is internal-only, or names one.

### Q4. What is the trade-off in compiling both variants up front?

**Answer:** About 20 µs of extra code generation per schema (+61% to +74% on the construction
walk), paid by every `compile()` and, in global mode, by every schema's first parse, even if the
validator is never called. The author takes it for determinism: the lazy trampoline had to know
which object it wrote to, and getting that wrong under global mode silently lost the fast path
(correct answers, several times slower, tests still green).

- 2: names the construction cost and the reason (the silent fast-path loss with the lazy version).
- 1: names one of them.

### Q5. Which parts are pure renames that don't change behaviour?

**Answer:** `isValid` to `validate` (an unreleased API), `fastpass` to `compileFn` (and
`CompiledFn`, `CompileFnOptions`), and `skipValue` to `buildsValue` (a polarity inversion).
Generated code is byte-identical across fourteen shapes in both modes.

- 2: names the renames and that generated code is unchanged.
- 1: names some renames only.
