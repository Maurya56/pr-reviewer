// Phase 1: cluster related hunks and emit a compact context file for the review prompt.

import type { FileDiff, Hunk } from "./diff.js";
import type { FilterResult } from "./filter.js";

export interface HunkCluster {
  /** Short label, e.g. the shared symbol or directory. */
  label: string;
  hunks: { path: string; hunk: Hunk }[];
}

export interface ReviewContext {
  base: string;
  mergeBase: string;
  clusters: HunkCluster[];
  skipped: FilterResult["skipped"];
  stats: {
    rawDiffTokens: number;
    contextTokens: number;
  };
}

/**
 * Group related hunks (same symbol, same file area, or shared identifiers).
 * TODO(phase-1): start with simple heuristics (same file + nearby lines, shared identifiers).
 * Phase 2 replaces this with tree-sitter call-graph clustering.
 */
export function clusterHunks(_files: FileDiff[]): HunkCluster[] {
  throw new Error("clusterHunks: not implemented (Phase 1)");
}

/**
 * Render the context as compact markdown that prompts/review.md can consume.
 * TODO(phase-1): include the skipped-file list, clusters with minimal surrounding lines, and stats.
 */
export function renderContext(_context: ReviewContext): string {
  throw new Error("renderContext: not implemented (Phase 1)");
}

/**
 * Rough token estimate (~4 chars per token) used to report savings vs the raw diff.
 * TODO(phase-1): swap for a real tokenizer if the estimate proves too rough.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
