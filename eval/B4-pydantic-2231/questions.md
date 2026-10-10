# B4: pydantic/pydantic #2231, "Add exclude as field parameter"

Known-buggy. Fixed by [#3201](https://github.com/pydantic/pydantic/pull/3201). Merged 2021-05-01,
**before** the model's training cutoff: the model may remember this bug, so weigh bug-finding
here less than on B1 and B2. 14 files, +609/−164.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What does this PR add?

**Answer:** `exclude` and `include` as field-level settings, through `Field(exclude=...,
include=...)` or the model `Config` `fields` setting, so a field can be left out of (or limited
in) `.dict()` / `.json()` output by default instead of only at export time. Closes #660.

- 2: field-level / config-level include and exclude that apply by default on export.
- 1: "adds an exclude option" without saying it's per field and applied by default.

### Q2. How do field-level settings combine with the `include`/`exclude` passed to `.dict()`?

**Answer:** The metaclass collects them into `__exclude_fields__` and `__include_fields__`, and
`_iter()` merges them with the call's arguments through `ValueItems.merge`: excludes are unioned
(the explicit argument overrides), includes are intersected.

- 2: collected per class, merged in `_iter`, union for exclude and intersection for include.
- 1: "they're merged" without how.

### Q3. Which part of the diff is a refactor rather than the feature?

**Answer:** `pydantic/utils.py`: `update_normalized_all` is removed and the include/exclude
normalising and merging logic moves into `ValueItems` (`merge`, `is_true`, ...).
`_calculate_keys` now only takes mappings, because inputs are normalised before reaching it.

- 2: names the `ValueItems` consolidation and the removed helper.
- 1: says utils was refactored without what.

### Q4. Which behaviour changes for code that doesn't use the new option?

**Answer:** `_iter()` (behind `.dict()`, `.json()`, `.copy()`, iteration) always merges the
class-level settings now, and include/exclude handling switched from truthiness checks
(`if exclude`) to `is not None` checks, so an empty set or dict passed explicitly is now treated
as given rather than ignored.

- 2: notes `_iter` now always applies class-level settings, or the empty-container change.
- 1: says behaviour is unchanged without checking.

## Known bug

`BaseModel.validate()` returns `value.copy()` when `Config.copy_on_model_validation` is `True`
(the default), which happens whenever a model instance is assigned to a field of another model.
`copy()` builds the new model's values with `self._iter(...)`, and `_iter()` now always merges
in `__exclude_fields__`. So the copy silently loses every field marked `exclude`: a nested model
with `password: str = Field(..., exclude=True)` comes out of validation without `password`.

From the fix commit (5ad73d03, #3201): "Small regression in #2231. The shallow copy done with
`Config.copy_on_model_validation = True` (default behaviour) was using excluded / included fields
when it should just copy everything."

**Counts as surfaced (y)** if the review says that `copy()` (or validation of a nested model,
or anything else built on `_iter`) now drops or limits fields because the class-level
exclude/include is applied, rather than only affecting `.dict()` / `.json()` output.
