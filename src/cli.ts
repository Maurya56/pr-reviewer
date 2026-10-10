#!/usr/bin/env node
// Entry point: `pr-reviewer context [--base <branch>] [--out <file> | --stdout]`.

import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { buildCallGraph, type ChangedFunction } from "./callgraph.js";
import { computeSize, estimateTokens, orderForReading, renderContext } from "./context.js";
import { getCommits, getRawDiff, git, parseDiff, resolveBaseRef } from "./diff.js";
import { filterFiles } from "./filter.js";

const USAGE = `Usage: pr-reviewer context [--base <branch>] [--out <file> | --stdout]

Commands:
  context   Build a compact review context from the current branch's diff: noise removed,
            files in reading order, exact size numbers.

Options:
  --base    Base branch to diff against (default: main; origin/<base> is preferred)
  --out     Output file (default: .pr-reviewer/out/context.md)
  --stdout  Print the context instead of writing a file
  -h, --help`;

export interface CliArgs {
  command?: string;
  base: string;
  out: string;
  stdout: boolean;
  help: boolean;
}

/**
 * Parse argv. Hand-rolled rather than `util.parseArgs`, which needs Node 18.3; the CLI supports
 * Node 14.18+. Accepts `--flag value`, `--flag=value`, and `-h`. Throws on unknown options.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { base: "main", out: ".pr-reviewer/out/context.md", stdout: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const eq = arg.indexOf("=");
    const name = arg.startsWith("--") && eq > 0 ? arg.slice(0, eq) : arg;
    const inline = arg.startsWith("--") && eq > 0 ? arg.slice(eq + 1) : undefined;
    const value = () => {
      if (inline !== undefined) return inline;
      const next = argv[++i];
      if (next === undefined || next.startsWith("-")) throw new Error(`${name} needs a value`);
      return next;
    };
    if (name === "--base") args.base = value();
    else if (name === "--out") args.out = value();
    else if (name === "--stdout") args.stdout = true;
    else if (name === "--help" || name === "-h") args.help = true;
    else if (name.startsWith("-")) throw new Error(`Unknown option: ${name}`);
    else if (args.command === undefined) args.command = name;
    else throw new Error(`Unexpected argument: ${name}`);
  }
  return args;
}

/** "36% smaller", or "2.0× larger: call graph added" when the context outgrows a small diff. */
export function sizeChange(rawTokens: number, contextTokens: number): string {
  if (rawTokens === 0 || contextTokens <= rawTokens) {
    return `${rawTokens === 0 ? 0 : Math.round((1 - contextTokens / rawTokens) * 100)}% smaller`;
  }
  return `${(contextTokens / rawTokens).toFixed(1)}× larger: call graph added`;
}

export interface ContextResult {
  markdown: string;
  rawTokens: number;
  contextTokens: number;
}

export async function buildContext(base: string, cwd?: string): Promise<ContextResult> {
  const baseRef = await resolveBaseRef({ base, cwd });
  const mergeBase = (await git(["merge-base", baseRef, "HEAD"], cwd)).trim();
  const [raw, commits, head] = await Promise.all([
    getRawDiff(mergeBase, cwd),
    getCommits(mergeBase, cwd),
    git(["rev-parse", "HEAD"], cwd).then((s) => s.trim()),
  ]);
  const all = parseDiff(raw);
  const { signal, skipped } = filterFiles(all);
  let functions: ChangedFunction[] | undefined;
  try {
    functions = await buildCallGraph(signal, mergeBase, new Set(all.map((f) => f.path)), { cwd });
  } catch (error) {
    // The call graph is extra context; never fail the whole command over it.
    console.error(`pr-reviewer: skipped call graph (${error instanceof Error ? error.message : String(error)})`);
  }
  const markdown = renderContext({
    base,
    baseRef,
    mergeBase,
    head,
    commits,
    files: orderForReading(signal),
    skipped,
    size: computeSize(signal, skipped),
    functions,
  });
  return { markdown, rawTokens: estimateTokens(raw), contextTokens: estimateTokens(markdown) };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let values: CliArgs;
  try {
    values = parseCliArgs(argv);
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 1;
  }

  const { command } = values;
  if (values.help || !command) {
    console.log(USAGE);
    return 0;
  }

  if (command === "context") {
    let result: ContextResult;
    try {
      result = await buildContext(values.base);
    } catch (error) {
      console.error(`pr-reviewer context: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
    const { markdown, rawTokens, contextTokens } = result;
    if (values.stdout) {
      process.stdout.write(markdown);
    } else {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, markdown);
      console.error(`Wrote ${values.out}`);
    }
    console.error(`Raw diff ~${rawTokens} tokens → context ~${contextTokens} tokens (${sizeChange(rawTokens, contextTokens)})`);
    return 0;
  }

  console.error(`Unknown command: ${command}\n\n${USAGE}`);
  return 1;
}

// Run only when executed directly, not when imported by tests.
// realpath resolves the symlink npm creates for the bin entry.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().then((code) => process.exit(code));
}
