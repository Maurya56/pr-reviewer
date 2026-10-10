import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCallGraph, changedLines, touchedFunctions } from "../src/callgraph.js";
import { getRawDiff, git, parseDiff } from "../src/diff.js";
import type { FunctionSymbol } from "../src/symbols.js";

describe("changedLines", () => {
  it("maps added lines to new numbering and deletions to both sides", () => {
    const { newLines, oldLines } = changedLines({
      path: "a.py",
      status: "modified",
      binary: false,
      hunks: [
        { header: "@@ -10,4 +10,4 @@", oldStart: 10, oldLines: 4, newStart: 10, newLines: 4, lines: [" a", "-b", "+B", " c", "-d", "+D"] },
      ],
    });
    expect([...newLines].sort((x, y) => x - y)).toEqual([11, 13]);
    expect([...oldLines].sort((x, y) => x - y)).toEqual([11, 13]);
  });
});

describe("touchedFunctions", () => {
  const fn = (qualifiedName: string, startLine: number, endLine: number): FunctionSymbol => ({
    name: qualifiedName,
    qualifiedName,
    startLine,
    endLine,
    calls: [],
  });

  it("credits a line to the innermost function only", () => {
    const outer = fn("outer", 1, 20);
    const inner = fn("inner", 5, 8);
    expect(touchedFunctions([outer, inner], new Set([6]))).toEqual([inner]);
    expect(touchedFunctions([outer, inner], new Set([6, 15]))).toEqual([outer, inner]);
  });
});

// A real repo: the PR changes `total`, adds `clamp`, and removes `legacy_sum`, which `report.py`
// still calls. That remaining caller is exactly what a reviewer must not miss.
describe("buildCallGraph", () => {
  let repo: string;
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  const run = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repo,
      env: { ...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "a@x", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "a@x" },
    });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "pr-reviewer-cg-"));
    run("init", "-q", "-b", "main");
    write("calc.py", "def total(xs):\n    return sum(xs)\n\n\ndef legacy_sum(xs):\n    return sum(xs)\n");
    write("app.py", "from calc import total\n\n\ndef handler(req):\n    return total(req.items)\n");
    write("report.py", "from calc import legacy_sum\n\n\ndef build(rows):\n    return legacy_sum(rows)\n");
    write("tests/test_calc.py", "from calc import total\n\n\ndef test_total():\n    assert total([1]) == 1\n");
    run("add", "-A");
    run("commit", "-qm", "base");
    run("switch", "-qc", "feature");
    write("calc.py", "def clamp(x):\n    return max(x, 0)\n\n\ndef total(xs):\n    return sum(clamp(x) for x in xs)\n");
    run("add", "-A");
    run("commit", "-qm", "Clamp negatives in total, drop legacy_sum");
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("finds removed, modified, and added functions with their callers", async () => {
    const mergeBase = (await git(["merge-base", "main", "HEAD"], repo)).trim();
    const files = parseDiff(await getRawDiff(mergeBase, repo));
    const graph = await buildCallGraph(files, mergeBase, new Set(files.map((f) => f.path)), { cwd: repo });

    // Removed first (a remaining caller is a likely break), then modified, then added.
    expect(graph.map((f) => [f.qualifiedName, f.change])).toEqual([
      ["legacy_sum", "removed"],
      ["total", "modified"],
      ["clamp", "added"],
    ]);

    const legacy = graph.find((f) => f.name === "legacy_sum");
    expect(legacy?.callers).toEqual([{ path: "report.py", line: 5, enclosing: "build", fileChanged: false }]);

    const total = graph.find((f) => f.name === "total");
    expect(total?.callers).toEqual([{ path: "app.py", line: 5, enclosing: "handler", fileChanged: false }]);
    expect(total?.calls).toEqual(["sum", "clamp"]);
    // `from calc import total` in app.py is a mention, not a call; the test file is excluded.
    expect(total?.mentionCount).toBe(1);

    const clamp = graph.find((f) => f.name === "clamp");
    expect(clamp?.callerCount).toBe(1);
    expect(clamp?.callers[0]).toMatchObject({ path: "calc.py", enclosing: "total", fileChanged: true });
  });
});
