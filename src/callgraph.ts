// Phase 2: for each function the PR changes, find its 1-hop callers and callees.
// Callers are matched by name (git grep, then confirmed as a real call by parsing), not by type,
// so a common name can match an unrelated function; the rendered context says so.

import { classifyRole } from "./context.js";
import { git, type FileDiff } from "./diff.js";
import {
  callerExtensions,
  extractFunctions,
  findCallSites,
  languageFor,
  parse,
  type FunctionSymbol,
  type Language,
  type SyntaxNode,
} from "./symbols.js";

type ParseCache = Map<string, Promise<SyntaxNode | undefined>>;

export interface Caller {
  path: string;
  line: number;
  /** The function the call sits in, if any. */
  enclosing?: string;
  /** True when the PR also changed the caller's file. */
  fileChanged: boolean;
}

export interface ChangedFunction {
  path: string;
  name: string;
  qualifiedName: string;
  change: "added" | "modified" | "removed";
  /** Line range in the new file (the old file for removed functions). */
  startLine: number;
  endLine: number;
  calls: string[];
  callers: Caller[];
  /** Total call sites found; more than `callers.length` when the list was capped. */
  callerCount: number;
  /** Other lines naming it without calling it: imports, passed as a value, comments. */
  mentionCount: number;
}

export interface CallGraphOptions {
  cwd?: string;
  maxFunctions?: number;
  maxCallers?: number;
  maxCallerFiles?: number;
}

/** Lines the PR touched: added lines in the new file, deleted lines in the old file. */
export function changedLines(file: FileDiff): { newLines: Set<number>; oldLines: Set<number> } {
  const newLines = new Set<number>();
  const oldLines = new Set<number>();
  for (const hunk of file.hunks) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        newLines.add(newLine++);
      } else if (line.startsWith("-")) {
        oldLines.add(oldLine++);
        // A deletion also touches whatever function now spans the point where it happened.
        newLines.add(Math.max(1, newLine));
      } else {
        oldLine++;
        newLine++;
      }
    }
  }
  return { newLines, oldLines };
}

/** Functions that own at least one touched line (innermost function only, so nesting isn't double-counted). */
export function touchedFunctions(functions: FunctionSymbol[], lines: Set<number>): FunctionSymbol[] {
  const owners = new Set<FunctionSymbol>();
  for (const line of lines) {
    const innermost = functions
      .filter((f) => f.startLine <= line && line <= f.endLine)
      .sort((a, b) => b.startLine - a.startLine)[0];
    if (innermost) owners.add(innermost);
  }
  return functions.filter((f) => owners.has(f));
}

async function showFile(ref: string, path: string, cwd?: string): Promise<string | undefined> {
  try {
    return await git(["show", `${ref}:${path}`], cwd);
  } catch {
    return undefined;
  }
}

async function functionsAt(ref: string, path: string, language: Language, cwd?: string): Promise<FunctionSymbol[]> {
  const source = await showFile(ref, path, cwd);
  return source === undefined ? [] : extractFunctions(await parse(source, language), language);
}

/** Changed, added, and removed functions in one file, without callers yet. */
async function functionsChangedIn(file: FileDiff, mergeBase: string, cwd?: string): Promise<ChangedFunction[]> {
  const language = languageFor(file.path);
  if (!language || file.binary) return [];
  const { newLines, oldLines } = changedLines(file);
  const [after, before] = await Promise.all([
    file.status === "deleted" ? [] : functionsAt("HEAD", file.path, language, cwd),
    file.status === "added" ? [] : functionsAt(mergeBase, file.oldPath ?? file.path, language, cwd),
  ]);
  const existedBefore = new Set(before.map((f) => f.qualifiedName));
  const existsAfter = new Set(after.map((f) => f.qualifiedName));
  const base = { path: file.path, callers: [], callerCount: 0, mentionCount: 0 };

  const changed: ChangedFunction[] = touchedFunctions(after, newLines).map((f) => ({
    ...base,
    ...f,
    change: existedBefore.has(f.qualifiedName) ? "modified" : "added",
  }));
  const removed: ChangedFunction[] = touchedFunctions(before, oldLines)
    .filter((f) => !existsAfter.has(f.qualifiedName))
    .map((f) => ({ ...base, ...f, change: "removed" }));
  return [...removed, ...changed];
}

/** Call sites of `fn` anywhere in the repo at HEAD, excluding calls from inside `fn` itself. */
async function findCallers(
  fn: ChangedFunction,
  changedPaths: Set<string>,
  options: Required<CallGraphOptions>,
  parseCache: ParseCache,
): Promise<{ callers: Caller[]; total: number; mentions: number }> {
  const none = { callers: [], total: 0, mentions: 0 };
  const language = languageFor(fn.path);
  if (!language) return none;
  let grep: string;
  try {
    const globs = callerExtensions(language).map((ext) => `*.${ext}`);
    grep = await git(["grep", "-n", "-w", "-F", "-e", fn.name, "HEAD", "--", ...globs], options.cwd);
  } catch {
    return none; // git grep exits 1 when nothing matches
  }
  // Lines look like `HEAD:path/to/file.py:42:code`.
  const hits = grep
    .split("\n")
    .map((line) => /^HEAD:(.+?):(\d+):/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ path: m[1] ?? "", line: Number(m[2]) }))
    .filter((hit) => classifyRole(hit.path) !== "test")
    .filter((hit) => !(hit.path === fn.path && hit.line === fn.startLine));
  const paths = [...new Set(hits.map((hit) => hit.path))].slice(0, options.maxCallerFiles);

  const callers: Caller[] = [];
  for (const path of paths) {
    const lang = languageFor(path);
    if (!lang) continue;
    let rootPromise = parseCache.get(path);
    if (!rootPromise) {
      rootPromise = showFile("HEAD", path, options.cwd).then((src) => (src === undefined ? undefined : parse(src, lang)));
      parseCache.set(path, rootPromise);
    }
    const root = await rootPromise;
    if (!root) continue;
    for (const site of findCallSites(root, lang, fn.name)) {
      const recursive = path === fn.path && fn.startLine <= site.line && site.line <= fn.endLine;
      if (!recursive) callers.push({ path, line: site.line, enclosing: site.enclosing, fileChanged: changedPaths.has(path) });
    }
  }
  const callLines = new Set(callers.map((c) => `${c.path}:${c.line}`));
  const inside = (hit: { path: string; line: number }) =>
    hit.path === fn.path && fn.startLine <= hit.line && hit.line <= fn.endLine;
  const mentions = hits.filter((hit) => !callLines.has(`${hit.path}:${hit.line}`) && !inside(hit)).length;
  return { callers: callers.slice(0, options.maxCallers), total: callers.length, mentions };
}

const CHANGE_PRIORITY = { removed: 0, modified: 1, added: 2 } as const;

/**
 * The PR's changed functions in source files, with callers and callees. Removed functions come
 * first (a remaining caller is a likely break), then modified, then added.
 */
export async function buildCallGraph(
  files: FileDiff[],
  mergeBase: string,
  changedPaths: Set<string>,
  options: CallGraphOptions = {},
): Promise<ChangedFunction[]> {
  const opts: Required<CallGraphOptions> = {
    cwd: options.cwd ?? process.cwd(),
    maxFunctions: options.maxFunctions ?? 8,
    maxCallers: options.maxCallers ?? 8,
    maxCallerFiles: options.maxCallerFiles ?? 40,
  };
  const sources = files.filter((f) => classifyRole(f.path) === "source");
  const perFile = await Promise.all(sources.map((f) => functionsChangedIn(f, mergeBase, opts.cwd)));
  const functions = perFile
    .flat()
    .sort((a, b) => CHANGE_PRIORITY[a.change] - CHANGE_PRIORITY[b.change])
    .slice(0, opts.maxFunctions);

  const parseCache: ParseCache = new Map();
  for (const fn of functions) {
    const { callers, total, mentions } = await findCallers(fn, changedPaths, opts, parseCache);
    fn.callers = callers;
    fn.callerCount = total;
    fn.mentionCount = mentions;
  }
  return functions;
}
