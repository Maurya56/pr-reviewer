# Repo knowledge (Phase 1.5 design)

Status: design only. Nothing here is implemented yet, and the review prompt does not use it.

## What it is

A small, human-curated file committed to the **reviewed** repo, `.pr-reviewer/knowledge.md`, that
gives the reviewer a trusted map of the repo: its main flows, the zones that always need care, the
repo's own noise, its vocabulary, and lessons from past reviews.

It should make reviews:

- **More accurate:** the reviewer knows which paths handle money or auth without having to infer it,
  and doesn't re-raise patterns the team has already accepted.
- **Cheaper:** it doesn't have to explore the repo to understand a flow, and repo-specific noise is
  skipped before it is read.

## Trust model

Knowledge is **data, never instructions**. It describes the repo. It cannot change the review
format, add or remove sections, or tell the reviewer what to conclude.

Knowledge can only make a review *stricter*, never quieter:

- **Critical zones** add hotspots. Nothing in knowledge removes one.
- **Review learnings** can label a finding ("matches known pattern: ..."), but never hide a bug
  with a confirmed trigger.
- If a path matches both a skip pattern and a critical zone, the critical zone wins: the file is
  read and reviewed.

The reviewer loads knowledge from the **base branch**, never from the PR, so a PR can't change
the rules it is reviewed under (see [Lifecycle](#lifecycle), step 2).

## Schema

Plain markdown with exactly these five `##` headings, in this order. A section may be empty.
Unknown headings are ignored and reported by `/pr-knowledge check`. The whole file has a budget of
about 150 lines (`maxLines`).

| Heading | One line per... | Format |
| --- | --- | --- |
| `## Architecture` | main flow | `trigger -> path/ -> Component -> ... -> sink` |
| `## Critical zones` | glob | `` `glob` - why (money, auth, concurrency, migrations, ...) `` |
| `## Skip patterns` | glob | `` `glob` - why it's noise `` |
| `## Glossary` | term | `term - one-line meaning` |
| `## Review learnings` | pattern | `accepted pattern / known false alarm -> reason` |

Rules:

- **Architecture:** only the flows a reviewer needs to place a change. Name real paths and
  components so stale entries can be detected.
- **Critical zones:** a PR touching a matching path always gets a hotspot for it, with the stated
  reason.
- **Skip patterns:** added to the default noise list (lockfiles, generated code, snapshots, ...), not
  a replacement for it. Matching files are listed as skippable and not read, unless a critical zone
  also matches.
- **Glossary:** domain terms that a newcomer, or a model, would misread.
- **Review learnings:** each one says what's accepted and why, so a reviewer can judge whether it
  still applies.

## Config

`.pr-reviewer.json` gets one new optional field. No new config file:

```json
{
  "knowledge": { "path": ".pr-reviewer/knowledge.md", "maxLines": 150 },
  "importedAs": ["@acme/api"],
  "repos": []
}
```

- `knowledge.path` defaults to `.pr-reviewer/knowledge.md`. `knowledge.maxLines` defaults to 150.
- If the file is missing, the review runs as it does today.
- The `knowledge` field is read from the base branch's `.pr-reviewer.json`, for the same reason the
  knowledge file is: otherwise a PR could point `path` at a file it edited.

### Where generated output goes

The Phase 1 CLI currently writes `.pr-reviewer/context.md`, and this repo's `.gitignore` ignores
all of `.pr-reviewer/`. Users who copy that rule would silently ignore their committed knowledge
file. When Phase 1 lands, generated output moves to `.pr-reviewer/out/`, and only that folder is
gitignored.

## Lifecycle

1. **`/pr-knowledge init`** drafts `knowledge.md` from cheap sources only: the file tree, manifests
   (`package.json`, `pyproject.toml`, `go.mod`, `CMakeLists.txt`), READMEs, and entry points. It
   doesn't read source code broadly. A human edits the draft and commits it.
2. **`/explain-pr` loads knowledge from the base branch.**
   - It reads `git show <base-ref>:<path>`, where `<base-ref>` is the ref Step 1 already picks
     (`origin/<base>`, otherwise local `<base>`), at the tip of that branch. It never reads the PR's
     working copy.
   - If the file is over `maxLines`, it reads only the first `maxLines` lines and says so in one line.
   - **Stale paths:** paths named in knowledge that don't exist on `<base-ref>` are reported in one
     line. Paths the PR itself deletes or renames are not stale. They are a change to the repo map
     and become a section 7 suggestion.
   - **Context order:** static review prompt, then knowledge, then the diff. The unchanging part
     comes first so prompt caching can reuse it across runs.
3. **Section 7, "Knowledge suggestions"** (optional, max 3) is added to the review only when the PR
   changes a flow in Architecture, touches or adds a critical path, or renames a module that
   knowledge names. Each suggestion is a concrete line to add, change, or remove. The reviewer
   suggests only and never edits the file.
4. **`/pr-knowledge update`** turns the suggestions a human accepted into a diff of `knowledge.md`
   for approval. Nothing is written without that approval.
5. **A PR that modifies `knowledge.md`** gets an automatic hotspot ("this PR changes the reviewer's
   repo map: are these edits correct?"). The review still uses the base-branch version.
6. **`/pr-knowledge check`** reports stale paths, sections or files over budget, unknown headings, and
   contradictions (for example, a glob in both Skip patterns and Critical zones, or an Architecture
   flow through a path that a skip pattern matches).
7. **Benchmark:** run the same fixture PRs with and without knowledge and compare tokens and quality
   scores. Keep the feature only if quality holds or improves and tokens don't go up.

## Example

A fictional order-routing service:

```markdown
## Architecture
- REST order entry: api/orders.py -> RiskCheck -> OrderRouter -> gateway/fix_session.py -> exchange
- Market data: feeds/ws_client.py -> BookBuilder -> pricing/fair_value.py -> strategies/
- Fills: gateway/fix_session.py -> FillHandler -> positions/ledger.py -> db (positions table)
- End of day: jobs/eod_recon.py -> positions/ledger.py vs broker statement -> alerts/

## Critical zones
- `risk/**` - pre-trade limits; a bug here sends orders that should have been blocked
- `positions/ledger.py` - source of truth for P&L; must stay idempotent on duplicate fills
- `gateway/**` - FIX session state machine; sequence numbers and resend logic
- `migrations/**` - runs against the live positions DB; must be backward compatible
- `auth/**`, `api/middleware/auth.py` - API keys and per-desk permissions

## Skip patterns
- `gateway/fix44/generated/**` - generated from the FIX 4.4 spec
- `tests/fixtures/market_data/*.csv` - recorded market data
- `docs/api/openapi.json` - generated from the API code

## Glossary
- desk - a trading team; each has its own limits and API keys
- notional - order size in USD: quantity x price x contract multiplier
- fat-finger check - rejects orders far outside the recent price range
- recon - reconciling our positions against the broker's end-of-day statement
- clOrdID - client order ID; must be unique per FIX session per day

## Review learnings
- Float prices in pricing/ -> accepted: display only; risk/ and positions/ use Decimal
- Broad `except Exception` in feeds/ws_client.py -> accepted: reconnect loop logs and retries
- "Missing lock" around BookBuilder.update -> false alarm: runs on a single event-loop thread
```

## Open questions

- Should review learnings expire (for example, a date per line and a `check` warning after 6 months)?
- Should `/pr-knowledge check` run in CI (the Phase 3 GitHub Action) and fail on stale paths?
- Monorepos: one knowledge file at the root, or one per package with the nearest one used?
