<!-- pr-reviewer -->
## In short

Axios added a fetch-based HTTP adapter alongside the existing XHR and Node.js http adapters. This lets browsers use the modern fetch API instead of XMLHttpRequest, bringing request streaming with upload progress and better stream handling. Safe to merge once the throttle invocation issue and missing null check are fixed.

## The big picture

The PR adds native fetch API support to axios as a third adapter choice. Axios already has two adapters: XMLHttpRequest for browsers and http/https for Node.js. The new fetch adapter runs in browsers that support fetch and enables features XHR cannot handle well, like streaming request bodies with upload progress tracking.

The PR makes five changes: 1) adds the fetch adapter implementation with stream tracking and signal composition, 2) extracts shared config-building logic from XHR into a reusable helper, 3) refactors XHR to use that helper, 4) adds the fetch adapter to the defaults so axios tries it automatically, and 5) updates progress event formatting for consistency. The first four change behaviour; the fifth is mechanical cleanup.

Before and after:
```text
Old flow:
  axios(config) → adapter selection → xhr or http → XMLHttpRequest or http.request

New flow:
  axios(config) → adapter selection → xhr, http, or fetch → one of three implementations
                                          ↓
                                       fetch API (new)
```

## 1. The fetch adapter

This adds `lib/adapters/fetch.js`, a 197-line adapter that uses the browser's fetch API. The adapter lets axios work with modern APIs that return ReadableStream or accept streaming uploads, and handles upload progress for POST/PUT/PATCH requests.

Before this PR, axios in browsers always used XMLHttpRequest. If you passed `onUploadProgress` with a streamed request body, XHR couldn't track the upload because it buffers the whole body before sending. The new fetch adapter wraps the request body in a ReadableStream that counts bytes as they flow, calling `onUploadProgress` with the current count, rate, and estimated time remaining.

Walk through a POST with upload progress: `axios.post(url, bigFile, {onUploadProgress: fn})` calls `resolveConfig` to normalize the config (lib/helpers/resolveConfig.js, details in section 2), then checks if upload progress is needed (line 109). If `onUploadProgress` is set, the method is not GET or HEAD, and the browser supports request streams (`supportsRequestStreams`, tested at line 22 by checking if a Request with a ReadableStream body and `duplex: 'half'` actually accesses the duplex property), the adapter calculates the body length (line 110, `resolveBodyLength`), wraps the request body in `trackStream` (line 124, section 3), and creates the fetch Request. The `trackStream` wrapper is a ReadableStream that reads from the original body in 64 KB chunks, accumulates the byte count, and calls `progressEventReducer(onUploadProgress)` with each chunk (line 126). The reducer throttles the callback to 3 per second and formats the event with `loaded`, `total`, `progress`, `rate`, and `estimated` fields.

After the fetch completes (line 144), download progress works the same way but in reverse: if `onDownloadProgress` is set or the response type is `stream`, the adapter wraps `response.body` in `trackStream` (line 157), which calls the reducer as bytes are read. For non-stream responses, the adapter reads the body to completion using the response type resolver (line 168: `resolvers['text']` calls `res.text()`, `resolvers['json']` calls `res.json()`, etc.), calls `onFinish` to clean up the abort signal (line 170), and settles the promise with the response data.

Cancellation and timeout: `composeSignals` (line 95, section 4) combines `config.signal`, `config.cancelToken`, and `config.timeout` into a single AbortSignal that fetch understands. If the user aborts the signal or the timeout fires, `composedSignal` aborts, fetch throws, the catch block (line 184) maps the error to AxiosError, and the promise rejects.

Edge cases: If fetch is not supported (`typeof fetch === 'undefined'`), the adapter export is undefined and axios falls through to XHR. If the browser does not support request streams (Safari older than 15.4), upload progress is skipped (line 109 condition fails) and the body goes straight to fetch. If the response type is not recognized, the adapter defaults to `'text'` (line 168). If `withCredentials` is not a string, the adapter maps boolean to `'cors'` or `'omit'` (line 130), because fetch's `credentials` option expects strings, not booleans.

The design choice: use fetch instead of XHR because fetch supports streams natively and works with modern web platform APIs like service workers and the Streams API. The trade-off is that fetch does not report upload progress directly; the adapter wraps the request body to track it manually, which adds a layer of indirection and only works in browsers that support `duplex: 'half'` (Chrome 105+, Safari 15.4+, Firefox never implemented it as of 2025).

Separately, the adapter adds a `fetchOptions` config field (line 90, TypeScript definitions updated in index.d.ts and index.d.cts) so users can pass extra options like `keepalive` or `priority` directly to fetch.

## 2. Extracting resolveConfig

The XHR adapter had 70 lines of config preparation: building the full URL, handling basic auth, setting Content-Type for FormData, and adding XSRF headers. The fetch adapter needs the same logic. This PR extracts it into `lib/helpers/resolveConfig.js` (57 lines), which both adapters now call.

Before: XHR built the URL inline (line 85 in the old XHR code: `request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true)`), checked `config.auth` and set the Authorization header (old lines 77-81), handled FormData Content-Type (old lines 64-72), and added XSRF headers in standard browser environments (old lines 176-186).

After: `resolveConfig` does all of that once and returns a new config object with `url` fully built, `headers` normalized as an AxiosHeaders instance, and auth and XSRF headers already set. XHR calls it at line 18 and uses `_config.url`, `_config.headers`, etc. Fetch calls it at line 91. The duplication is gone, and both adapters handle auth, FormData, and XSRF identically.

One difference: `resolveConfig` sets `headers.setContentType(undefined)` for FormData in standard environments (line 30), while the old XHR code used `false`. `undefined` and `false` both delete the header, so behaviour is unchanged.

## 3. Stream tracking

`lib/helpers/trackStream.js` exports `trackStream(stream, chunkSize, onProgress, onFinish)`, which wraps a ReadableStream and calls `onProgress(bytesRead)` as data flows through. The fetch adapter uses it for both upload and download progress.

How it works: `trackStream` creates a new ReadableStream with type `'bytes'` (line 34). The stream's `pull` method (line 36) reads chunks from the original stream via `readBytes`, an async generator that converts each chunk to an ArrayBuffer view (line 22, using TextEncoder if the chunk is a string), splits it into `chunkSize` pieces (line 2, `streamChunk`), and yields each piece. For each yielded chunk, `pull` increments `bytes` by the chunk length (line 46), calls `onProgress(bytes)`, and enqueues the chunk to the output stream (line 47). When the input stream is done, `pull` closes the output and calls `onFinish` (line 40). If the stream is cancelled (user aborts), the `cancel` method (line 49) calls `onFinish(reason)` and returns `iterator.return()` to clean up the generator.

The fetch adapter passes `fetchProgressDecorator(total, progressEventReducer(listener))` as `onProgress` (lib/adapters/fetch.js:124). `fetchProgressDecorator` (line 11) returns a function that takes `loaded` and calls the reducer with `{loaded, total, lengthComputable}`, wrapped in `setTimeout` to break out of the stream's microtask and let the event loop run. `progressEventReducer` (section 5) throttles the calls and adds rate and estimate.

## 4. Signal composition

`lib/helpers/composeSignals.js` merges axios's two cancellation mechanisms (CancelToken and AbortSignal) and timeout into a single AbortSignal that fetch accepts. Old code: XHR subscribed to both `config.cancelToken` and `config.signal` separately (old xhr.js lines 241-247) and had a separate `ontimeout` handler. New code: the fetch adapter passes both to `composeSignals` along with the timeout (lib/adapters/fetch.js:95), gets back one signal, and passes it to fetch.

Walk through cancellation: `composeSignals([signal, cancelToken], timeout)` creates an AbortController (line 5), defines `onabort` (line 9), which aborts the controller with a CanceledError and calls `unsubscribe`, sets a timeout timer if `timeout` is provided (line 18), and subscribes `onabort` to every input signal's abort event (line 34). When any input signal fires (user calls `cancel()` on the CancelToken, calls `abort()` on the AbortSignal, or the timeout expires), `onabort` runs once (guarded by the `aborted` flag, line 10), aborts the composed signal, and cleans up listeners. The composed signal has an `unsubscribe` method (line 38) that the fetch adapter calls in `onFinish` (lib/adapters/fetch.js:102) to remove listeners after the request completes.

The `unsubscribe` method handles both AbortSignal (which has `removeEventListener`) and CancelToken (which has `unsubscribe`), checking which method exists (line 28). The return value is a tuple `[signal, stopTimeout]` (line 40); `stopTimeout` clears the timeout timer early if the request finishes before the timeout (lib/adapters/fetch.js:172).

## 5. Progress event format

The PR extracts `progressEventReducer` from XHR (old xhr.js lines 17-42) into `lib/helpers/progressEventReducer.js` and adds two fields: `lengthComputable` (line 25) and throttling via `throttle(fn, freq)` (line 8). XHR now imports and calls it (lib/adapters/xhr.js:236, 240) instead of defining it inline. The Node.js stream adapter (`lib/helpers/AxiosTransformStream.js`) also emits progress events; the PR updates it to include `lengthComputable` (line 75).

Before: the XHR inline version returned a function that called the listener directly on every progress event. The listener got `{loaded, total, progress, bytes, rate, estimated, event, upload|download: true}`. `lengthComputable` was not included, even though `e.lengthComputable` is part of the ProgressEvent spec.

After: `progressEventReducer` returns `throttle(fn, freq)` where `fn` is the same event-building function and `freq` defaults to 3 (line 4), limiting progress callbacks to 3 per second. The event object now includes `lengthComputable: total != null` (line 25). The fetch adapter and XHR both call it the same way: `progressEventReducer(onUploadProgress)` or `progressEventReducer(onDownloadProgress, true)`.

The throttle change: `throttle` now checks `this === true` to force an immediate call (lib/helpers/throttle.js:14), and `AxiosTransformStream.onFinish` uses `internals.updateProgress.call(true)` to flush the final progress event (lib/helpers/AxiosTransformStream.js:81). This ensures the 100% progress event fires even if it lands within the throttle window. The old `throttle(force, args)` signature is gone; the new one uses `this` as the force flag and `arguments` for the event, because the fetch decorator calls the throttled function with one argument (the event) and no way to pass a force boolean separately.

## 6. XHR refactor and minor fixes

The XHR adapter (lib/adapters/xhr.js) drops 70 lines by calling `resolveConfig` (line 18) instead of building the URL, handling auth, FormData, and XSRF inline. The refactored code replaces `config` with `_config` throughout (the resolved config), so references like `config.timeout` become `_config.timeout`.

One behaviour change: `parseProtocol(_config.url)` at line 179 now parses the fully resolved URL instead of `fullPath`, which was `buildFullPath(config.baseURL, config.url)` but without query params. Since `_config.url` includes params, the protocol check now runs on the complete URL. For normal URLs this makes no difference, but if `config.params` somehow changed the protocol (impossible with standard serializers), the check would catch it.

The PR also fixes `toFiniteNumber` in lib/utils.js (line 602): old code converted `value` to a number and checked `isFinite`, but did not short-circuit if `value` was `null` or `undefined`, so `+null` became `0` and `isFinite(0)` returned true, making `toFiniteNumber(null, 100)` return `0` instead of `100`. The new version checks `value != null` first, so `null` and `undefined` return the default.

The defaults (lib/defaults/index.js) add `'fetch'` to the adapter array (line 40) and add two checks in `transformResponse`: return early if data is a Response or ReadableStream (line 105), because JSON.parse on those types throws. The old code would try to JSON-parse a Response object if `responseType` was `'json'`, which would fail. Now fetch's `'response'` type returns the Response object unchanged, and `'stream'` returns the ReadableStream body unchanged.

Minor: AxiosHeaders.set (lib/core/AxiosHeaders.js:103) now handles native Headers objects (from fetch) by iterating `header.entries()` and setting each key-value pair. The rollup config (rollup.config.js) adds `@rollup/plugin-alias` and an `alias` parameter to `buildConfig` (line 17), with a commented-out bundle that would exclude XHR and ship fetch-only (lines 79-90). The package.json adds the alias plugin to devDependencies. The CI workflow (`.github/workflows/ci.yml`) adds Node.js 21 to the matrix and sets `fail-fast: false` so one failure does not cancel the others. TypeScript definitions add `'formdata'` as a response type (index.d.ts:212, index.d.cts:270) and `fetchOptions` to the request config (index.d.ts:361, index.d.cts:420).

## Tests

The PR adds `test/unit/adapters/fetch.js` (373 lines, 22 tests) covering response types (text, arrayBuffer, blob, stream, formData, json), upload progress, download progress, basic auth, streaming request bodies, request and response abortion, timeout, baseURL, and params. Each test uses a local HTTP server (started in beforeEach, stopped in afterEach via `test/helpers/server.js`, which the PR also adds). The tests prove:

- Response types: the adapter calls the correct Response method (`res.text()`, `res.arrayBuffer()`, etc.) for each `responseType` and returns the data (lines 22-96).
- Upload progress: with a 1 MB readable stream as the body, `onUploadProgress` is called multiple times with increasing `loaded`, and the final call has `loaded === total` (lines 107-154). The test checks that `data.upload === true`, `data.rate` is a number, and `data.lengthComputable === true`.
- Download progress: `onDownloadProgress` behaves the same way, with `data.download === true` (lines 163-198).
- Basic auth: the Authorization header is set to `'Basic ' + btoa('user:pass')` (lines 200-214).
- Request abortion: calling `controller.abort()` before the response completes rejects with a CanceledError, and the server still receives the request (lines 233-255).
- Response abortion: aborting while reading the response body rejects with a CanceledError (lines 257-277).
- Timeout: a request with `timeout: 100` and a slow server (1 second response) rejects with `ETIMEDOUT` (lines 279-297).

What is not tested: the `supportsRequestStreams` feature detection (no test for Safari or browsers without duplex support), the fallback to XHR when fetch is unavailable (the tests run in Node.js 18+, which has fetch), the `fetchOptions` config, error mapping when `err.name === 'NetworkError'` (lib/adapters/fetch.js:189), and the XSRF header logic (inherited from `resolveConfig`, tested elsewhere).

## Where to look

1. `lib/adapters/fetch.js` - the fetch adapter: how it wraps streams for progress tracking, composes signals, and resolves response types. Pay attention to the upload progress condition (line 109) and the stream wrapping (lines 124, 157).
2. `lib/helpers/trackStream.js` - the stream wrapper: how `pull` counts bytes and calls onProgress, and how `cancel` cleans up.
3. `lib/helpers/composeSignals.js` - signal merging: how it handles CancelToken, AbortSignal, and timeout in one place, and the `unsubscribe` cleanup.
4. `lib/helpers/resolveConfig.js` - extracted config logic: URL building, auth, FormData, XSRF, now shared by XHR and fetch.
5. `lib/helpers/progressEventReducer.js` - progress event builder: the throttle wrapper and the lengthComputable field.
6. `lib/adapters/xhr.js` - refactored XHR: how it uses resolveConfig and the new progressEventReducer.
7. `lib/helpers/throttle.js` - throttle fix: the `this === true` force mechanism.
8. `lib/utils.js` - toFiniteNumber fix (line 602) and new type checks (isReadableStream, isRequest, isResponse, isHeaders).
9. `lib/defaults/index.js` - adapter list and transformResponse guards.
10. `lib/core/AxiosHeaders.js` - Headers object support in the set method.
11. `test/unit/adapters/fetch.js` - test coverage for the fetch adapter.
12. `test/helpers/server.js` - HTTP server helpers for tests.

You can skip the TypeScript definitions (index.d.ts, index.d.cts), CI config changes (.github/workflows/ci.yml), package.json, rollup config, platform utils (lib/platform/common/utils.js just adds `origin` for the feature detection), and lib/adapters/adapters.js (one-line addition to the known adapters map).

## What I'd double-check

- In `lib/helpers/AxiosTransformStream.js:81`, `internals.updateProgress.call(true)` forces the throttled function to run immediately by setting `this` to `true`. The throttle function checks `this === true` at line 14 of lib/helpers/throttle.js. But `progressEventReducer` calls `throttle(e => {...}, freq)` and returns the throttled function (lib/helpers/progressEventReducer.js:8). When AxiosTransformStream calls `internals.updateProgress.call(true)`, `internals.updateProgress` is the throttled function, which calls `fn.apply(null, arguments)` at throttle.js:23. This passes `this = null` to the inner function `e => {...}`, not `this = true`. So the `this === true` check only works if the caller of the throttled function uses `.call(true)`, but the throttled function itself discards `this` when it calls `fn`. Does the force mechanism actually work here, or does the final progress event get throttled?

- The fetch adapter sets `withCredentials` to `'same-origin'` by default (lib/adapters/fetch.js:89), then maps booleans to `'cors'` or `'omit'` (line 131). But fetch's `credentials` option is separate from `withCredentials`; the Request constructor at line 134 passes `withCredentials` as an option. Is `withCredentials` the correct option name for fetch, or should it be `credentials`? The Request interface does not have a `withCredentials` property; it has `credentials`. If `withCredentials` is passed to the Request constructor, it gets ignored, and credentials default to `'same-origin'`. Does this break CORS requests that need `credentials: 'include'`?

## Problems

- `lib/helpers/trackStream.js:41` - `onFinish()` is called unconditionally when the stream ends, but `onFinish` is optional (passed as the fourth argument, line 28). If the caller does not provide `onFinish` (like the upload progress case: lib/adapters/fetch.js:124 passes only three arguments), this calls `undefined()` and throws "onFinish is not a function". Proof: `trackStream(response.body, DEFAULT_CHUNK_SIZE, fetchProgressDecorator(...))` at line 158 passes `onFinish` as `isStreamResponse && onFinish`, but upload progress at line 124 does not pass a fourth argument, so `onFinish` is `undefined`.

  Fix: check `onFinish` before calling: `onFinish && onFinish()` at lines 41 and 50.

## The numbers

- **Size:** 21 files, +1015/−127. Logic: +490/−124 in 16 files. Tests: +490/−0 in 2 files. Config: +5/−3 in 2 files. Docs: none. Noise (skipped): +30/−0 in 1 file.
- **Who calls the changed code:**
  - `progressEventReducer` was removed from XHR and made a standalone export. Now called from lib/adapters/xhr.js:236, 240 and lib/adapters/fetch.js:126, 160. The call graph's "still called from 12 places" refers to the old inline function in the built dist files, not changed in this PR.
  - `AxiosHeaders.set` is called from 37 places. This PR adds one call path: when a native Headers object is passed, `set` iterates its entries (lib/core/AxiosHeaders.js:103).
  - `throttle` is called from lib/helpers/AxiosTransformStream.js:56 and lib/helpers/progressEventReducer.js:8. The signature changed; existing call sites updated.
  - `toFiniteNumber` is called from 12 places, including the new fetch adapter (lib/adapters/fetch.js:72, 155). Behaviour changed for `null`/`undefined` inputs.
  - `buildConfig` (rollup.config.js) is called from three places; the alias parameter is new but only used in the commented-out bundle.
- **Tests:** 22 tests added for the fetch adapter. No tests for `composeSignals`, `trackStream`, or `resolveConfig` in isolation. The fetch adapter tests cover them indirectly.
- **Not reviewed:** The built dist files (dist/axios.js, dist/axios.min.js, etc.) in the call graph are generated and not part of the source diff. The commented-out rollup config for a fetch-only bundle (rollup.config.js:79-90) is not active.

<sub>Reviewed by [pr-reviewer](https://github.com/theaiowlandswan/pr-reviewer) against `base` · 12 turns · $0.395 · 190s</sub>
