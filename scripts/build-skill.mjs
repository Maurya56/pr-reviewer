// Generate the Claude Code skills and commands and the Codex prompts from prompts/review.md, in
// two depths: `explain-pr` (short) and `explain-pr-deep` (a full walkthrough of every change).
//
// Every generated file must contain the full prompt:
// - When SKILL.md only pointed at the prompt file, Claude launched the skill but skipped reading
//   the file and improvised a generic review.
// - A skill and a command with the same name collide: invoking the skill can load the command
//   instead, so a command that only says "use the skill" loads no prompt at all.
// prompts/review.md stays the single source of truth; test/skill.test.ts fails if these are stale.

import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const prompt = readFileSync(new URL("prompts/review.md", root), "utf8");

const allowedTools =
  "Read Grep Glob Bash(pr-reviewer context *) Bash(git diff *) Bash(git log *) Bash(git merge-base *) Bash(git rev-parse *) Bash(git show *) Bash(git status *) Bash(git branch *) Bash(git -C * log *) Bash(go env GOMODCACHE)";

const VARIANTS = [
  {
    name: "explain-pr",
    depth: "short",
    description:
      "Explain the current branch's PR for a human reviewer (intent, before/after flow, reading order, per-change why, risk hotspots), then give prioritized findings. Use when asked to explain, walk through, or review a PR or branch.",
  },
  {
    name: "explain-pr-deep",
    depth: "deep",
    description:
      "Deep walkthrough of the current branch's PR for a human reviewer: every change explained in turn, with examples, edge cases, design choices, and what each test proves, then prioritized findings. Use when asked for a deep, detailed, or thorough explanation of a PR or branch.",
  },
];

// Frontmatter values are written as JSON strings, which are valid YAML: a bare description with
// ": " in it is invalid YAML, and strict parsers drop the whole command.
const body = (depth) => `<!-- GENERATED from prompts/review.md by \`npm run build:skill\`. Do not edit by hand. -->

Review the current branch as a pull request. **Base branch:** \`$ARGUMENTS\` (if empty, use \`main\`). **Depth: ${depth}.**
Follow every instruction below exactly. This is read-only: do not edit, stage, or commit anything.

${prompt}`;

for (const { name, depth, description } of VARIANTS) {
  const outputs = {
    [`skills/${name}/SKILL.md`]: `---
name: ${name}
description: ${JSON.stringify(description)}
argument-hint: "[base-branch]"
allowed-tools: ${allowedTools}
---

${body(depth)}`,
    [`commands/${name}.md`]: `---
description: ${JSON.stringify(description)}
argument-hint: "[base-branch]"
allowed-tools: ${allowedTools}
---

${body(depth)}`,
    // Codex custom prompt (~/.codex/prompts/<name>.md). Codex has no allowed-tools; its sandbox and
    // approval settings decide what the review may run.
    [`integrations/codex/${name}.md`]: `---
description: ${JSON.stringify(description)}
argument-hint: "[base-branch]"
---

${body(depth)}`,
  };
  for (const [path, content] of Object.entries(outputs)) {
    mkdirSync(new URL(path.slice(0, path.lastIndexOf("/")), root), { recursive: true });
    writeFileSync(new URL(path, root), content);
    console.log(`wrote ${path}`);
  }
}
