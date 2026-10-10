# C10: colinhacks/zod #6085, "z.compile — ahead-of-time schema compilation"

Case 10: a lot of new code. Merged 2026-08-17, after the model's training cutoff. 54 files,
+8818/−24: a new subsystem of about 2,000 lines plus tests, benchmarks, a fuzzer, and docs.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What is this, and how do users turn it on?

**Answer:** An ahead-of-time compiler that turns a schema into a generated JavaScript fast path
for parsing. There are two entry points that don't overlap: `z.compile(schema)` returns a
**cloned** schema with the compiled fast path (the original is untouched, and schemas derived
from the clone don't inherit it); `import "zod/compile"` (global mode, `packages/zod/src/compile.ts`)
installs a post-processor that compiles each new schema lazily on its first parse.

- 2: both entry points, with the clone vs global distinction.
- 1: "adds schema compilation for speed" without the entry points.

### Q2. What happens when input is invalid?

**Answer:** The compiled code only handles the happy path: it returns the parsed output or an
`INVALID` sentinel (a symbol in `core/compile.ts`). On `INVALID`, the wrapper re-runs the normal
interpreter to produce the real `ZodError`, so error messages match exactly by construction, with
no second error-path code generator. The cost: user `.refine` / `.transform` callbacks can run
twice on invalid input.

- 2: the sentinel-then-interpreter fallback, and the callbacks-twice consequence.
- 1: says errors fall back to the normal parser without the consequence.

### Q3. What can't it compile, and what happens then?

**Answer:** Anything it can't model exactly throws `ZodCompileUnsupportedError` when the code is
generated, rather than silently producing a wrong fast path. Containers "island" an unsupported
child (that child runs in the interpreter), but unions and discriminated unions deliberately
don't, because a wrongly rejecting compiled branch would change which option matches. It's
forward direction only, with no async. Recursive schemas and `z.xor` fall back to the
interpreter (1.00×).

- 2: the explicit unsupported error plus either the island rule (and why unions don't) or the
  scope limits.
- 1: one detail.

### Q4. Map the new code: where is the real logic, and what can a reviewer skim?

**Answer:** The compiler is `packages/zod/src/v4/core/compile.ts` (about 2,000 lines). The one
always-on change is a `postProcessor` hook in `$constructor` (`core/core.ts`), paid even without
`zod/compile` (+21-25 bytes gzipped on mini). Tests: `compile.test.ts` (about 1,500 lines) and a
differential harness (`compile-differential.test.ts`, `vitest.compile.config.ts`) that re-runs
the whole v4 test corpus with global compile on. About 3,300 lines are benchmarks under
`packages/bench/` plus `scripts/compile-fuzz.ts`, and there are docs and wiki pages. Those are
skimmable.

- 2: names `compile.ts`, the always-on hook, and that benchmarks, fuzz, and docs make up much of
  the size.
- 1: names `compile.ts` only.

### Q5. Is anything risky for environments that forbid `eval`-like code?

**Answer:** Global mode checks `globalConfig.jitless` and does nothing when it's set, so
`import "zod/compile"` is inert under a strict Content Security Policy. An explicit
`z.compile()` call does **not** check `jitless` (the code comment calls it "an explicit
opt-in"), so it still uses `new Function` and would fail under such a policy.

- 2: the jitless check in global mode **and** that explicit `z.compile` ignores it.
- 1: only that global mode respects jitless.
