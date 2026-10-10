# pr-reviewer

An add-on for AI coding agents (Claude Code first, then Codex, then a GitHub Action) that makes
PR review understandable for **humans**. It explains the change first so a reviewer can build a
correct mental model fast, then gives short, prioritized findings. It should use fewer tokens than
a plain review by pre-processing the diff deterministically before the LLM sees it.

## The output format (the core product)

1. **Intent:** 2-3 sentences on what the PR is trying to do.
2. **Flow before → after:** a Mermaid diagram plus a short before/after narrative.
3. **Reading order:** files ranked by importance with a reason each; skippable files listed explicitly.
4. **Per-change "why":** each meaningful change tied back to the intent; flag changes that don't tie back.
5. **Risk hotspots:** the few places a human must think, each with a concrete question to ask.
6. **Review findings:** short, last, prioritized (bugs > risks > style).

`prompts/review.md` is the single source of truth for this format. Every integration (the Claude Code
skill, Codex, the GitHub Action) must use that prompt rather than keep its own copy.

## Layout

- `prompts/review.md`: the review prompt
- `skills/explain-pr/SKILL.md`: the `/explain-pr [base-branch]` command (a thin wrapper around the prompt)
- `.claude-plugin/`: plugin and marketplace manifests; the whole repo is the plugin, so `prompts/` ships with it
- `src/`: Phase 1 CLI (`diff.ts` parse git diff, `filter.ts` drop noise, `context.ts` cluster and render, `cli.ts` entry point)
- `test/`: vitest tests
- `integrations/`: per-agent setup (Codex, later the GitHub Action)
- `examples/`: real review outputs, before/after

## Roadmap

- **Phase 0 (current):** the prompt plus the Claude Code slash command.
- **Phase 1:** `npx pr-reviewer context`. Get the diff, filter noise hunks, cluster related hunks,
  emit a compact context file. Measure token savings against the raw diff.
- **Phase 2:** tree-sitter call-graph context (changed functions plus 1-hop callers/callees), TS and Python first.
- **Phase 3:** Claude Code plugin, Codex prompt/AGENTS.md recipe, GitHub Action that posts a PR comment.

## Conventions

- TypeScript, Node 20+, ESM (`"type": "module"`, `.js` extensions in relative imports).
- Small, focused modules. Pure functions where possible; keep git and file I/O at the edges.
- Tests with vitest in `test/`. Run `npm test` and `npm run typecheck` before declaring work done.
- Keep the noise list in `src/filter.ts` and `prompts/review.md` in sync.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- Don't commit unless asked.
