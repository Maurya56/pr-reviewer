import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Both entry points must embed the full prompt; see scripts/build-skill.mjs for why.
describe.each(["skills/explain-pr/SKILL.md", "commands/explain-pr.md", "integrations/codex/explain-pr.md"])("%s", (path) => {
  it("contains prompts/review.md verbatim (run `npm run build:skill` if this fails)", () => {
    expect(read(path)).toContain(read("prompts/review.md"));
  });
});
