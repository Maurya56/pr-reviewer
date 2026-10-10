// Copy only the tree-sitter grammars pr-reviewer parses into grammars/, so the published package
// carries ~12 MB instead of the ~52 MB tree-sitter-wasms dev dependency. Runs after `tsc` in `build`.

import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const LANGUAGES = ["python", "typescript", "tsx", "javascript", "go", "c", "cpp"];
const require = createRequire(import.meta.url);
const out = new URL("../grammars/", import.meta.url);

mkdirSync(out, { recursive: true });
for (const lang of LANGUAGES) {
  const file = `tree-sitter-${lang}.wasm`;
  copyFileSync(require.resolve(`tree-sitter-wasms/out/${file}`), new URL(file, out));
}
console.log(`copied ${LANGUAGES.length} grammars to grammars/`);
