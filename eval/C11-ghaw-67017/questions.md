# C11: github/gh-aw #67017, "Detect secret references in all AWF environment sources"

Case 11: reviewing an AI agent's output (also case 12: an unfamiliar Go codebase). Written by the
Copilot coding agent to resolve issue
[#67016](https://github.com/github/gh-aw/issues/67016), the request it was given. Merged
2026-10-09, after the model's training cutoff. 4 files, +77/−4.

The request, from issue #67016, in short: `ComputeAWFExcludeEnvVarNames` in
`pkg/workflow/awf_env.go` decides which env vars hold secrets by checking for the literal text
`${{ secrets.`, so `${{secrets.TOKEN}}`, `${{ Secrets.Token }}`, `${{ vars.A || secrets.B }}` and
`${{ github.token || secrets.X }}` are missed, and `--env-all` forwards those secrets into the
agent sandbox. Proposed fix: make secret extraction case-insensitive (context and name), and use
`ExtractSecretsFromValue` instead of the literal check in every secret-classification branch,
for engine, sandbox-agent, and mcp-scripts env values.

Score each question 0-2: **2** correct and specific, **1** partly right or vague, **0** missing or wrong.

## Questions

### Q1. What problem does the PR address, and why does it matter?

**Answer:** Secret references written with different spacing, capitalisation, or with the
secret not first in a fallback expression weren't recognised, so their env var names were left
out of AWF's `--exclude-env` list, and `--env-all` forwarded the resolved secret values into the
agent's sandbox. That weakens the secret-isolation boundary.

- 2: missed secret references leading to secrets reaching the sandbox.
- 1: "improves secret detection" without the consequence.

### Q2. Did the agent do what the issue asked?

**Answer:** Yes. `secretsNamePattern` in `pkg/workflow/secret_extraction.go` becomes
`(?i)secrets\.([a-z_][a-z0-9_]*)` (case-insensitive context and name), and all three
classification branches in `ComputeAWFExcludeEnvVarNames` (mcp-scripts tools, `engine.env`,
agent env) switch from `strings.Contains(v, "${{ secrets.")` to
`len(ExtractSecretsFromValue(v)) > 0`. Tests cover spacing, mixed case, and fallback-first
expressions.

- 2: confirms both parts of the request against the code (the regex and all three branches).
- 1: restates the PR description without checking it against the issue or the code.

### Q3. Did it do only what was asked?

**Answer:** Within the diff, yes: 4 files (two source, two test), no unrelated edits. No other
classification branch in the function still uses the literal check; the remaining
`${{ secrets.` strings in `pkg/workflow` are comments and generated YAML.

- 2: says the diff is limited to the request, with evidence (file list, or no remaining
  literal checks).
- 1: says "yes" without evidence.

### Q4. What does the change affect beyond `ComputeAWFExcludeEnvVarNames`?

**Answer:** `secretsNamePattern` is shared, so every caller of `ExtractSecretsFromValue` becomes
case-insensitive too: `mcp_config_custom.go`, `mcp_setup_safe_outputs.go`,
`ExtractSecretsFromMap` and another use in `secret_extraction.go`, and
`strict_mode_steps_validation.go`. Strict-mode validation and MCP secret mapping now pick up
mixed-case references they used to ignore. Because names are stored with their captured
spelling, `secrets.Token` and `secrets.TOKEN` become two separate entries, though GitHub treats
them as the same secret. Neither the PR nor the issue mentions these callers.

- 2: identifies that the regex change reaches other callers (naming at least one) and what that
  means.
- 1: notes the regex is shared without the consequence.

### Q5. Which way does the change fail, if it's wrong?

**Answer:** Toward safety for this function: matching more patterns can only add names to the
exclusion list, so the worst case is a non-secret env var withheld from the sandbox, not a
secret leaked. For the other callers (Q4) the effect isn't one-directional, since they use the
extracted names to build config and validate steps.

- 2: "fails closed" for exclusion, and that other callers aren't covered by that argument.
- 1: only the fails-closed half.
