import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContext, parseCliArgs, sizeChange } from "../src/cli.js";

describe("sizeChange", () => {
  it("reports savings, and growth honestly when the call graph outweighs a small diff", () => {
    expect(sizeChange(1000, 640)).toBe("36% smaller");
    expect(sizeChange(1000, 2010)).toBe("2.0× larger: call graph added");
    expect(sizeChange(0, 0)).toBe("0% smaller");
  });
});

describe("parseCliArgs", () => {
  it("uses defaults", () => {
    expect(parseCliArgs(["context"])).toEqual({
      command: "context",
      base: "main",
      out: ".pr-reviewer/out/context.md",
      stdout: false,
      help: false,
    });
  });

  it("accepts --flag value, --flag=value, booleans, and -h", () => {
    expect(parseCliArgs(["context", "--base", "develop", "--out=ctx.md", "--stdout", "-h"])).toMatchObject({
      command: "context",
      base: "develop",
      out: "ctx.md",
      stdout: true,
      help: true,
    });
  });

  it("rejects unknown options, missing values, and extra arguments", () => {
    expect(() => parseCliArgs(["context", "--nope"])).toThrow("Unknown option: --nope");
    expect(() => parseCliArgs(["context", "--base"])).toThrow("--base needs a value");
    expect(() => parseCliArgs(["context", "--base", "--stdout"])).toThrow("--base needs a value");
    expect(() => parseCliArgs(["context", "extra"])).toThrow("Unexpected argument: extra");
  });
});

// End to end against a real throwaway repo: a feature branch with logic, a test, and a lockfile.
describe("buildContext", () => {
  let repo: string;
  const run = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repo,
      env: { ...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "a@x", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "a@x" },
    });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "pr-reviewer-"));
    run("init", "-q", "-b", "main");
    writeFileSync(join(repo, "app.py"), "def total(xs):\n    return sum(xs)\n");
    writeFileSync(join(repo, "package-lock.json"), "{}\n");
    run("add", "-A");
    run("commit", "-qm", "base");
    run("switch", "-qc", "feature");
    writeFileSync(join(repo, "app.py"), "def total(xs):\n    return sum(x for x in xs if x > 0)\n");
    writeFileSync(join(repo, "test_app.py"), "def test_total():\n    assert total([1, -1]) == 1\n");
    writeFileSync(join(repo, "package-lock.json"), '{"lockfileVersion": 3}\n');
    run("add", "-A");
    run("commit", "-qm", "Ignore negative values in total");
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("builds a context with exact sizes, the commit, skipped noise, and source first", async () => {
    const { markdown } = await buildContext("main", repo);
    expect(markdown).toContain("**Size:** 3 files, +4/−2. Logic: +1/−1 in 1 file. Tests: +2/−0 in 1 file.");
    expect(markdown).toContain("Ada Ignore negative values in total");
    expect(markdown).toContain("- `package-lock.json` (lockfile, +1/−1)");
    expect(markdown.indexOf("### app.py")).toBeLessThan(markdown.indexOf("### test_app.py"));
    expect(markdown).not.toContain("lockfileVersion");
  });

  it("fails clearly when the base branch doesn't exist", async () => {
    await expect(buildContext("nope", repo)).rejects.toThrow("neither origin/nope nor nope exists");
  });
});
