# C6: pydantic/pydantic #13438, "Make model rebuilding logic thread safe"

Case 6: concurrency. Merged 2026-07-16, after the model's training cutoff. 3 files, +138/−30.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What race does this fix?

**Answer:** When several threads first instantiate (or validate with) a model that isn't
complete yet (for example one with forward references), each can trigger `model_rebuild()` at
the same time. A rebuild mutates class attributes (`__pydantic_core_schema__`,
`__pydantic_validator__`, `__pydantic_serializer__`) while other threads read them, so a thread
can end up using the parent class's validator or schema. It fixes #13419.

- 2: concurrent rebuilds of an incomplete model, with class attributes changing under readers.
- 1: "thread-safety fix" without what races.

### Q2. How are rebuilds serialized?

**Answer:** A module-level `threading.RLock`, `_rebuild_lock` in `pydantic/main.py`, wraps the
body of `BaseModel.model_rebuild()`. The method checks `__pydantic_complete__` before taking the
lock (so complete models don't touch the global lock) and checks again inside it, because
another thread may have finished the rebuild while this one waited.

- 2: the global lock and the check, lock, check-again pattern with its reason.
- 1: "adds a lock" without the double check.

### Q3. Why one global, reentrant lock instead of a lock per model?

**Answer:** Reentrant because rebuilding one model can trigger rebuilding another (e.g. a
generic origin rebuilt during parametrization in `__class_getitem__()`), on the same thread.
Global because per-class locks could deadlock: two threads each holding their own class's lock
and waiting for the other's. The cost: all rebuilds in the process are serialized.

- 2: both reasons (re-entry and the deadlock), or one reason plus the serialization cost.
- 1: one reason only.

### Q4. Why does the `MockCoreSchema` check matter?

**Answer:** During a rebuild the class's own schema, validator, and serializer attributes are
deleted so they're regenerated, but only when they aren't placeholder mocks. Now
`MockCoreSchema` is treated like `MockValSer`. Deleting a mock would let a concurrent reader,
which doesn't hold the lock (readers never do), resolve the attribute from the **parent** class
via the MRO. The same check is applied in `rebuild_dataclass()`.

- 2: mocks aren't deleted, so lock-free readers don't fall through to the parent class.
- 1: "also checks MockCoreSchema" without why.

### Q5. What isn't covered by the lock?

**Answer:** `rebuild_dataclass()` in `pydantic/dataclasses.py` gets the mock check but does not
take `_rebuild_lock`, so Pydantic dataclass rebuilds are still not serialized. And only
rebuilders take the lock; readers (validation, serialization) rely on the attributes never being
missing rather than on locking.

- 2: notes that `rebuild_dataclass()` isn't locked.
- 1: notes only that readers don't lock.
