// Phase 1: read the PR diff from git and parse it into files and hunks.

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export interface Hunk {
  /** Header line, e.g. "@@ -10,7 +10,9 @@ function foo()". */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Raw hunk body lines, each prefixed with " ", "+", or "-". */
  lines: string[];
}

export interface FileDiff {
  path: string;
  /** Previous path when status is "renamed". */
  oldPath?: string;
  status: ChangeStatus;
  /** Rename similarity (0-100), when status is "renamed". */
  similarity?: number;
  binary: boolean;
  hunks: Hunk[];
}

export interface DiffOptions {
  /** Base branch to diff against. Defaults to "main". */
  base?: string;
  /** Repository root. Defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Resolve the merge base between `base` and HEAD.
 * TODO(phase-1): run `git merge-base`, falling back to `origin/<base>`.
 */
export async function resolveMergeBase(_options: DiffOptions = {}): Promise<string> {
  throw new Error("resolveMergeBase: not implemented (Phase 1)");
}

/**
 * Get the raw unified diff for the PR (merge-base...HEAD).
 * TODO(phase-1): run `git diff -M --no-color <merge-base>...HEAD`.
 */
export async function getRawDiff(_options: DiffOptions = {}): Promise<string> {
  throw new Error("getRawDiff: not implemented (Phase 1)");
}

/**
 * Parse a unified diff into per-file hunks.
 * Expects `git diff` output with `a/` and `b/` prefixes (getRawDiff forces them).
 */
export function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = raw.split("\n");
  let file: FileDiff | undefined;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("diff --git ")) {
      file = { path: "", status: "modified", binary: false, hunks: [] };
      const paths = parseGitHeaderPaths(line.slice("diff --git ".length));
      if (paths) {
        file.oldPath = paths.oldPath;
        file.path = paths.newPath;
      }
      files.push(file);
      i++;
      continue;
    }

    if (!file) {
      i++;
      continue;
    }

    if (line.startsWith("@@")) {
      const hunk = parseHunkHeader(line);
      i++;
      if (!hunk) continue;
      let oldLeft = hunk.oldLines;
      let newLeft = hunk.newLines;
      while (i < lines.length && (oldLeft > 0 || newLeft > 0)) {
        // An empty line inside a hunk is a blank context line whose leading space was stripped.
        const body = lines[i] || " ";
        const kind = body.charAt(0);
        if (kind === "\\") {
          i++;
          continue;
        }
        if (kind !== " " && kind !== "+" && kind !== "-") break;
        if (kind !== "+") oldLeft--;
        if (kind !== "-") newLeft--;
        hunk.lines.push(body);
        i++;
      }
      // "\ No newline at end of file" can follow the last line of a hunk.
      while (i < lines.length && lines[i]?.startsWith("\\")) i++;
      file.hunks.push(hunk);
      continue;
    }

    if (line.startsWith("new file mode")) file.status = "added";
    else if (line.startsWith("deleted file mode")) file.status = "deleted";
    else if (line.startsWith("similarity index ")) file.similarity = parseInt(line.slice(17), 10);
    else if (line.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = unquotePath(line.slice("rename from ".length));
    } else if (line.startsWith("rename to ")) {
      file.status = "renamed";
      file.path = unquotePath(line.slice("rename to ".length));
    } else if (line.startsWith("Binary files ") || line === "GIT binary patch") file.binary = true;
    else if (line.startsWith("--- ")) {
      const path = stripPrefix(unquotePath(trimTab(line.slice(4))), "a/");
      if (path !== undefined) file.oldPath = path;
    } else if (line.startsWith("+++ ")) {
      const path = stripPrefix(unquotePath(trimTab(line.slice(4))), "b/");
      if (path !== undefined) file.path = path;
    }
    i++;
  }

  for (const f of files) {
    if (f.status === "deleted" && f.oldPath !== undefined) f.path = f.oldPath;
    if (f.status !== "renamed") delete f.oldPath;
  }
  return files;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseHunkHeader(header: string): Hunk | undefined {
  const m = HUNK_HEADER.exec(header);
  if (!m) return undefined;
  return {
    header,
    oldStart: Number(m[1]),
    oldLines: m[2] === undefined ? 1 : Number(m[2]),
    newStart: Number(m[3]),
    newLines: m[4] === undefined ? 1 : Number(m[4]),
    lines: [],
  };
}

/** Paths from `a/<old> b/<new>`. Unquoted paths with spaces are only unambiguous when equal. */
function parseGitHeaderPaths(rest: string): { oldPath: string; newPath: string } | undefined {
  const quoted = /^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|\S+)$/.exec(rest);
  if (quoted) {
    const oldPath = stripPrefix(unquotePath(quoted[1] ?? ""), "a/");
    const newPath = stripPrefix(unquotePath(quoted[2] ?? ""), "b/");
    if (oldPath !== undefined && newPath !== undefined) return { oldPath, newPath };
  }
  const same = /^a\/(.+) b\/\1$/.exec(rest)?.[1];
  if (same !== undefined) return { oldPath: same, newPath: same };
  return undefined;
}

/** `/dev/null` (and anything without the expected prefix) yields undefined. */
function stripPrefix(path: string, prefix: string): string | undefined {
  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

/** Git appends a tab after `---`/`+++` paths that contain spaces. */
function trimTab(path: string): string {
  return path.endsWith("\t") ? path.slice(0, -1) : path;
}

const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/** Undo git's C-style path quoting, e.g. `"a/\303\274.txt"` -> `a/ü.txt`. */
export function unquotePath(path: string): string {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) return path;
  const bytes: number[] = [];
  const body = path.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const ch = body.charAt(i);
    if (ch !== "\\") {
      bytes.push(...Buffer.from(ch, "utf8"));
      continue;
    }
    const next = body.charAt(i + 1);
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}
