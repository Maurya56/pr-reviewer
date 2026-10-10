// Phase 2: find functions and the calls inside them with tree-sitter. Pure: source text in,
// symbols out. Git and file I/O live in callgraph.ts.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";

type Node = Parser.SyntaxNode;
export type SyntaxNode = Node;

export type Language = "python" | "typescript" | "tsx" | "javascript" | "go" | "c" | "cpp";

const EXTENSIONS: Record<string, Language> = {
  py: "python",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  go: "go",
  c: "c",
  // .h is usually shared with C++ code, and the C++ grammar parses plain C headers too.
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
};

export function languageFor(path: string): Language | undefined {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return path.includes(".") ? EXTENSIONS[ext] : undefined;
}

/** File extensions whose code can call into a file of the given language. */
export function callerExtensions(language: Language): string[] {
  const family: Language[] =
    language === "python" ? ["python"]
    : language === "go" ? ["go"]
    : language === "c" || language === "cpp" ? ["c", "cpp"]
    : ["typescript", "tsx", "javascript"];
  return Object.entries(EXTENSIONS)
    .filter(([, lang]) => family.includes(lang))
    .map(([ext]) => ext);
}

export interface FunctionSymbol {
  /** Bare name, as it appears at call sites: `main`. */
  name: string;
  /** Name with its class or receiver: `Command.main`, `A::f`, `(*Server).Handle`. */
  qualifiedName: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  /** Bare names of everything this function calls, in order of first call. */
  calls: string[];
}

const FUNCTION_TYPES: Record<Language, ReadonlySet<string>> = {
  python: new Set(["function_definition"]),
  typescript: new Set(["function_declaration", "generator_function_declaration", "method_definition", "variable_declarator"]),
  tsx: new Set(["function_declaration", "generator_function_declaration", "method_definition", "variable_declarator"]),
  javascript: new Set(["function_declaration", "generator_function_declaration", "method_definition", "variable_declarator"]),
  go: new Set(["function_declaration", "method_declaration"]),
  c: new Set(["function_definition"]),
  cpp: new Set(["function_definition"]),
};

const CLASS_TYPES = new Set(["class_definition", "class_declaration", "class", "class_specifier", "struct_specifier"]);
const CALL_TYPES = new Set(["call", "call_expression"]);
const FUNCTION_VALUES = new Set(["arrow_function", "function", "function_expression", "generator_function"]);

/** The name a function is defined under, or undefined for nodes that aren't really functions. */
function functionName(node: Node, language: Language): string | undefined {
  if (node.type === "variable_declarator") {
    // `const f = () => {}` and `const f = function () {}` define f; other variables don't count.
    const value = node.childForFieldName("value");
    return value && FUNCTION_VALUES.has(value.type) ? node.childForFieldName("name")?.text : undefined;
  }
  if (language === "c" || language === "cpp") return declaratorName(node.childForFieldName("declarator"));
  return node.childForFieldName("name")?.text;
}

/** Dig the name out of a C/C++ declarator: `int *A::f(int)` -> `A::f`. */
function declaratorName(node: Node | null): string | undefined {
  while (node) {
    if (["identifier", "field_identifier", "qualified_identifier", "destructor_name", "operator_name"].includes(node.type)) {
      return node.text;
    }
    node = node.childForFieldName("declarator");
  }
  return undefined;
}

/** Go method receiver type, e.g. `(s *Server)` -> `*Server`. */
function goReceiver(node: Node): string | undefined {
  const param = node.childForFieldName("receiver")?.namedChildren.find((c) => c.type === "parameter_declaration");
  return param?.childForFieldName("type")?.text;
}

/** The bare name being called: `obj.method(...)` -> `method`, `ns::f(...)` -> `f`. */
export function calleeName(call: Node): string | undefined {
  let fn = call.childForFieldName("function");
  while (fn) {
    switch (fn.type) {
      case "identifier":
      case "field_identifier":
      case "property_identifier":
        return fn.text;
      case "member_expression":
        fn = fn.childForFieldName("property");
        break;
      case "attribute":
        fn = fn.childForFieldName("attribute");
        break;
      case "selector_expression":
      case "field_expression":
        fn = fn.childForFieldName("field");
        break;
      case "qualified_identifier":
      case "template_function":
        fn = fn.childForFieldName("name");
        break;
      default:
        return undefined;
    }
  }
  return undefined;
}

function callsWithin(node: Node, language: Language): string[] {
  const names = new Set<string>();
  const visit = (n: Node) => {
    // Don't attribute calls inside a nested function definition to the outer function.
    if (n !== node && FUNCTION_TYPES[language].has(n.type) && functionName(n, language)) return;
    if (CALL_TYPES.has(n.type)) {
      const name = calleeName(n);
      if (name) names.add(name);
    }
    for (const child of n.namedChildren) visit(child);
  };
  visit(node);
  return [...names];
}

/** Every function (and method) defined in a parsed file. */
export function extractFunctions(root: Node, language: Language): FunctionSymbol[] {
  const found: FunctionSymbol[] = [];
  const visit = (node: Node, scope: string[]) => {
    if (CLASS_TYPES.has(node.type)) {
      const className = node.childForFieldName("name")?.text;
      for (const child of node.namedChildren) visit(child, className ? [...scope, className] : scope);
      return;
    }
    const name = FUNCTION_TYPES[language].has(node.type) ? functionName(node, language) : undefined;
    if (name) {
      const receiver = node.type === "method_declaration" ? goReceiver(node) : undefined;
      const qualifiedName = receiver ? `(${receiver}).${name}` : [...scope, name].join(language === "cpp" ? "::" : ".");
      found.push({
        name: name.includes("::") ? name.slice(name.lastIndexOf("::") + 2) : name,
        qualifiedName,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        calls: callsWithin(node, language),
      });
    }
    for (const child of node.namedChildren) visit(child, scope);
  };
  visit(root, []);
  return found;
}

/** Lines (1-based) where `name` is called, with the innermost enclosing function. */
export function findCallSites(
  root: Node,
  language: Language,
  name: string,
): { line: number; enclosing?: string }[] {
  const functions = extractFunctions(root, language);
  const sites: { line: number; enclosing?: string }[] = [];
  const visit = (n: Node) => {
    if (CALL_TYPES.has(n.type) && calleeName(n) === name) {
      const line = n.startPosition.row + 1;
      // Innermost function containing the line: the one with the latest start.
      const enclosing = functions
        .filter((f) => f.startLine <= line && line <= f.endLine)
        .sort((a, b) => b.startLine - a.startLine)[0];
      sites.push({ line, enclosing: enclosing?.qualifiedName });
    }
    for (const child of n.namedChildren) visit(child);
  };
  visit(root);
  return sites;
}

// --- Parser loading -----------------------------------------------------------------------------

let ready: Promise<void> | undefined;
const languages = new Map<Language, Promise<Parser.Language>>();

/** Grammar files live in `grammars/` (copied at build time) or in the tree-sitter-wasms dev package. */
function grammarPath(language: Language): string {
  const file = `tree-sitter-${language}.wasm`;
  const bundled = fileURLToPath(new URL(`../grammars/${file}`, import.meta.url));
  if (existsSync(bundled)) return bundled;
  const require = createRequire(import.meta.url);
  return require.resolve(`tree-sitter-wasms/out/${file}`);
}

export async function parse(source: string, language: Language): Promise<Node> {
  ready ??= Parser.init();
  await ready;
  let lang = languages.get(language);
  if (!lang) {
    lang = Parser.Language.load(grammarPath(language));
    languages.set(language, lang);
  }
  const parser = new Parser();
  parser.setLanguage(await lang);
  return parser.parse(source).rootNode;
}
