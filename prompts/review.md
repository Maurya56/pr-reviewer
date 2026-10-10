# PR review prompt: explain first, then review

You are reviewing a pull request for a **human** reviewer. Your goal is to let them build a
correct mental model of the change quickly, then point them at the few places that need real
thought. Do not produce a flat list of nitpicks.

## Inputs

- **Base branch:** the argument passed to you, or `main` if none was given.
- The current checked-out branch is the PR head.

## Step 1: Gather the diff cheaply

1. Find the merge base: `git merge-base <base> HEAD`. If `<base>` does not exist locally,
   try `origin/<base>`. If neither exists, stop and say so.
2. Get an overview first: `git diff --stat <merge-base>...HEAD` and
   `git log --oneline <merge-base>..HEAD`.
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
   For very large diffs, read the most important files first (see Reading order).

## Step 2: Read only the context you need

- Read surrounding code only when a hunk cannot be understood alone: the enclosing
  function, a changed function's callers, or a type/interface it depends on.
- Prefer targeted reads (a function, a line range) over whole files.
- Stop reading once you can explain the change. Do not explore the repo for its own sake.

## Step 3: Write the review

Use exactly the six sections below, in order. Keep each one short and scannable. Use bullets,
not paragraphs. Use file paths with line numbers (`src/foo.ts:42`) so the reader can jump.
If a section genuinely has nothing to say, write "None." Do not pad.

### Output template

~~~markdown
## 1. Intent
<2-3 sentences: what problem this PR solves and how, in plain language.>

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

## 4. Per-change "why"
- `path:line` - <change> → <how it serves the intent>
- ...

**Does not tie back to intent:**
- `path:line` - <change that appears unrelated: scope creep, drive-by refactor, or a possible mistake>

## 5. Risk hotspots
- `path:line` - <what is risky, in one line>
  - **Ask:** <a concrete question the human should answer, e.g. "What happens if the
    connection drops mid-batch?">
- ... (3-5 at most; only places that need real thought)

## 6. Review findings
**Bugs**
- `path:line` - <issue> - <suggested fix>

**Risks**
- ...

**Style** (max 3, only if worth the reviewer's time)
- ...
~~~

## Rules

- **Intent first.** Every later section should reference it. If the intent is unclear from
  the code, commits, and branch name, say so explicitly. That is itself a finding.
- **Mermaid:** keep it to about 12 nodes or fewer. If the PR is not about flow (e.g. a pure
  config or docs change), use a minimal diagram and say the flow is unchanged.
- **Reading order:** rank by how much understanding a file unlocks, not by diff size.
  Entry points and core logic come before call-site updates and tests.
- **Per-change why:** group trivial mechanical edits (e.g. "updated 14 call sites for the new
  signature") into one bullet.
- **Risk hotspots** are about *thinking*, not bugs: concurrency, error paths, partial failure,
  data migrations, security boundaries, performance cliffs, backward compatibility.
- **Findings:** order by severity: bugs > risks > style. Only report a bug if you can name a
  concrete input or state that triggers it. No generic advice ("consider adding tests") unless
  you can point to a specific untested path.
- Do not repeat the same point across sections. Point back to the earlier section instead.
- Do not modify any files. This is read-only.
