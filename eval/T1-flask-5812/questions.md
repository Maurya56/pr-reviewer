# T1: pallets/flask #5812, "merge app and request context"

Tangled: a core refactor, a behaviour change, and a large docs rewrite in one PR. Merged
2025-09-19. 36 files, +779/−1007 (most of the size is docs; `src/flask/ctx.py` holds the core).

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What is the main change?

**Answer:** `RequestContext` is merged into `AppContext`. There is one context class and one
context variable (`_cv_app`); a "request context" is now an `AppContext` that also carries
request data (`has_request`). `RequestContext` and `flask.globals.request_ctx` remain as
deprecated aliases, to be removed in Flask 4.0.

- 2: one class and one context var, with the request data as an optional part, and the
  deprecated aliases.
- 1: "merges the two contexts" without the consequences for the API.

### Q2. What behaviour changes for users, and who could break?

**Answer:** If an app context is already pushed, it is no longer reused when a request is
dispatched: every request pushes its own context. So code (mostly tests) that wraps test-client
requests in `with app.app_context():` sees two differences: `teardown_appcontext` functions run
when the request ends rather than when the `with` block exits, and data put on `g` before the
request is no longer visible inside it.

- 2: the "no longer reuses a pushed app context" change and at least one consequence (teardown
  timing, or `g` set beforehand).
- 1: says tests may break without why.

### Q3. Which parts of the diff are not behaviour changes?

**Answer:** Most of it: a large docs rewrite (`docs/reqcontext.rst` shrinks by about 240 lines,
`docs/appcontext.rst` is rewritten, many tutorial and pattern pages updated), deduplication in
`ctx.py`, and internals in `app.py`, `helpers.py`, and `templating.py` switching from the
proxies to reading the context variable directly.

- 2: separates the docs rewrite and the mechanical internals switch from the real behaviour
  change.
- 1: notes the docs volume only.

### Q4. How does pushing and popping work now?

**Answer:** A push sets `_cv_app` and keeps the token; a pop resets to that token, restoring the
previous value. There is no longer any tracking of whether an app context was already pushed
when a request context is pushed.

- 2: record the previous context var value on push, restore it on pop, no "already pushed"
  bookkeeping.
- 1: "simplified push/pop" without how.

### Q5. What stays the same for users?

**Answer:** `teardown_request` and `teardown_appcontext` both still exist, as do
`app.app_context()` and `app.test_request_context()`, and the globals `current_app`, `g`,
`request`, and `session` are available in the same situations as before.
`copy_current_request_context` still doesn't copy `g`, on purpose: `g` often holds objects that
aren't safe to share across threads, such as a database session.

- 2: says the public API is unchanged and names the main pieces.
- 1: says "backwards compatible" without specifics.
