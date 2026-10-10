# pr-reviewer

**Make AI-written PRs reviewable by humans.**

AI agents now write PRs faster than people can read them. A 2,000-line diff gets skimmed and
approved, and the usual AI review adds to the problem: a flat list of nitpicks, with no help
understanding what the change actually does.

pr-reviewer is an add-on for AI coding agents (Claude Code now; Codex and a GitHub Action next)
that **explains the change first**, so you can build a correct mental model in minutes, and only
then gives review findings. It also aims to use **fewer tokens** than a plain review by
pre-processing the diff deterministically before the model sees it.

## What you get

Every review has six sections, in this order:

1. **Intent:** 2-3 sentences on what the PR is trying to do.
2. **Flow: before → after:** a Mermaid diagram and a short narrative of how control/data flow changed.
3. **Reading order:** files ranked by importance, with why to read each. Lockfiles, renames,
   formatting, and generated code are listed as skippable.
4. **Per-change "why":** each meaningful change tied back to the intent. Changes that *don't* tie back are flagged.
5. **Risk hotspots:** the few places that need real thought, each with a concrete question
   (e.g. *"What happens if the connection drops mid-batch?"*).
6. **Review findings:** short and prioritized: bugs > risks > style.

## Quick start (Claude Code)

Install it as a plugin, inside Claude Code:

```text
/plugin marketplace add Maurya56/pr-reviewer
/plugin install pr-reviewer@pr-reviewer
```

Then check out the PR branch in any repo and run:

```text
/pr-reviewer:explain-pr            # diff against main
/pr-reviewer:explain-pr develop    # diff against another base branch
```

**Hacking on the prompt?** Link the skill instead, so edits to `prompts/review.md` take effect
immediately (the command is then plain `/explain-pr`). Don't install both, or you'll get two
copies of the command:

```bash
git clone https://github.com/Maurya56/pr-reviewer.git
mkdir -p ~/.claude/skills
ln -s "$PWD/pr-reviewer/skills/explain-pr" ~/.claude/skills/explain-pr
```

The prompt itself is plain markdown in [`prompts/review.md`](prompts/review.md), so you can also
paste it into any agent.

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

- [x] **Phase 0:** review prompt + Claude Code `/explain-pr` command
- [ ] **Phase 1:** `npx pr-reviewer context`: filter noise, cluster related hunks, emit a compact context file; measure token savings vs the raw diff
- [x] **Cross-repo context** (prompt level): read code the PR calls into from other repos, find code in other repos that uses what it changes
- [ ] **Phase 2:** tree-sitter call-graph context (changed functions + 1-hop callers/callees, including across repos in `.pr-reviewer.json`), TypeScript and Python first, then Go and C/C++
- [ ] **Phase 3:** ~~Claude Code plugin~~ (done), [Codex](integrations/codex/README.md) recipe, GitHub Action that posts a PR comment

## Development

Requires Node 20+.

```bash
npm install
npm test
npm run typecheck
```

## License

[MIT](LICENSE) © Maurya
