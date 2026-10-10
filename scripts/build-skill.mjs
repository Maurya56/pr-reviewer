// Generate skills/explain-pr/SKILL.md and commands/explain-pr.md from prompts/review.md.
//
// Both must contain the full prompt:
// - When SKILL.md only pointed at the prompt file, Claude launched the skill but skipped reading
//   the file and improvised a generic review.
// - A skill and a command with the same name collide: invoking the skill can load the command
//   instead, so a command that only says "use the skill" loads no prompt at all.
// prompts/review.md stays the single source of truth; test/skill.test.ts fails if these are stale.

import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const prompt = readFileSync(new URL("prompts/review.md", root), "utf8");

const description =
  "Explain the current branch's PR for a human reviewer (intent, before/after flow, reading order, per-change why, risk hotspots), then give prioritized findings. Use when asked to explain, walk through, or review a PR or branch.";
const allowedTools =
  "Read Grep Glob Bash(git diff *) Bash(git log *) Bash(git merge-base *) Bash(git rev-parse *) Bash(git show *) Bash(git status *) Bash(git branch *) Bash(git -C * log *) Bash(go env GOMODCACHE)";

const body = `<!-- GENERATED from prompts/review.md by \`npm run build:skill\`. Do not edit by hand. -->

Review the current branch as a pull request. **Base branch:** \`$ARGUMENTS\` (if empty, use \`main\`).
Follow every instruction below exactly. This is read-only: do not edit, stage, or commit anything.

${prompt}`;

const outputs = {
  "skills/explain-pr/SKILL.md": `---
name: explain-pr
description: ${description}
argument-hint: "[base-branch]"
allowed-tools: ${allowedTools}
---

${body}`,
  "commands/explain-pr.md": `---
description: ${description}
argument-hint: "[base-branch]"
allowed-tools: ${allowedTools}
---

${body}`,
};

for (const [path, content] of Object.entries(outputs)) {
  writeFileSync(new URL(path, root), content);
  console.log(`wrote ${path}`);
}
