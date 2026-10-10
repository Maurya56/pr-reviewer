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
 * TODO(phase-1): handle renames, binary files, mode changes, and "\ No newline at end of file".
 */
export function parseDiff(_raw: string): FileDiff[] {
  throw new Error("parseDiff: not implemented (Phase 1)");
}
