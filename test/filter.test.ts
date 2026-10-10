import { describe, expect, it } from "vitest";
import { classifyPath } from "../src/filter.js";

describe("classifyPath", () => {
  it.each([
    ["package-lock.json", "lockfile"],
    ["apps/web/pnpm-lock.yaml", "lockfile"],
    ["dist/index.js", "generated"],
    ["src/__snapshots__/view.test.ts.snap", "snapshot"],
  ] as const)("marks %s as %s", (path, reason) => {
    expect(classifyPath(path)).toBe(reason);
  });

  it.each(["src/cli.ts", "src/distribution.ts", "README.md"])("keeps %s as signal", (path) => {
    expect(classifyPath(path)).toBeUndefined();
  });
});
