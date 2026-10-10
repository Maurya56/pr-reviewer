import { describe, expect, it } from "vitest";
import {
  classifyRole,
  computeSize,
  formatSize,
  orderForReading,
  renderContext,
  testNames,
  touchedSymbols,
} from "../src/context.js";
import type { FileDiff } from "../src/diff.js";

const file = (path: string, lines: string[], header = "@@ -1,1 +1,1 @@"): FileDiff => ({
  path,
  status: "modified",
  binary: false,
  hunks: [{ header, oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }],
});

describe("classifyRole", () => {
  it.each([
    ["src/click/core.py", "source"],
    ["lib/api.ts", "source"],
    ["tests/test_core.py", "test"],
    ["src/diff.test.ts", "test"],
    ["pkg/server_test.go", "test"],
    ["src/__tests__/view.tsx", "test"],
    ["README.md", "docs"],
    ["docs/guide/intro.rst", "docs"],
    ["CHANGES.md", "docs"],
    ["LICENSE", "docs"],
    ["package.json", "config"],
    [".github/workflows/ci.yml", "config"],
    [".gitignore", "config"],
    ["go.mod", "config"],
    ["CMakeLists.txt", "config"],
  ] as const)("%s is %s", (path, role) => {
    expect(classifyRole(path)).toBe(role);
  });
});

describe("computeSize / formatSize", () => {
  it("splits exact line counts by role and counts skipped noise", () => {
    const size = computeSize(
      [file("src/a.ts", ["+x", "+y", "-z"]), file("test/a.test.ts", ["+t"]), file("README.md", ["-old", "+new"])],
      [{ path: "package-lock.json", reason: "lockfile", added: 100, deleted: 50 }],
    );
    expect(size.total).toEqual({ files: 4, added: 104, deleted: 52 });
    expect(size.roles.source).toEqual({ files: 1, added: 2, deleted: 1 });
    expect(formatSize(size)).toBe(
      "4 files, +104/−52. Logic: +2/−1 in 1 file. Tests: +1/−0 in 1 file. Config: none. " +
        "Docs: +1/−1 in 1 file. Noise (skipped): +100/−50 in 1 file",
    );
  });
});

describe("orderForReading", () => {
  it("puts source first, then tests, config, docs, biggest change first within a role", () => {
    const ordered = orderForReading([
      file("README.md", ["+a"]),
      file("test/x.test.ts", ["+a"]),
      file("src/small.ts", ["+a"]),
      file("package.json", ["+a"]),
      file("src/big.ts", ["+a", "+b", "+c"]),
    ]);
    expect(ordered.map((f) => f.path)).toEqual([
      "src/big.ts",
      "src/small.ts",
      "test/x.test.ts",
      "package.json",
      "README.md",
    ]);
  });
});

describe("testNames", () => {
  it("finds pytest, Go, JS, and GoogleTest names in added lines", () => {
    const f = file("tests/t.py", [
      "+def test_abort(runner):",
      "+    async def test_async():",
      "+func TestServer(t *testing.T) {",
      '+  it("parses renames", () => {',
      "+  test.each([1])('runs %s', (n) => {",
      "+TEST_F(Parser, HandlesEmpty) {",
      " def test_unchanged():",
    ]);
    expect(testNames(f)).toEqual(["test_abort", "test_async", "TestServer", "parses renames", "runs %s", "HandlesEmpty"]);
  });
});

describe("touchedSymbols", () => {
  it("reads the function context git puts after the hunk header", () => {
    expect(touchedSymbols(file("a.py", ["+x"], "@@ -10,2 +10,3 @@ def main(self):"))).toEqual(["def main(self):"]);
  });
});

describe("renderContext", () => {
  const base = {
    base: "main",
    baseRef: "origin/main",
    mergeBase: "1111111aaaa",
    head: "2222222bbbb",
    commits: ["2222222 Ada Add retries"],
    skipped: [{ path: "package-lock.json", reason: "lockfile" as const, added: 10, deleted: 2 }],
  };

  it("renders size, commits, skipped noise, and fenced diffs", () => {
    const files = [file("src/a.ts", ["+x"])];
    const md = renderContext({ ...base, files, size: computeSize(files, base.skipped) });
    expect(md).toContain("**Compared:** origin/main (merge base 1111111) → HEAD 2222222");
    expect(md).toContain("- 2222222 Ada Add retries");
    expect(md).toContain("- `package-lock.json` (lockfile, +10/−2)");
    expect(md).toContain("### src/a.ts (source, modified, +1/−0)");
    expect(md).toContain("```diff\n@@ -1,1 +1,1 @@\n+x\n```");
  });

  it("uses a longer fence when the diff itself contains backticks", () => {
    const files = [file("README.md", ["+```js", "+code", "+```"])];
    const md = renderContext({ ...base, files, size: computeSize(files, []) });
    expect(md).toContain("````diff\n");
  });

  it("collapses a large test diff to its test names", () => {
    const lines = ["+def test_one():", ...Array.from({ length: 70 }, () => "+    assert x"), "+def test_two():"];
    const files = [file("tests/test_big.py", lines)];
    const md = renderContext({ ...base, files, size: computeSize(files, []) });
    expect(md).toContain("Collapsed: 2 tests added or changed");
    expect(md).toContain("- `test_one`");
    expect(md).not.toContain("assert x");
  });
});
