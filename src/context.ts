// Phase 1: order the signal files for reading, compute exact size numbers, and render a compact
// context file that prompts/review.md consumes instead of making the model run git itself.

import type { ChangedFunction } from "./callgraph.js";
import type { FileDiff } from "./diff.js";
import { countChanges, type SkippedFile } from "./filter.js";

export type FileRole = "source" | "test" | "config" | "docs";

/** Reading order: the code that does the work first, then what checks it, then the rest. */
export const ROLE_ORDER: readonly FileRole[] = ["source", "test", "config", "docs"];

const TEST_PATH =
  /(^|\/)(tests?|__tests__|spec|specs)\/|\.(test|spec)\.[^/]+$|_test\.(go|py|rb|exs?)$|(^|\/)test_[^/]+\.py$|_spec\.rb$/;
// Named build/config files are checked before docs, so `CMakeLists.txt` isn't mistaken for docs.
const CONFIG_NAME = /(^|\/)(Dockerfile|Makefile|CMakeLists\.txt|requirements[^/]*\.txt|Gemfile|Pipfile|go\.mod|setup\.py|tsconfig[^/]*)$/;
const DOCS_PATH = /\.(md|mdx|rst|adoc|txt)$|(^|\/)(docs?|LICENSE|LICENCE|CHANGELOG|CHANGES|AUTHORS)(\/|\.|$)/i;
const CONFIG_PATH =
  /\.(json|jsonc|ya?ml|toml|ini|cfg|conf|properties|xml|lock)$|(^|\/)\.[^/]+$|(^|\/)(\.github|\.circleci|\.vscode)\//;

export function classifyRole(path: string): FileRole {
  if (TEST_PATH.test(path)) return "test";
  if (CONFIG_NAME.test(path)) return "config";
  if (DOCS_PATH.test(path)) return "docs";
  if (CONFIG_PATH.test(path)) return "config";
  return "source";
}

export interface LineStats {
  files: number;
  added: number;
  deleted: number;
}

export interface SizeStats {
  total: LineStats;
  roles: Record<FileRole, LineStats>;
  noise: LineStats;
}

const emptyStats = (): LineStats => ({ files: 0, added: 0, deleted: 0 });

function addTo(stats: LineStats, change: { added: number; deleted: number }): void {
  stats.files++;
  stats.added += change.added;
  stats.deleted += change.deleted;
}

export function computeSize(signal: FileDiff[], skipped: SkippedFile[]): SizeStats {
  const size: SizeStats = {
    total: emptyStats(),
    roles: { source: emptyStats(), test: emptyStats(), config: emptyStats(), docs: emptyStats() },
    noise: emptyStats(),
  };
  for (const file of signal) {
    const change = countChanges(file);
    addTo(size.total, change);
    addTo(size.roles[classifyRole(file.path)], change);
  }
  for (const file of skipped) {
    addTo(size.total, file);
    addTo(size.noise, file);
  }
  return size;
}

/** Source first, then tests, config, docs; within a role, the biggest change first. */
export function orderForReading(files: FileDiff[]): FileDiff[] {
  const weight = (f: FileDiff) => {
    const { added, deleted } = countChanges(f);
    return added + deleted;
  };
  return [...files].sort(
    (a, b) =>
      ROLE_ORDER.indexOf(classifyRole(a.path)) - ROLE_ORDER.indexOf(classifyRole(b.path)) || weight(b) - weight(a),
  );
}

export interface ReviewContext {
  /** The base branch as given, e.g. "main". */
  base: string;
  /** The ref actually compared against, e.g. "origin/main". */
  baseRef: string;
  mergeBase: string;
  head: string;
  commits: string[];
  /** Signal files, in reading order. */
  files: FileDiff[];
  skipped: SkippedFile[];
  size: SizeStats;
  /** Phase 2: changed functions with callers and callees. Undefined when not computed. */
  functions?: ChangedFunction[];
}

const short = (sha: string) => sha.slice(0, 7);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function formatStats(label: string, s: LineStats): string {
  return s.files === 0 ? `${label}: none` : `${label}: +${s.added}/−${s.deleted} in ${plural(s.files, "file")}`;
}

export function formatSize(size: SizeStats): string {
  const { total, roles, noise } = size;
  return [
    `${plural(total.files, "file")}, +${total.added}/−${total.deleted}`,
    formatStats("Logic", roles.source),
    formatStats("Tests", roles.test),
    formatStats("Config", roles.config),
    formatStats("Docs", roles.docs),
    formatStats("Noise (skipped)", noise),
  ].join(". ");
}

/** Function or class names git reports in hunk headers (`@@ ... @@ def main(self):`). */
export function touchedSymbols(file: FileDiff): string[] {
  const names = new Set<string>();
  for (const hunk of file.hunks) {
    const context = hunk.header.replace(/^@@[^@]*@@\s*/, "").trim();
    if (context) names.add(context.length > 80 ? `${context.slice(0, 77)}...` : context);
  }
  return [...names];
}

function describeFile(file: FileDiff): string {
  const { added, deleted } = countChanges(file);
  const parts: string[] = [classifyRole(file.path), file.status];
  if (file.status === "renamed") parts.push(`from ${file.oldPath} (${file.similarity ?? "?"}% similar)`);
  parts.push(file.binary ? "binary, no text diff" : `+${added}/−${deleted}`);
  return `### ${file.path} (${parts.join(", ")})`;
}

/** Test diffs bigger than this many changed lines are collapsed to their test names. */
export const COLLAPSE_TESTS_OVER = 60;

const TEST_NAME =
  /^\+\s*(?:async\s+)?def\s+(test_\w+)|^\+\s*func\s+(Test\w+)|^\+\s*(?:it|test|describe)(?:\.\w+(?:\(.*?\))?)?\(\s*["'`](.+?)["'`]|^\+\s*(?:TEST|TEST_F|TEST_P)\(\s*\w+\s*,\s*(\w+)/;

/** Names of tests added or changed in a file's diff. */
export function testNames(file: FileDiff): string[] {
  const names: string[] = [];
  for (const line of file.hunks.flatMap((h) => h.lines)) {
    const m = TEST_NAME.exec(line);
    const name = m?.slice(1).find((g) => g !== undefined);
    if (name) names.push(name);
  }
  return names;
}

/** A code fence longer than any backtick run inside the content, so the diff can't close it early. */
function fenceFor(content: string): string {
  const longest = Math.max(2, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(longest + 1);
}

/** The "Changed functions" section: what each changed function is called by and calls. */
export function renderFunctions(functions: ChangedFunction[]): string[] {
  if (functions.length === 0) return [];
  const changedNames = new Set(functions.map((f) => f.name));
  const out = [
    "## Changed functions (tree-sitter)",
    "",
    "Callers are matched by name across the repo (tests excluded), so a common name can include",
    "unrelated functions. Use this for the Blast radius instead of searching yourself.",
    "",
  ];
  for (const fn of functions) {
    out.push(`- \`${fn.qualifiedName}\` (${fn.change}) \`${fn.path}:${fn.startLine}-${fn.endLine}\``);
    if (fn.callerCount === 0) {
      out.push(fn.change === "removed" ? "  - No remaining callers." : "  - No callers found.");
    } else {
      const lead = fn.change === "removed" ? "Still called from" : "Called from";
      const more = fn.callerCount > fn.callers.length ? ` (showing ${fn.callers.length})` : "";
      out.push(`  - ${lead} ${plural(fn.callerCount, "place")}${more}:`);
      for (const c of fn.callers) {
        const where = c.enclosing ? `\`${c.enclosing}\` ` : "";
        const note = c.fileChanged ? "" : ", file not changed in this PR";
        out.push(`    - ${where}(\`${c.path}:${c.line}\`${note})`);
      }
    }
    if (fn.mentionCount > 0) {
      out.push(`  - Also named ${plural(fn.mentionCount, "time")} without a direct call (imports, passed as a value, comments).`);
    }
    if (fn.change !== "removed" && fn.calls.length > 0) {
      const calls = fn.calls.slice(0, 15).map((c) => `\`${c}\`${changedNames.has(c) ? " (changed in this PR)" : ""}`);
      out.push(`  - Calls: ${calls.join(", ")}${fn.calls.length > 15 ? ", ..." : ""}`);
    }
  }
  out.push("");
  return out;
}

/** Render the context as compact markdown for prompts/review.md. */
export function renderContext(ctx: ReviewContext): string {
  const out: string[] = [
    "# Review context",
    "",
    "Generated by `pr-reviewer context`. The numbers are exact: use them as-is.",
    "",
    `- **Compared:** ${ctx.baseRef} (merge base ${short(ctx.mergeBase)}) → HEAD ${short(ctx.head)}`,
    `- **Size:** ${formatSize(ctx.size)}.`,
    "",
    `## Commits (${ctx.commits.length})`,
    ...ctx.commits.map((c) => `- ${c}`),
    "",
  ];

  if (ctx.skipped.length > 0) {
    out.push("## Skipped noise (not shown below)");
    for (const s of ctx.skipped) out.push(`- \`${s.path}\` (${s.reason}, +${s.added}/−${s.deleted})`);
    out.push("");
  }

  out.push(...renderFunctions(ctx.functions ?? []));

  out.push("## Diff, in reading order", "");
  for (const file of ctx.files) {
    out.push(describeFile(file));
    const symbols = touchedSymbols(file);
    if (symbols.length > 0) out.push(`Near: ${symbols.map((s) => `\`${s}\``).join(", ")}`);
    const { added, deleted } = countChanges(file);
    const names = classifyRole(file.path) === "test" ? testNames(file) : [];
    if (added + deleted > COLLAPSE_TESTS_OVER && names.length > 0) {
      out.push(
        `Collapsed: ${plural(names.length, "test")} added or changed (read the file for details):`,
        ...names.map((n) => `- \`${n}\``),
      );
    } else if (file.hunks.length > 0) {
      const body = file.hunks.flatMap((h) => [h.header, ...h.lines]).join("\n");
      const fence = fenceFor(body);
      out.push(`${fence}diff`, body, fence);
    }
    out.push("");
  }
  return out.join("\n");
}

/**
 * Rough token estimate (~4 chars per token) used to report savings vs the raw diff.
 * Good enough for a ratio; swap for a real tokenizer if absolute numbers matter.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
