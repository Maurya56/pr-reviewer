import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Every entry point must embed the full prompt; see scripts/build-skill.mjs for why.
const ENTRY_POINTS = [
  ["skills/explain-pr/SKILL.md", "short"],
  ["commands/explain-pr.md", "short"],
  ["integrations/codex/explain-pr.md", "short"],
  ["skills/explain-pr-deep/SKILL.md", "deep"],
  ["commands/explain-pr-deep.md", "deep"],
  ["integrations/codex/explain-pr-deep.md", "deep"],
] as const;

describe.each(ENTRY_POINTS)("%s", (path, depth) => {
  it("contains prompts/review.md verbatim (run `npm run build:skill` if this fails)", () => {
    expect(read(path)).toContain(read("prompts/review.md"));
  });

  it(`asks for depth ${depth}`, () => {
    expect(read(path)).toContain(`**Depth: ${depth}.**`);
  });
});
