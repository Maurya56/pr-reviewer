# C12: fmtlib/fmt #4910, "support fill, alignment and width in range and tuple formatters"

Case 12: an unfamiliar codebase or language (template-heavy C++). Merged 2026-09-06, after the
model's training cutoff. 3 files, +129/−7.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What does it let users do that they couldn't before?

**Answer:** Pad ranges, tuples, pairs, and maps as a whole: `fmt::format("{:*>20}",
std::vector<int>{1, 2, 3})` now gives `"***********[1, 2, 3]"` instead of failing with "invalid
format specifier". This matches C++23 `std::format`, where range and tuple format specs begin
with fill, alignment, and width.

- 2: fill, align, and width on composed output for ranges/tuples/maps, with the std::format
  alignment.
- 1: "adds width support" without what it applies to.

### Q2. Orientation: where does this code sit in fmt, and how is a formatter structured?

**Answer:** `include/fmt/ranges.h` holds the `formatter` specializations for tuple-like types,
`range_formatter` (sequences and sets), and the map formatter. Each has a `parse()` that reads
the format spec (constexpr, at compile time where possible) and a `format()` that writes output.
The PR adds one shared helper, `detail::composed_specs`, used by all three, and updates the
grammar in `doc/syntax.md`.

- 2: the three formatter kinds in `ranges.h`, the parse/format split, and the shared helper.
- 1: names the file only.

### Q3. How does the padding work?

**Answer:** `composed_specs::parse` reads fill/alignment and width **before** the formatter's
own options (`n`, `s`, `?`), and stops at a leading `:` so `{::>5}` still means "spec for each
element", as in `std::format`. In `format()`, `composed_.resolve(ctx)` resolves a dynamic width
(`{:*>{}}`). If the width is 0 it writes directly; otherwise it formats into a
`basic_memory_buffer` through a nested context and writes that buffer padded with
`detail::write`, the same buffer-then-pad approach `nested_formatter` and #4860 use.

- 2: parse order (before `n`/`s`/`?`, leading `:` excluded) and buffer-then-pad.
- 1: one of the two.

### Q4. What stays exactly the same?

**Answer:** Each formatter's old `format()` body moves unchanged into a new `write_body()`, and
`format()` becomes a wrapper that calls it directly when no width is given. So output without a
width is the same code path as before, and no existing test expectation is edited. A width only
costs a buffer when it's used.

- 2: the unchanged `write_body` and the width-0 path.
- 1: "backwards compatible" without why.

### Q5. Where does fmt still differ from `std::format` here?

**Answer:** `fmt::format("{:n}", std::pair<int, int>{1, 2})` gives `12`, where `std::format`
gives `1, 2`: fmt drops the separator along with the brackets for tuples, but keeps it for
ranges. That's pre-existing and deliberately left alone, because fixing it would change existing
test expectations (`test/ranges-test.cc`). The author checked 22 cases against libc++ and 21
matched.

- 2: the `{:n}` pair separator divergence, and that it's pre-existing and out of scope.
- 1: says there are known differences without which.
