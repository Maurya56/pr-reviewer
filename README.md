# pr-reviewer

Explains a pull request to the person reviewing it, then lists the problems it found. Works as
Claude Code commands (`/explain-pr`, `/explain-pr-deep`), a GitHub Action, and Codex prompts.

A plain AI review starts with a list of findings. pr-reviewer starts with what the PR changes
and why, traced through one concrete example in the old code and the new code. Before the model
reads anything, a small CLI (`pr-reviewer context`) removes lockfiles and generated files from
the diff, counts the changed lines exactly, and lists who calls each changed function.

## Two depths

| Command | What you get | Length |
| --- | --- | --- |
| `/explain-pr [base]` | **In short** (2-3 sentences and a verdict), **What was wrong** (one example of the old behaviour), **How it works now** (the same example in the new code), **Where to look** (up to 5 files), **What I'd double-check**, **Problems**, **The numbers** | Explanation capped at 300 words |
| `/explain-pr-deep [base]` | **In short**, **The big picture** (a numbered list of every separate change), one section per change (example, code walk with file locations, what else it touches, edge cases, design trade-off), **Tests** (what each test proves), **Where to look** (every changed file), **What I'd double-check**, **Problems**, **The numbers** | About 100-300 words per change, no overall cap |

`[base]` is the branch the PR merges into. It defaults to `main`.

Every **Problems** entry names a file and line, and quotes the line that proves it. Reviews
contain no praise words ("excellent", "comprehensive") and no emoji.

Examples from real PRs:

- [`examples/click-pr-3818`](examples/click-pr-3818/): `/explain-pr` next to a plain Claude review of the same PR.
- [`examples/axios-pr-6371-deep`](examples/axios-pr-6371-deep/): `/explain-pr-deep` on a 21-file PR.

## Install in Claude Code

**1. Install the plugin.** In a terminal:

```bash
claude plugin marketplace add theaiowlandswan/pr-reviewer
claude plugin install pr-reviewer@pr-reviewer
```

The same commands work inside Claude Code's terminal interface as `/plugin marketplace add ...`
and `/plugin install ...`. The VS Code panel doesn't accept `/plugin`; use a terminal.

**2. Install the CLI (optional, recommended).** It adds the call graph and replaces the review's
git and search calls: on click #3818 a review made 10 tool calls without it and 2 with it.
Requires Node 14.18 or newer.

```bash
npm install -g github:theaiowlandswan/pr-reviewer
```

Install from GitHub as shown. The npm package named `pr-reviewer` is a different project.
Without the CLI, the review runs the git commands itself.

**3. Restart Claude Code.** In VS Code: `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS), then
"Developer: Reload Window".

### Update

```bash
claude plugin marketplace update pr-reviewer
npm install -g github:theaiowlandswan/pr-reviewer   # if you installed the CLI
```

Then restart Claude Code. If a new command still doesn't appear, reinstall the plugin (below).

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `/plugin isn't available in this environment` | You're in the VS Code panel. Run the `claude plugin ...` commands in a terminal. |
| `/explain-pr-deep` isn't listed | Run `claude plugin uninstall pr-reviewer@pr-reviewer`, then `claude plugin install pr-reviewer@pr-reviewer`, then restart Claude Code. Look for `/pr-reviewer:explain-pr-deep`: plugin commands may be prefixed with the plugin name. |
| The review doesn't start with `## In short` | The prompt didn't load. Update or reinstall the plugin. |
| `pr-reviewer: command not found` | The CLI isn't installed or isn't on your PATH. Reviews still work without it. |

## Use

Check out the PR branch, then in Claude Code:

```text
/explain-pr              # compare against main
/explain-pr develop      # compare against another branch
/explain-pr-deep main    # every change explained in turn
```

You can also type "explain this PR against main" or "explain this PR in depth".

## GitHub Action

Posts the review as one PR comment and updates that comment on every push. The review also goes
to the job summary.

```yaml
# .github/workflows/pr-review.yml
name: PR review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
      - uses: theaiowlandswan/pr-reviewer@v0.2.0
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

`@v0.2.0` pins a release ([changelog](CHANGELOG.md)); `@main` follows the latest commit.

| Input | Default | Meaning |
| --- | --- | --- |
| `anthropic_api_key` | required | Add it under the repo's Settings → Secrets and variables → Actions. |
| `depth` | `short` | `short` for `/explain-pr`, `deep` for `/explain-pr-deep`. |
| `base` | the PR's base branch | Branch to compare against. |
| `model` | Claude Code's default | Passed to `claude --model`. |
| `github_token` | `github.token` | Needs `pull-requests: write`. |

PRs from forks don't receive secrets on `pull_request`, so the Action can't review them. Don't
switch to `pull_request_target` to get around this: the review reads the PR's code, and that
event runs it with a write token.

## Codex

The same prompts as Codex custom prompts: `/prompts:explain-pr` and `/prompts:explain-pr-deep`.
Setup: [integrations/codex](integrations/codex/README.md).

## The `pr-reviewer context` CLI

```bash
pr-reviewer context --base main            # writes .pr-reviewer/out/context.md
pr-reviewer context --base main --stdout   # prints it instead
```

It builds the file the review reads, without calling a model:

- **Removes noise:** lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`,
  `poetry.lock`, `uv.lock`, `go.sum`, ...), build output (`dist/`, `build/`, `out/`, `vendor/`),
  `*.min.js`, `*.map`, generated code (`*.pb.go`, `*_pb2.py`, `*.generated.*`, and new files
  whose first lines say "DO NOT EDIT" or "@generated"), snapshots, pure renames, and changes that
  only touch whitespace.
- **Counts changed lines exactly,** split into logic, tests, config, docs, and removed noise.
- **Orders files:** source, then tests, then config, then docs; within each, the biggest change
  first. A test file with more than 60 changed lines is shortened to its list of test names.
- **Call graph** for Python, TypeScript, JavaScript, Go, C, and C++ (tree-sitter): up to 8
  changed functions, each marked added, modified, or removed, with up to 8 callers each (from up
  to 40 files) and the functions it calls. Callers the PR didn't change are marked "file not
  changed in this PR". Callers are matched by function name, so a common name like `get` can
  include unrelated functions.

The CLI compares against `origin/<base>` when it exists, otherwise the local `<base>`.

## Reviewing across repositories

When a change calls code from another repo, the review reads that code from, in order: a
submodule or vendored copy, the installed package (`node_modules`, `.venv`, the Go module cache,
C/C++ include paths), or a local checkout you list in `.pr-reviewer.json` at the root of the
repo being reviewed:

```json
{
  "importedAs": ["@acme/api"],
  "repos": [
    { "name": "core", "path": "../core", "importedAs": ["@acme/core", "acme_core"] },
    { "name": "web", "path": "~/work/web" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `importedAs` (top level) | How other repos import this one. The review searches the listed repos for these imports to find code a changed API would break. |
| `repos[].path` | Where that repo is checked out. Relative to the repo root, or absolute; `~` works. |
| `repos[].importedAs` | How this repo imports that one: npm package, Python module, Go module path, or C/C++ include prefix. Leave it out for repos that only use this one. |

Claude Code may ask before reading files outside the current repo. To skip that, add the paths
to `permissions.additionalDirectories` in your Claude Code settings, or run `/add-dir <path>`.

## Results so far

One PR, one run per variant: pallets/click #3818, a fix for a Ctrl-C race, 4 files, +273/−37.
Same model and same read-only tools for both. Full outputs:
[`examples/click-pr-3818`](examples/click-pr-3818/).

| | Plain Claude review | `/explain-pr` |
| --- | --- | --- |
| Cost | $0.17 | $0.10 |
| Time | 103 s | 46 s |
| Length | 1,006 words | 554 words |
| Praise and filler words | 18 | 1 |
| Callers of the changed function named, with file and line | 0 of 2 | 2 of 2 |

On axios #6371 (21 files), `/explain-pr-deep` reported that `trackStream` calls `onFinish()`
without checking it exists, and that both of its callers can omit it. axios fixed this two
months after the PR merged, in [#6518](https://github.com/axios/axios/pull/6518).

On zod #6387 (a known bug, fixed later in #6500), neither a plain review nor `/explain-pr` found
the bug in 2 runs each.

A full evaluation on 17 PRs (below) hasn't been run yet.

## Evaluation

[`eval/`](eval/README.md) compares pr-reviewer with a plain Claude review on 17 public PRs:

- **12 review cases are covered:** a small fix, a change to a shared API, a refactor, a bug fix,
  deleted code, concurrency, a build migration, a PR that mixes several changes, a big feature, a
  large amount of new code, an AI agent's PR checked against the issue it was given, and C++.
- **4 PRs are known-buggy:** merged, then fixed by a later PR. The bug is recorded in each PR's
  answer key.
- **11 of the 17 were merged after the model's training cutoff,** so the model can't have seen
  them.
- **Each PR has 4-5 comprehension questions** with answers checked against the code.
- **Each PR is fetched into its own repo** holding only history up to that PR, so the later fix
  commit isn't visible to the reviewer.

```bash
npm run build
eval/run.sh --runs 1 --judge      # 17 PRs × 2 variants, about $7-12
eval/run.sh                       # 17 PRs × 2 variants × 3 runs, about $20-35, 2-4 hours
```

Results go to `eval/results/<timestamp>/`. You score comprehension, bugs found, and false
findings in `scoring.csv`. `--judge` pre-fills comprehension and bugs with a separate model that
doesn't know which variant wrote each review. Rubric: [`eval/SCORING.md`](eval/SCORING.md).

## Compare on your own PR

```bash
cd your-repo && git switch your-pr-branch
~/.claude/plugins/marketplaces/pr-reviewer/scripts/compare.sh main            # plugin install
~/pr-reviewer/scripts/compare.sh --runs 3 --deep main                          # from a clone
```

Runs a plain Claude review and `/explain-pr` (or `/explain-pr-deep` with `--deep`) on the same
branch with the same tools, and writes both reviews plus tokens, cost, turns, time, and word
counts. `--runs 3` repeats each review 3 times and reports the range. Don't run it inside the
pr-reviewer repo: the plain review reads this repo's instructions and copies the format.

## Requirements

| To | You need |
| --- | --- |
| Use `/explain-pr` and `/explain-pr-deep` | Claude Code. The plugin itself has no other requirements. |
| Use the `pr-reviewer` CLI | Node 14.18 or newer, git |
| Run `compare.sh` or the eval | the `claude` CLI, git, Python 3 |
| Develop pr-reviewer (build, tests) | Node 18 or newer |

## Roadmap

Done:

- `/explain-pr` and `/explain-pr-deep` for Claude Code, a GitHub Action, and Codex prompts
- `pr-reviewer context`: noise removal, exact line counts, reading order, call graph for 6 languages
- Cross-repo reading through `.pr-reviewer.json`
- An evaluation set of 17 PRs across 12 review cases
- CLI support for Node 14.18+

Next:

1. Run the full evaluation and publish the results.
2. Split a PR into its separate changes and say which ones change behaviour.
3. Checks done by code instead of the model: callers the PR didn't update, claims in the PR
   description that aren't in the code, new packages that don't exist, a bug-fix test that also
   passes before the fix.
4. A map of the code a change affects, and a guided tour for new code.
5. A few questions for the reviewer to answer before reading the summary.
6. A per-repo knowledge file ([design](docs/knowledge.md)).
7. Call graph across the repos in `.pr-reviewer.json`.

## Development

```bash
npm install          # installs dependencies, builds dist/, copies the tree-sitter grammars
npm test             # 103 tests
npm run typecheck
npm run build:skill  # after editing prompts/review.md: regenerates every command and prompt file
scripts/smoke.sh     # runs the built CLI on a small test repo with whatever `node` is on PATH
```

`prompts/review.md` is the only prompt file to edit. `npm run build:skill` copies it into
`skills/`, `commands/`, and `integrations/codex/`, and a test fails if those copies are out of
date. When you change commands or the prompt, bump `version` in `.claude-plugin/plugin.json`:
Claude Code caches installed plugins by version.

## License

[MIT](LICENSE) © Maurya
