# T2: encode/httpx #3319, "Introduce new `SSLContext` API & escalate deprecations"

Tangled: a new API, deprecations escalated to removals, a quiet behaviour change, and cleanup in
one PR. Merged 2024-10-28. 29 files, +533/−947.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What is the new API?

**Answer:** `httpx.SSLContext`, a subclass of `ssl.SSLContext` that verifies against `certifi`
by default and takes `verify=True/False`, plus a new `ssl_context=` parameter on the clients,
transports, and top-level functions. It replaces passing `verify=` and `cert=`.

- 2: names `httpx.SSLContext` and the `ssl_context=` parameter replacing `verify`/`cert`.
- 1: "new SSL configuration API" without names.

### Q2. What is deprecated, and what is removed outright?

**Answer:** Deprecated (still works, now warns): `verify=` and `cert=`; they're routed through
`create_ssl_context()`, which emits a warning per form (`verify=<bool>`, `<str>`,
`<ssl context>`, `cert=...`). Removed: the `proxies=` argument (use `proxy=` or mounts), the
`app=` argument (use `transport=WSGITransport(app=...)` / `ASGITransport`), and the `URL.raw`
property.

- 2: separates warn-only (`verify`, `cert`) from removed (`proxies`, `app`, `URL.raw`).
- 1: lists some without the deprecated vs removed distinction.

### Q3. Which behaviour change is easy to miss?

**Answer:** The `SSL_CERT_FILE` and `SSL_CERT_DIR` environment variables are no longer honoured:
`get_ca_bundle_from_env()` is deleted from `_utils.py` and its docs section is removed, so the
CA bundle comes from `certifi` unless code passes one explicitly. (`SSLKEYLOGFILE` is still
supported, in `SSLContext.__init__`.)

- 2: names the dropped `SSL_CERT_FILE` / `SSL_CERT_DIR` support.
- 1: notes environment-variable docs were removed without the consequence.

### Q4. Which parts of the diff are cleanup rather than behaviour?

**Answer:** `httpx/_compat.py` is deleted and its optional `brotli`/`zstd` imports move into
`_decoders.py` (with `brotli` now tried before `brotlicffi`); tests for the removed features are
deleted (`test_proxies.py`, `test_utils.py`, `test_url.py`, ...); `docs/advanced/ssl.md` is
rewritten; the version becomes 0.28.0.

- 2: identifies the `_compat.py` removal and test or doc cleanup as non-behavioural.
- 1: mentions cleanup vaguely.

### Q5. Whose code breaks or changes on upgrade?

**Answer:** Code passing `proxies=` or `app=` now gets a `TypeError`; code reading `URL.raw`
breaks; deployments that relied on `SSL_CERT_FILE`/`SSL_CERT_DIR` silently switch to `certifi`'s
bundle (a likely TLS failure behind a corporate proxy); code passing `verify=`/`cert=` keeps
working but warns.

- 2: at least three of these four groups, including one hard break.
- 1: one or two groups.
