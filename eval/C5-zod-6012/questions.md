# C5: colinhacks/zod #6012, "drop dead code in core and fix a stale deprecation message"

Case 5: deleting code. Merged 2026-08-24, after the model's training cutoff. 3 files, +1/−17.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What does the PR remove or change?

**Answer:** Three cleanups: it deletes `packages/zod/src/v4/core/config.ts`; it removes a
duplicate `...util.normalizeParams(_params)` spread from `_stringFormat` in `core/api.ts`; and
it fixes the `ZodFirstPartySchemaTypes` deprecation in `classic/compat.ts`, which pointed at a
non-existent `$$ZodFirstPartyTypes` and now names `$ZodTypes`.

- 2: all three.
- 1: one or two.

### Q2. Was the deleted file really unused?

**Answer:** Yes. Nothing imports `core/config.ts`, and it wasn't compiled into the build. The
names it exported, `config` and `globalConfig`, are still used widely, but they come from
`core/core.ts`, which holds the live versions backed by a `globalThis.__zod_globalConfig`
singleton that keeps config shared between the CommonJS and ESM builds.

- 2: confirms no imports of the file **and** explains that the same names live on in `core.ts`
  (not mistaking those uses for references to the deleted file).
- 1: says it's unused without checking, or flags the remaining `config` references as a problem.

### Q3. Does the `_stringFormat` change alter behaviour?

**Answer:** No. The def was `{ ...params, check, type, format, fn, ...params }`; the trailing
`...params` already overrode the internal keys, so dropping the leading spread leaves the final
values the same (only key insertion order and one redundant `normalizeParams` call change). It
now matches `_email`, `_uuid`, and `_url`.

- 2: no behaviour change, because the trailing spread already wins.
- 1: says it's a cleanup without reasoning about the result, or claims a behaviour change.

### Q4. What does the deprecation fix change for users?

**Answer:** Only the `@deprecated` message: editors now point users of `ZodFirstPartySchemaTypes`
at `z.core.$ZodTypes`, which exists. The type itself is unchanged.

- 2: message-only, type unchanged.
- 1: mentions the deprecation edit without saying it's message-only.
