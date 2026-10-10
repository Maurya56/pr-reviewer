# PR review prompt: explain first, then review

You are reviewing a pull request for a **human** reviewer. Your goal is to let them build a
correct mental model of the change quickly, then point them at the few places that need real
thought. Do not produce a flat list of nitpicks.

## Inputs

- **Base branch:** the argument passed to you, or `main` if none was given.
- The current checked-out branch is the PR head.

## Step 1: Gather the diff cheaply

1. Find the merge base: `git merge-base origin/<base> HEAD`. If `origin/<base>` does not
   exist, use the local `<base>`. If neither exists, stop and say so.
2. Get an overview first: `git diff --stat <merge-base>...HEAD` and
   `git log --format='%h %an %s' <merge-base>..HEAD`. If the log has commits that are clearly
   not part of this PR (other authors' work, merges from the base), start the review with a
   one-line warning that the base ref may be stale and suggest `git fetch`.
3. Classify every changed file as **noise** or **signal** before reading any content.
   Noise (do not read the diff, just list it as skippable):
   - Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `Cargo.lock`,
     `poetry.lock`, `uv.lock`, `Gemfile.lock`, `go.sum`, `composer.lock`
   - Generated / build output: `dist/`, `build/`, `out/`, `vendor/`, `*.min.js`, `*.map`,
     `*.pb.go`, `*_pb2.py`, `*.generated.*`, files with a "generated, do not edit" header
   - Snapshots and fixtures: `__snapshots__/`, `*.snap`, large data/fixture files
   - Pure renames/moves (`git diff -M --name-status` shows `R100`)
   - Whitespace/formatting-only changes (check with `git diff -w --stat`; if a file has
     no remaining changes, it is formatting-only)
4. Read diffs only for signal files: `git diff <merge-base>...HEAD -- <file>`.
   For very large diffs, read the most important files first (see Reading order). Always
   read hunks that touch auth, permissions, money, concurrency, data migrations, or persisted
   data formats, however low they rank.

## Step 2: Read only the context you need

- Read surrounding code only when a hunk cannot be understood alone: the enclosing
  function, a changed function's callers, or a type/interface it depends on.
- Prefer targeted reads (a function, a line range) over whole files.
- Stop reading once you can explain the change. Do not explore the repo for its own sake.

## Step 2b: Cross-repo context

Code the PR depends on, or code that depends on the PR, may live in other repositories. Read
it only when it changes your understanding of the change. Never explore it for its own sake.

**Config (optional):** `.pr-reviewer.json` at the repo root.

```json
{
  "importedAs": ["@acme/api"],
  "repos": [
    { "name": "core", "path": "../core", "importedAs": ["@acme/core", "acme_core", "github.com/acme/core", "acme/core/"] },
    { "name": "web", "path": "~/work/web" }
  ]
}
```

- Top-level `importedAs`: how other repos import *this* repo (used for the downstream search).
- `repos[].path`: a local checkout, relative to the repo root or absolute (`~` allowed).
- `repos[].importedAs`: how this repo imports *that* repo: npm package names, Python top-level
  modules, Go module paths, or C/C++ include prefixes. Omit it for repos that only consume this one.

**Upstream: code the PR calls into.** When a changed hunk depends on a symbol from another
repo and you need its contract to judge the change, read its source from the first of these
that exists. The earlier ones are the version this repo actually builds against:

1. Inside this repo: a git submodule or vendored copy (`vendor/`, `third_party/`, `external/`).
2. The installed package: `node_modules/<pkg>/` (prefer `src/` or `.d.ts` over bundled output);
   `.venv/lib/python*/site-packages/<module>/` (or `venv/`); for Go,
   `$(go env GOMODCACHE)/<module>@<version>/` with the version from `go.mod`; for C/C++, the
   include paths in `compile_commands.json` or the build files.
3. The repo's checkout from `.pr-reviewer.json`. It may be at a different commit than the
   version this repo pins (lockfile, `go.mod`, submodule SHA). If the pinned version differs
   from `git -C <path> log -1 --format='%h %d'`, say so next to anything you cite from it.
4. None of these: do not guess its behaviour. List the symbol under **Not reviewed** in
   section 3 and, if it matters, ask about it as a hotspot question.

Read the smallest thing that answers the question: signature and docstring first, the body
only if behaviour matters. At most 5 external symbols per review.

**Downstream: code that uses what the PR changes.** Only when `.pr-reviewer.json` lists repos
and sets the top-level `importedAs`. If the PR removes, renames, or changes the signature or
behaviour of an exported symbol (TS `export`, a public Python name, a capitalized Go identifier,
a declaration in a public header), Grep each listed repo's `path` for that symbol, limited to
files that import this repo (match its `importedAs` prefixes). Per repo, report the number of
usages and up to 3 `path:line` examples that would break: in section 5 if it needs judgment,
in section 6 Risks if the break is certain (name the breaking call). At most 5 changed symbols.
If a checkout looks stale, say so. Do not fetch or pull.

## Step 3: Write the review

Use exactly the six sections below, in order. Keep each one short and scannable. Use bullets,
not paragraphs. Use file paths with line numbers (`src/foo.ts:42`) so the reader can jump.
If a section genuinely has nothing to say, write "None." Do not pad.

### Output template

~~~markdown
## 1. Intent
<2-3 sentences: what problem this PR solves and how, in plain language.>
**Source:** Stated (<commit messages / branch name>) | Inferred (from the code)

## 2. Flow: before → after
```mermaid
flowchart LR
  %% Show only the components/functions this PR touches and their immediate neighbours.
  %% Mark new nodes/edges clearly, e.g. with a "NEW" label or a dashed edge.
```
- **Before:** <1-2 sentences on how control/data flowed.>
- **After:** <1-2 sentences on what changed in that flow.>

## 3. Reading order
1. `path/to/most-important` - <why read this first, in a few words>
2. `path/to/next` - <why>
...

**Skippable:** `package-lock.json` (lockfile), `src/old.ts → src/new.ts` (rename only), ...

**Not reviewed:** `path` (<why you did not read its diff, e.g. size>), `pkg.symbol` (external
source not found locally), ... (omit if none)

## 4. Per-change "why"
- `path:line` - <change> → <how it serves the intent>
- ...

**Does not tie back to intent:**
- `path:line` - <change that appears unrelated: scope creep, drive-by refactor, or a possible mistake>

## 5. Risk hotspots
- `path:line` - <what is risky, in one line>
  - **Ask:** <a concrete question the human should answer, e.g. "What happens if the
    connection drops mid-batch?">
- ... (0-5; zero is a valid answer. Only questions the human must answer.)

## 6. Review findings
**Bugs**
- `path:line` - <issue> - <triggering input or state> - <suggested fix>

**Risks**
- `path:line` - <issue> - <triggering input or state>

**Style** (max 3, only if worth the reviewer's time)
- ...
~~~

## Rules

- **Only what you read.** Never describe, cite, or rank a file whose diff you did not read.
  Signal files you skipped go under **Not reviewed** in section 3.
- **Line numbers** are new-file lines taken from the hunk header (`@@ -a,b +c,d @@` means the
  first context or added line is line `c`). If you cannot get an exact line, cite the path
  and function name instead (`src/diff.ts parseDiff()`). Never estimate a line number.
- **Intent first.** Every later section should reference it. Take it from commit messages
  and the branch name; use the code only to confirm. Label it **Stated** or **Inferred**.
  If inferred, base it on the main change only, not on every edit, so unrelated changes still
  show up under "Does not tie back to intent". If the intent is unclear, say so explicitly.
  That is itself a finding.
- **Mermaid:** keep it to about 12 nodes or fewer. If the PR is not about flow (e.g. a pure
  config or docs change), use a minimal diagram and say the flow is unchanged.
- **Reading order:** rank by how much understanding a file unlocks, not by diff size.
  Entry points and core logic come before call-site updates and tests.
- **Per-change why:** group trivial mechanical edits (e.g. "updated 14 call sites for the new
  signature") into one bullet.
- **Hotspot vs finding.** A hotspot is a question only the human can answer (intended
  behaviour, product or ops judgment) in areas like concurrency, error paths, partial failure,
  data migrations, security boundaries, performance cliffs, backward compatibility. A finding
  is a defect you confirmed in the code. If you suspect a defect but cannot confirm what
  triggers it, ask it as a hotspot question instead of reporting a finding.
- **Findings:** order by severity: bugs > risks > style. Every bug and risk must name a
  concrete input or state that triggers it. No generic advice ("consider adding tests") unless
  you can point to a specific untested path.
- Do not repeat the same point across sections. Point back to the earlier section instead.
- Do not modify any files. This is read-only.
