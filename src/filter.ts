// Phase 1: drop noise (lockfiles, generated code, pure renames, formatting) before the LLM sees it.
// Keep NOISE_PATTERNS in sync with the noise list in prompts/review.md.

import type { FileDiff, Hunk } from "./diff.js";

export type NoiseReason = "lockfile" | "generated" | "snapshot" | "rename-only" | "formatting-only";

export interface NoisePattern {
  pattern: RegExp;
  reason: NoiseReason;
}

export const NOISE_PATTERNS: readonly NoisePattern[] = [
  {
    pattern:
      /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|go\.sum|composer\.lock)$/,
    reason: "lockfile",
  },
  { pattern: /(^|\/)(dist|build|out|vendor)\//, reason: "generated" },
  { pattern: /\.(min\.js|map)$|\.pb\.go$|_pb2\.py$|\.generated\./, reason: "generated" },
  { pattern: /(^|\/)__snapshots__\/|\.snap$/, reason: "snapshot" },
];

/** Return the noise reason for a path, or undefined if the path is signal. */
export function classifyPath(path: string): NoiseReason | undefined {
  return NOISE_PATTERNS.find(({ pattern }) => pattern.test(path))?.reason;
}

export interface FilterResult {
  signal: FileDiff[];
  skipped: { path: string; reason: NoiseReason }[];
}

/**
 * Split files into signal and skipped noise.
 * TODO(phase-1): also skip rename-only files (similarity 100, no hunks) and
 * formatting-only files (every hunk is whitespace-only; see isFormattingOnlyHunk).
 */
export function filterFiles(_files: FileDiff[]): FilterResult {
  throw new Error("filterFiles: not implemented (Phase 1)");
}

/**
 * True if a hunk only changes whitespace.
 * TODO(phase-1): compare removed and added lines with all whitespace stripped.
 */
export function isFormattingOnlyHunk(_hunk: Hunk): boolean {
  throw new Error("isFormattingOnlyHunk: not implemented (Phase 1)");
}
