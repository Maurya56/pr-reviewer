import { describe, expect, it } from "vitest";
import {
  callerExtensions,
  compactName,
  extractFunctions,
  findCallSites,
  languageFor,
  parse,
  type Language,
} from "../src/symbols.js";

describe("compactName", () => {
  it("collapses whitespace and shortens long template arguments", () => {
    expect(compactName("formatter<Tuple, Char,\n    enable_if_t<fmt::is_tuple_like<Tuple>::value>>::parse")).toBe(
      "formatter<Tuple, Char, enable_…>::parse",
    );
  });

  it("leaves short templates, plain names, and operators alone", () => {
    expect(compactName("Book<T>::match")).toBe("Book<T>::match");
    expect(compactName("Command.main")).toBe("Command.main");
    expect(compactName("operator<<")).toBe("operator<<");
  });
});

const functions = async (language: Language, source: string) =>
  extractFunctions(await parse(source, language), language).map(({ qualifiedName, startLine, endLine, calls }) => ({
    qualifiedName,
    startLine,
    endLine,
    calls,
  }));

describe("languageFor", () => {
  it.each([
    ["src/click/core.py", "python"],
    ["src/a.ts", "typescript"],
    ["src/App.tsx", "tsx"],
    ["lib/x.mjs", "javascript"],
    ["pkg/server.go", "go"],
    ["src/io.c", "c"],
    ["include/io.h", "cpp"],
    ["src/book.cpp", "cpp"],
  ] as const)("%s -> %s", (path, lang) => {
    expect(languageFor(path)).toBe(lang);
  });

  it("returns undefined for files it can't parse", () => {
    expect(languageFor("README.md")).toBeUndefined();
    expect(languageFor("Makefile")).toBeUndefined();
  });

  it("groups languages that can call each other", () => {
    expect(callerExtensions("tsx")).toEqual(expect.arrayContaining(["ts", "tsx", "js"]));
    expect(callerExtensions("c")).toEqual(expect.arrayContaining(["c", "h", "cpp"]));
  });
});

describe("extractFunctions", () => {
  it("python: functions, methods qualified by class, nested calls not leaked", async () => {
    const src = [
      "def helper(x):",
      "    return x",
      "",
      "class Command:",
      "    def main(self, args):",
      "        def inner():",
      "            return secret()",
      "        self.invoke(helper(args))",
      "        sys.exit(1)",
    ].join("\n");
    expect(await functions("python", src)).toEqual([
      { qualifiedName: "helper", startLine: 1, endLine: 2, calls: [] },
      { qualifiedName: "Command.main", startLine: 5, endLine: 9, calls: ["invoke", "helper", "exit"] },
      { qualifiedName: "Command.inner", startLine: 6, endLine: 7, calls: ["secret"] },
    ]);
  });

  it("typescript: declarations, arrow functions, class methods; plain variables ignored", async () => {
    const src = [
      "export function total(xs: number[]) { return sum(xs); }",
      "const double = (x: number) => mul(x, 2);",
      "const limit = 10;",
      "class Router {",
      "  route(req: Req) { return this.match(req.path); }",
      "}",
    ].join("\n");
    expect(await functions("typescript", src)).toEqual([
      { qualifiedName: "total", startLine: 1, endLine: 1, calls: ["sum"] },
      { qualifiedName: "double", startLine: 2, endLine: 2, calls: ["mul"] },
      { qualifiedName: "Router.route", startLine: 5, endLine: 5, calls: ["match"] },
    ]);
  });

  it("tsx: components written as arrow functions", async () => {
    expect(await functions("tsx", "const Card = () => <div>{format(x)}</div>;")).toEqual([
      { qualifiedName: "Card", startLine: 1, endLine: 1, calls: ["format"] },
    ]);
  });

  it("go: functions and methods qualified by receiver", async () => {
    const src = [
      "package srv",
      "func New() *Server { return &Server{} }",
      "func (s *Server) Handle(r *Request) error {",
      "  return s.store.Save(validate(r))",
      "}",
    ].join("\n");
    expect(await functions("go", src)).toEqual([
      { qualifiedName: "New", startLine: 2, endLine: 2, calls: [] },
      { qualifiedName: "(*Server).Handle", startLine: 3, endLine: 5, calls: ["Save", "validate"] },
    ]);
  });

  it("c: function definitions through pointer declarators", async () => {
    const src = "static char *dup(const char *s) {\n  return copy(s, len(s));\n}";
    expect(await functions("c", src)).toEqual([{ qualifiedName: "dup", startLine: 1, endLine: 3, calls: ["copy", "len"] }]);
  });

  it("cpp: out-of-class definitions and in-class methods", async () => {
    const src = [
      "int Book::match(Order& o) { return engine::fill(o); }",
      "struct Cache {",
      "  void put(int k) { store_.insert(k); }",
      "};",
    ].join("\n");
    const result = await functions("cpp", src);
    expect(result.map((f) => [f.qualifiedName, f.calls])).toEqual([
      ["Book::match", ["fill"]],
      ["Cache::put", ["insert"]],
    ]);
  });

  it("cpp: methods of a multi-line template specialization get a one-line name", async () => {
    const src = [
      "template <typename T>",
      "struct formatter<T, char,",
      "                 enable_if_t<is_tuple_like<T>::value>> {",
      "  auto parse(ctx& c) { return c.begin(); }",
      "};",
    ].join("\n");
    expect((await functions("cpp", src)).map((f) => f.qualifiedName)).toEqual([
      "formatter<T, char, enable_if_t…>::parse",
    ]);
  });
});

describe("findCallSites", () => {
  it("finds calls by bare name with the enclosing function", async () => {
    const src = ["def a():", "    main()", "", "def b():", "    obj.main(1)", "    other()", "main()"].join("\n");
    const root = await parse(src, "python");
    expect(findCallSites(root, "python", "main")).toEqual([
      { line: 2, enclosing: "a" },
      { line: 5, enclosing: "b" },
      { line: 7, enclosing: undefined },
    ]);
  });
});
