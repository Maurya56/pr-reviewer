# T4: axios/axios #11242, "align request handling across runtimes (v1.x)"

Tangled: about six separate fixes bundled together, with roughly 80% of the changed lines in
tests. Merged 2026-09-27, after the model's training cutoff. 31 files, +3183/−63.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What separate areas does this PR change?

**Answer:** It aligns Node (`http.js`) and browser (`fetch.js`) behaviour in about six areas:
1. Body size limits count encoded bytes, and multipart sizes are computed from fields and
   Blob/File sizes before the body is built (new `core/createMultipartBody.js` and
   `helpers/formDataToBlob.js`), honouring a configured `env.Blob`.
2. Data URL size estimates match each adapter's decoding (`estimateDataURLDecodedBytes.js`).
3. Redirect/proxy routing and direct connection agents: the HTTP adapter creates, caches, and
   cleans up direct agents, and rejects unsupported pool or TLS-session lifecycle overrides.
4. Parameter merging is iterative (`mergeConfig.js`) with a new cycle check
   (`core/assertParamsAcyclic.js`).
5. Array-like and numeric form field names serialize differently (`formDataToJSON.js`).
6. Shared test utilities (a bounded child-process runner in `tests/setup`).

- 2: names at least four distinct areas.
- 1: names two or three, or calls it one "consistency fix".

### Q2. What now fails with an error that didn't before?

**Answer:** Circular `params` reject with `ERR_BAD_OPTION_VALUE`; unsupported pool-management
or TLS-session lifecycle overrides reject with `ERR_BAD_OPTION_VALUE` instead of being silently
discarded; generating a multipart boundary requires a cryptographic random source
(`crypto.getRandomValues`), so it fails where there is none.

- 2: at least two of the three.
- 1: one of them.

### Q3. What changes in `lib/core/Axios.js`, and why does it matter to callers?

**Answer:** The shorthand methods (`axios.get`, `axios.post`, ... built in
`Axios.prototype[method]` and `httpMethod`) become `async` functions, so an error thrown while
the request is being set up, such as the new circular-params check, now arrives as a rejected
promise rather than a synchronous throw. Separately, `allowAbsoluteUrls` from the instance
defaults is only honoured when it is an own property of the defaults, not an inherited one.

- 2: the async change and its effect on how errors surface (the `allowAbsoluteUrls` part is a
  bonus).
- 1: notes the methods became async without the consequence, or only the `allowAbsoluteUrls`
  change.

### Q4. Where should a reviewer spend their time?

**Answer:** In the roughly 750 source lines: `lib/adapters/http.js` (direct agents and routing),
`lib/helpers/formDataToBlob.js` and `lib/core/createMultipartBody.js` (multipart sizing and
boundaries), `lib/core/mergeConfig.js` and `lib/core/assertParamsAcyclic.js` (params), and
`lib/adapters/fetch.js`. About 2,650 changed lines are tests (`formBodyLengthCases.js` alone is
540, `directAgent.test.js` 457) and can be skimmed.

- 2: points at the adapter, multipart, and params source files and says the bulk is tests.
- 1: one of the two.

### Q5. What does the PR say stays the same?

**Answer:** Public type signatures are unchanged; uploads keep their routing, contents, explicit
multipart boundaries, and progress behaviour; string-keyed params and config merges remain
supported without symbol-reflection APIs.

- 2: unchanged public types plus one of the upload or params guarantees.
- 1: "no breaking changes" without specifics.
