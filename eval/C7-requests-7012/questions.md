# C7: psf/requests #7012, "Migrate build system to PEP 517"

Case 7: migrations, config, dependencies. Merged 2026-01-31. 3 files, +79/−111.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What changes at runtime for someone who runs `pip install requests`?

**Answer:** Nothing in the library: no file under `src/requests` changes, the runtime
dependencies are the same (`charset_normalizer`, `idna`, `urllib3`, `certifi` with the same
ranges), and `requires-python` is still `>=3.9`. This is packaging only: project metadata moves
from `setup.py`/`setup.cfg` into `[project]` in `pyproject.toml`, built through PEP 517 with
`setuptools.build_meta` (`setuptools>=61.0`).

- 2: no runtime change, same dependencies, packaging metadata moved to `pyproject.toml`.
- 1: describes the move without saying runtime is unaffected.

### Q2. Who could be affected, and how?

**Answer:** People and distributions building from source: the build now needs a
PEP-517-capable frontend and `setuptools>=61` in the build environment, which matters for
offline builds without build isolation. `python setup.py publish` is gone. Tooling that read
metadata from `setup.py` or `setup.cfg` (deleted) breaks. A new `test` extra appears
(`requests[test]`); test dependencies were previously only `tests_require`.

- 2: at least two groups: source builders/packagers, the removed `publish` shortcut, the
  deleted `setup.cfg`, the new `test` extra.
- 1: one group.

### Q3. How are the version and package list worked out now?

**Answer:** The version is dynamic: `[tool.setuptools.dynamic] version = {attr =
"requests.__version__.__version__"}`. Packages are auto-discovered with
`[tool.setuptools.packages.find] where = ["src"]` instead of the explicit
`packages=["requests"]`. `LICENSE` and `NOTICE` move from `package_data` to `license-files`.
`setup.py` shrinks to a Python-version guard plus `setup()`.

- 2: the dynamic version attribute and the switch to auto-discovery.
- 1: one of them.

### Q4. Which edits aren't part of the build migration itself?

**Answer:** The ruff config adds `UP036` to `ignore` ("Remove once Python 3.10 is the minimum")
because the new version guard in `setup.py` would be flagged as an outdated version block. The
Python-too-old message is also cut to one line and no longer tells users to pin
`requests<2.32.0`.

- 2: names the ruff `UP036` change (with or without the shorter error message).
- 1: names only the shorter error message.

### Q5. Can it be rolled back?

**Answer:** Yes, by reverting the commit: nothing at runtime or in stored data depends on it.
The only lasting effect is on artefacts already published with it, such as an sdist without
`setup.cfg`.

- 2: easy revert, with the reason that it's build-time only.
- 1: says "yes" without why.
