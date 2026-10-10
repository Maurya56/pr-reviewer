# pr-reviewer

**Make AI-written PRs reviewable by humans.**

AI agents now write PRs faster than people can read them. A 2,000-line diff gets skimmed and
approved, and the usual AI review adds to the problem: a flat list of nitpicks, with no help
understanding what the change actually does.

pr-reviewer works in Claude Code, Codex, and as a GitHub Action. It **explains the change
first**, so you can build a correct mental model in minutes, and only then gives review
findings. A small CLI pre-processes the diff before the model sees it: noise removed, exact
sizes, and a call graph of the changed functions. That makes the review both more accurate and
cheaper than a plain one.

**The rule for every line of output: human-understandable, not AI slop.** No praise padding, no
emoji checklists, no sentence that would be true of any PR.

## Measured, not claimed

On a real merged PR (pallets/click #3818, a Ctrl-C race fix), same model, same read-only tools,
run with [`scripts/compare.sh`](scripts/compare.sh). Read both reviews side by side in
[examples/click-pr-3818](examples/click-pr-3818/):

| | Plain Claude review | pr-reviewer |
| --- | --- | --- |
| Cost | $0.17 | **$0.10** |
| Time | 103s | **46s** |
| Length | 1,006 words | **554 words** |
| Praise and filler words ("excellent", "comprehensive", ✅ ...) | 18 | **1** |
| Callers of the changed function, with file and line | not covered | **both found** |

One PR, one run each, so read it as direction, not an average. A 17-PR evaluation covering 12
kinds of review is in [`eval/`](eval/README.md) (below); its first full results are pending.

## What you get

A review that reads like a teammate walking you through the PR, not a report:

- **In short:** what changes and why, in words someone outside the codebase follows, and a
  plain call: "Safe to merge", "Good to merge once X is fixed", or "Worth talking through X".
- **What was wrong** (or **What's new**): one concrete example of the old behaviour, and why
  it happened.
- **How it works now:** the idea in one sentence, then the same example traced through the new
  code, with the reason for each design choice and a small text diagram that renders anywhere.
  Changes unrelated to the goal are called out.
- **Where to look:** the few files worth opening, in order, and what you can skip.
- **What I'd double-check:** only open questions a person has to decide.
- **Problems:** confirmed defects, each written as a PR comment with the line that proves it.
- **The numbers:** exact size, who calls the changed code (and which callers the PR didn't
  update), and which changes have tests, kept at the end for whoever wants them.

## Quick start (Claude Code)

Install it as a plugin, inside Claude Code:

```text
/plugin marketplace add theaiowlandswan/pr-reviewer
/plugin install pr-reviewer@pr-reviewer
```

Then check out the PR branch in any repo and run:

```text
/explain-pr            # diff against main
/explain-pr develop    # diff against another base branch
/explain-pr-deep main  # every change explained in turn, however big the PR
```

`/explain-pr` is the one-minute version: the idea, one example, where to look.
`/explain-pr-deep` is the same voice with more time: one section per change, each with a
concrete before-and-after example, how the code works, what else it touches, edge cases, and
the design trade-off, then what every test proves. Length grows with the PR; see
[examples/axios-pr-6371-deep](examples/axios-pr-6371-deep/), where a deep review found a bug the
PR shipped with and axios fixed two months later.

They may be listed as `/pr-reviewer:explain-pr` and `/pr-reviewer:explain-pr-deep`, which also
work. You can also just ask "explain this PR against main" (or "explain it in depth").

**Make it faster and cheaper:** install the context CLI so the review gets everything in one
call instead of a dozen (Node 14.18 or newer):

```bash
npm install -g github:theaiowlandswan/pr-reviewer    # provides `pr-reviewer`
```

The review uses it automatically when it's on your PATH, and falls back to plain git commands
when it isn't. Install it from GitHub as shown: the npm package named `pr-reviewer` is a
different project.

**Hacking on the prompt?** Link it instead of installing the plugin, so your edits take effect
right away (run `npm run build:skill` after editing `prompts/review.md`). Don't do both, or
you'll get two copies of the command:

```bash
git clone https://github.com/theaiowlandswan/pr-reviewer.git
mkdir -p ~/.claude/skills ~/.claude/commands
for name in explain-pr explain-pr-deep; do
  ln -s "$PWD/pr-reviewer/skills/$name" ~/.claude/skills/$name
  ln -s "$PWD/pr-reviewer/commands/$name.md" ~/.claude/commands/$name.md
done
```

The prompt itself is plain markdown in [`prompts/review.md`](prompts/review.md), so you can also
paste it into any agent.

## GitHub Action

Review every pull request automatically. The review is posted as one comment, updated on each
push, and also written to the job summary:

```yaml
# .github/workflows/pr-review.yml
name: PR review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
      - uses: theaiowlandswan/pr-reviewer@main
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # depth: deep                # optional: every change explained in turn
          # model: claude-sonnet-5-5   # optional
```

Add `ANTHROPIC_API_KEY` under the repo's **Settings → Secrets and variables → Actions**.
Pull requests from forks don't get secrets on `pull_request`, so they're skipped. Don't switch to
`pull_request_target` to work around that: the review reads the PR's code, and that event would
give untrusted code a write token.

## Codex

The same prompt, as a Codex custom prompt: see [integrations/codex](integrations/codex/README.md).

## The context CLI

```bash
pr-reviewer context --base main            # writes .pr-reviewer/out/context.md
pr-reviewer context --base main --stdout   # prints it
```

What it does, without any model call:

- **Drops noise** before the model sees it: lockfiles, generated code (including files whose
  header says "DO NOT EDIT"), snapshots, pure renames, formatting-only changes.
- **Exact size**, split into logic, tests, config, docs, and noise, so the review never
  estimates.
- **Reading order:** source first, then tests, config, docs. Large test diffs collapse to their
  test names.
- **Call graph (tree-sitter):** for each changed function in Python, TypeScript/JavaScript, Go,
  C, or C++: whether it was added, modified, or removed, who calls it (flagging callers the PR
  didn't update), and what it calls. A removed function that something still calls shows up
  here, before anyone merges it.

## See the difference yourself

`scripts/compare.sh` runs a plain Claude review and `/explain-pr` on the same branch, in
parallel, with the same model and the same read-only tools, and writes both outputs side by
side with tokens, cost, and a short scoring sheet:

```bash
cd your-repo && git switch your-pr-branch
~/.claude/plugins/marketplaces/pr-reviewer/scripts/compare.sh main   # plugin install
# or: ~/pr-reviewer/scripts/compare.sh main                           # cloned repo
```

Add `--runs 3` to run each review three times: model output varies between runs, and the summary
shows the spread. Add `--deep` to compare against `/explain-pr-deep` instead.

## Evaluation

[`eval/`](eval/README.md) measures pr-reviewer against a plain review on 17 real public PRs that
together cover 12 kinds of review: a small fix, a shared-API change, a refactor, a bug fix,
deleted code, concurrency, a build migration, a tangled PR, a big feature, a lot of new code, an
AI agent's PR checked against the issue it was given, and an unfamiliar C++ codebase. Four are
known-buggy: merged, then fixed by a later PR. 12 of the 17 were merged after the model's
training cutoff, so it can't already know them.

Each PR has comprehension questions with answers checked against the code, and each review is
scored on comprehension, whether it found the real bug, false findings, cost, and length. Each PR
is fetched into its own repo with only the history up to that PR, so a later fix commit can't
leak into the review.

```bash
npm run build && eval/run.sh --runs 1 --judge    # all 17 PRs once, with blind AI pre-scoring
```

## Reviewing across repositories

If your PR calls into code from other repos, the review reads that code's source so it isn't
guessing. It uses the copy you actually build against: a submodule or vendored copy first, then
the installed package (`node_modules`, `.venv`, the Go module cache, C/C++ include paths), then
a separate checkout of that repo.

To use separate checkouts, and to check whether a change to a shared API breaks code in other
repos, add `.pr-reviewer.json` to the root of the repo you're reviewing:

```json
{
  "importedAs": ["@acme/api"],
  "repos": [
    { "name": "core", "path": "../core", "importedAs": ["@acme/core", "acme_core"] },
    { "name": "web", "path": "~/work/web" }
  ]
}
```

- `importedAs` at the top: how other repos import this one. Used to find code in those repos
  that would break.
- `repos[].path`: where that repo is checked out on your machine.
- `repos[].importedAs`: how this repo imports that one (npm package, Python module, Go module
  path, or C/C++ include prefix). Leave it out for repos that only use this one.

Claude Code may ask before reading files outside the current repo. To skip those prompts, add the
checkouts to `permissions.additionalDirectories` in your settings, or run `/add-dir <path>`.

## Roadmap

- [x] **Phase 0:** review prompt + Claude Code `/explain-pr`
- [x] **Phase 1:** `pr-reviewer context`: noise filter, exact sizes, reading order, collapsed test diffs
- [x] **Cross-repo context** (prompt level): read code the PR calls into from other repos, find code in other repos that uses what it changes
- [x] **Phase 2:** tree-sitter call graph for Python, TS/JS, Go, C/C++ (changed functions, 1-hop callers and callees)
- [x] **Phase 3:** Claude Code plugin, GitHub Action, Codex prompt
- [x] **Node 14.18+** support for the CLI
- [x] **Evaluation:** 17 PRs across 12 review cases, isolated repos, scoring sheet ([eval](eval/README.md))
- [ ] **Baseline results** from the full evaluation, before the features below
- [ ] **Untangle:** split a PR into its separate changes and say which ones change behaviour
- [ ] **Checks done by code, not the model:** callers the PR didn't update as findings, PR
      description vs diff, new packages that don't exist, a bug-fix test that doesn't fail before the fix
- [ ] **Impact map** for changes to existing code, and a **guided tour** for new code
- [ ] **Reviewer check:** a few questions for the reviewer before the summary
- [ ] **Phase 1.5:** repo knowledge ([design](docs/knowledge.md))
- [ ] Call graph across repos listed in `.pr-reviewer.json`

## Development

The `pr-reviewer` CLI runs on Node 14.18 or newer. Developing it (building, tests) needs Node 18+.

```bash
npm install          # also builds dist/ and copies the tree-sitter grammars
npm test
npm run typecheck
npm run build:skill  # after editing prompts/review.md: regenerates the skill, command, and Codex prompt
scripts/smoke.sh     # end-to-end check of the built CLI on whatever `node` is on PATH
```

## License

[MIT](LICENSE) © Maurya
