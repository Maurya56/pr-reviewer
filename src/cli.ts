#!/usr/bin/env node
// Entry point: `npx pr-reviewer context [--base <branch>] [--out <file>]`.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const USAGE = `Usage: pr-reviewer context [--base <branch>] [--out <file>]

Commands:
  context   Build a compact review context from the current branch's diff (Phase 1, not yet implemented)

Options:
  --base    Base branch to diff against (default: main)
  --out     Output file (default: .pr-reviewer/context.md)
  -h, --help`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      base: { type: "string", default: "main" },
      out: { type: "string", default: ".pr-reviewer/context.md" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const [command] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return 0;
  }

  if (command === "context") {
    // TODO(phase-1): getRawDiff -> parseDiff -> filterFiles -> clusterHunks -> renderContext,
    // write to values.out, and print raw vs context token counts.
    console.error(`pr-reviewer context: not implemented yet (base=${values.base}, out=${values.out})`);
    return 1;
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
