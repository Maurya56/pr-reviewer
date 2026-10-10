# pr-reviewer

An add-on for AI coding agents (Claude Code first, then Codex, then a GitHub Action) that makes
PR review understandable for **humans**. It explains the change first so a reviewer can build a
correct mental model fast, then gives short, prioritized findings. It should use fewer tokens than
a plain review by pre-processing the diff deterministically before the LLM sees it.

## The output format (the core product)

A review that reads like a senior engineer walking a teammate through the PR, not a filled-in report:

1. **In short:** what changes and why, followable without knowing the codebase, plus a plain call.
2. **What was wrong / What's new:** one concrete example of the old behaviour and its cause.
3. **How it works now:** the idea in one sentence, the same example through the new code, design reasons,
   a small text diagram (no Mermaid: it doesn't render in terminals); unrelated changes called out.
4. **Where to look:** a few files in order, plus what to skip.
5. **What I'd double-check:** open questions only a person can answer.
6. **Problems:** confirmed defects as paste-ready PR comments with the proving line.
Appendix **The numbers:** exact size, callers (from the call graph), tests.

The explanation (1-3) stays under ~300 words with no line numbers. Motto: human-understandable, not AI slop.

`prompts/review.md` is the single source of truth for this format. Every integration (the Claude Code
skill, Codex, the GitHub Action) must use that prompt rather than keep its own copy.

## Layout

- `prompts/review.md`: the review prompt
- **Generated** from it by `npm run build:skill` (a test fails if stale); each embeds the full prompt, because a
  pointer to the file got skipped and a same-named command shadowed the skill:
  `skills/explain-pr{,-deep}/SKILL.md`, `commands/explain-pr{,-deep}.md` (for Claude Code versions that don't list
  skills in `/`), `integrations/codex/explain-pr{,-deep}.md`. The `-deep` variants set **Depth: deep**; the prompt's
  Depth section switches the limits and the output shape.
- `.claude-plugin/`: plugin and marketplace manifests; the whole repo is the plugin, so `prompts/` ships with it
- `action.yml` + `scripts/ci-review.sh`: the GitHub Action (the script holds the logic and runs locally too)
- `src/`: the `pr-reviewer context` CLI. `diff.ts` git + diff parsing, `filter.ts` noise, `context.ts` sizes,
  reading order, rendering, `symbols.ts` tree-sitter parsing (pure), `callgraph.ts` changed functions and callers
  (git I/O), `cli.ts` entry point
- `grammars/`: tree-sitter wasm files copied from the `tree-sitter-wasms` dev dependency at build (gitignored).
  `web-tree-sitter` is pinned to 0.20.8: it matches those grammars (built with tree-sitter 0.20.8), and newer
  versions use ES2021 syntax (`||=`, `??=`) that breaks Node 14. Upgrade both together or loading breaks.
- `scripts/compare.sh`: plain review vs pr-reviewer, side by side
- `test/`: vitest tests
- `examples/`: real review outputs, before/after

## Roadmap

- **Done:** Phase 0 (prompt + skill), Phase 1 (context CLI), Phase 2 (call graph: Python, TS/JS, Go, C/C++),
  Phase 3 (plugin, GitHub Action, Codex prompt), cross-repo context in the prompt.
- **Phase 1.5:** repo knowledge (design in `docs/knowledge.md`).
- **Next:** call graph across repos in `.pr-reviewer.json`; benchmark of 3-5 fixture PRs with several runs each.

`.pr-reviewer.json` (in the reviewed repo) is the one config format, for cross-repo context and (Phase 1.5)
the `knowledge` field. The prompt documents it in Step 2b; any CLI code that reads it must follow that schema.

## Conventions

- TypeScript, ESM (`"type": "module"`, `.js` extensions in relative imports).
- The CLI must run on **Node 14.18+**: TS target/lib ES2020, no `util.parseArgs`, no `??=`/`||=`. Building and
  testing need Node 18+ (vitest, TypeScript). `scripts/smoke.sh` checks the built CLI; CI runs it on Node 14.
- Small, focused modules. Pure functions where possible; keep git and file I/O at the edges.
- Tests with vitest in `test/`. Run `npm test` and `npm run typecheck` before declaring work done.
- Keep the noise list in `src/filter.ts` and `prompts/review.md` in sync.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- Don't commit unless asked.

## Known pitfalls

- After editing `prompts/review.md`, run `npm run build:skill`, or the skill keeps serving the old prompt.
- Never run `scripts/compare.sh` inside this repo: the plain review reads CLAUDE.md and copies the format.
- Bump `version` in `.claude-plugin/plugin.json` (and `package.json`) whenever skills, commands, or the prompt change:
  Claude Code caches installed plugins by version, so an unchanged version can keep serving the old files.
