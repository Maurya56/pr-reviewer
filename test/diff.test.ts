import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDiff, unquotePath, type FileDiff } from "../src/diff.js";

// Real `git diff -M` output covering added, deleted, binary, renamed, mode-only, and quoted paths.
// Regenerate with a throwaway repo if git's output format ever changes.
const fixture = readFileSync(new URL("./fixtures/edge-cases.diff", import.meta.url), "utf8");

describe("parseDiff on real git output", () => {
  const files = parseDiff(fixture);
  const byPath = (path: string): FileDiff => {
    const file = files.find((f) => f.path === path);
    if (!file) throw new Error(`no file ${path} in ${files.map((f) => f.path).join(", ")}`);
    return file;
  };

  it("finds every file in order", () => {
    expect(files.map((f) => f.path)).toEqual([
      "added.txt",
      "blankctx.txt",
      "deleted.txt",
      "image.bin",
      "modified.txt",
      "nonl.txt",
      "rename_edit_new.txt",
      "rename_pure_new.txt",
      "script.sh",
      "with space.txt",
      "ünï.txt",
    ]);
  });

  it("parses an added file", () => {
    const f = byPath("added.txt");
    expect(f.status).toBe("added");
    expect(f.oldPath).toBeUndefined();
    expect(f.hunks).toHaveLength(1);
    expect(f.hunks[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2 });
    expect(f.hunks[0]?.lines).toEqual(["+brand new", "+file"]);
  });

  it("parses a deleted file, keeping its path and the omitted ',1' count", () => {
    const f = byPath("deleted.txt");
    expect(f.status).toBe("deleted");
    expect(f.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 1, newStart: 0, newLines: 0 });
    expect(f.hunks[0]?.lines).toEqual(["-keep"]);
  });

  it("marks binary files and gives them no hunks", () => {
    const f = byPath("image.bin");
    expect(f).toMatchObject({ status: "modified", binary: true, hunks: [] });
  });

  it("parses multiple hunks with section headers", () => {
    const f = byPath("modified.txt");
    expect(f.hunks).toHaveLength(2);
    expect(f.hunks[1]).toMatchObject({
      header: "@@ -11,5 +11,6 @@ ten",
      oldStart: 11,
      oldLines: 5,
      newStart: 11,
      newLines: 6,
    });
    expect(f.hunks[1]?.lines).toEqual([
      " eleven",
      " twelve",
      " thirteen",
      "-fourteen",
      "+FOURTEEN",
      " fifteen",
      "+sixteen",
    ]);
  });

  it("keeps a blank context line", () => {
    expect(byPath("blankctx.txt").hunks[0]?.lines).toEqual([" a", " ", "-b", "+B"]);
  });

  it("drops '\\ No newline at end of file' markers", () => {
    expect(byPath("nonl.txt").hunks[0]?.lines).toEqual(["-no newline", "+no newline changed"]);
  });

  it("parses a rename with edits", () => {
    const f = byPath("rename_edit_new.txt");
    expect(f).toMatchObject({ status: "renamed", oldPath: "rename_edit_old.txt", similarity: 90 });
    expect(f.hunks).toHaveLength(1);
  });

  it("parses a pure rename with no hunks", () => {
    const f = byPath("rename_pure_new.txt");
    expect(f).toMatchObject({ status: "renamed", oldPath: "rename_pure_old.txt", similarity: 100, hunks: [] });
  });

  it("treats a mode-only change as modified with no hunks", () => {
    expect(byPath("script.sh")).toMatchObject({ status: "modified", binary: false, hunks: [] });
  });

  it("handles paths with spaces (git appends a tab on ---/+++ lines)", () => {
    expect(byPath("with space.txt").hunks[0]?.lines).toEqual(["-x", "+y"]);
  });

  it("decodes octal-quoted non-ASCII paths", () => {
    expect(byPath("ünï.txt").status).toBe("modified");
  });
});

describe("parseDiff edge cases", () => {
  it("returns no files for empty input", () => {
    expect(parseDiff("")).toEqual([]);
  });

  it("treats a fully empty line inside a hunk as context (editor-stripped whitespace)", () => {
    const raw = ["diff --git a/f b/f", "--- a/f", "+++ b/f", "@@ -1,3 +1,3 @@", " a", "", "-b", "+c"].join("\n");
    expect(parseDiff(raw)[0]?.hunks[0]?.lines).toEqual([" a", " ", "-b", "+c"]);
  });

  it("does not mistake added lines that look like diff headers for new files", () => {
    const raw = [
      "diff --git a/notes.md b/notes.md",
      "--- a/notes.md",
      "+++ b/notes.md",
      "@@ -0,0 +1,2 @@",
      "+diff --git a/x b/x",
      "+@@ -1 +1 @@",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0]?.hunks[0]?.lines).toEqual(["+diff --git a/x b/x", "+@@ -1 +1 @@"]);
  });

  it("parses a quoted rename", () => {
    const raw = [
      'diff --git "a/old\\tname" "b/new \\"name\\""',
      "similarity index 100%",
      'rename from "old\\tname"',
      'rename to "new \\"name\\""',
    ].join("\n");
    expect(parseDiff(raw)[0]).toMatchObject({ status: "renamed", oldPath: "old\tname", path: 'new "name"' });
  });
});

describe("unquotePath", () => {
  it.each([
    ["plain.txt", "plain.txt"],
    ['"a/\\303\\274.txt"', "a/ü.txt"],
    ['"tab\\there"', "tab\there"],
    ['"back\\\\slash"', "back\\slash"],
  ])("unquotes %s", (input, expected) => {
    expect(unquotePath(input)).toBe(expected);
  });
});
