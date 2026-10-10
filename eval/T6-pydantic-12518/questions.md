# T6: pydantic/pydantic #12518, "Add `polymorphic_serialization` option"

Tangled: a feature spanning Rust (`pydantic-core`) and Python, plus an unrelated coverage-config
change. Merged 2026-02-21. 20 files, +507/−51. About half the source is Rust, which
pr-reviewer's call graph doesn't parse.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What does the new option do?

**Answer:** With `polymorphic_serialization` on, an instance of a subclass of a model or
Pydantic dataclass is serialized as its runtime subclass (its own fields, and its own model
serializer if it has one) instead of as the base type declared in the schema. The default is
`False`, so existing behaviour is unchanged. The motivation: most uses of `serialize_as_any` are
really about respecting subtypes (#12382).

- 2: subclasses serialized as their runtime type, off by default.
- 1: "adds a serialization option" without what it changes.

### Q2. How is it switched on, and which setting wins?

**Answer:** Either in model or dataclass config (`polymorphic_serialization=True`, in
`pydantic/config.py`), or per call with `polymorphic_serialization=` on `model_dump`,
`model_dump_json`, and `TypeAdapter.dump_python` / `dump_json`. The per-call argument overrides
the config, so it can enable or disable the behaviour globally.

- 2: both ways, and that the runtime argument overrides config.
- 1: one way only.

### Q3. How does it work underneath?

**Answer:** In Rust, a new `PolymorphismTrampoline`
(`pydantic-core/src/serializers/polymorphism_trampoline.rs`) wraps a type's serializer. When
serializing, it checks whether the value is a strict subclass (not exactly the class, but an
instance of it) and dispatches to the subclass's `__pydantic_serializer__`; otherwise it uses
the inner serializer. It's a separate wrapper because a model's own serializer may just be a
function serializer that can't handle subclasses itself.

- 2: names the trampoline, the strict-subclass check, and dispatch to the subclass's serializer.
- 1: says "checks the runtime type" without where or how.

### Q4. What does it not cover?

**Answer:** Types pydantic doesn't own a serializer for: a subclass of `int`, stdlib
dataclasses, and `TypedDict` are not serialized polymorphically. An `Annotated[...]` opt-in form
is floated in the description but not implemented.

- 2: names non-pydantic types (at least one example) as unsupported.
- 1: says "only models and dataclasses" without the consequence.

### Q5. Which change doesn't belong to the feature?

**Answer:** In both `pyproject.toml` and `pydantic-core/pyproject.toml`, the coverage config
switches from `exclude_lines` to `exclude_also` and drops the `if TYPE_CHECKING:` exclusion. That
changes which lines count toward coverage and has nothing to do with polymorphic serialization.

- 2: names the coverage-config change as unrelated.
- 1: notes `pyproject.toml` changed without saying it's unrelated.
