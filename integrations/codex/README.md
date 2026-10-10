# Codex

Codex gets the same review as Claude Code's `/explain-pr`, from the same prompt.
[`explain-pr.md`](explain-pr.md) here is generated from [`prompts/review.md`](../../prompts/review.md)
by `npm run build:skill`; don't edit it by hand.

## Install

Link the prompt into Codex's custom prompts folder, so `git pull` in pr-reviewer updates it:

```bash
git clone https://github.com/theaiowlandswan/pr-reviewer.git ~/pr-reviewer
mkdir -p ~/.codex/prompts
ln -s ~/pr-reviewer/integrations/codex/explain-pr.md ~/.codex/prompts/explain-pr.md
ln -s ~/pr-reviewer/integrations/codex/explain-pr-deep.md ~/.codex/prompts/explain-pr-deep.md
```

For the faster, cheaper path (exact sizes, noise removed, call graph), also put the context CLI on
your PATH:

```bash
cd ~/pr-reviewer && npm install && npm link    # provides `pr-reviewer`
```

## Use

On the PR branch, in Codex:

```text
/prompts:explain-pr            # against main
/prompts:explain-pr develop    # against another base branch
/prompts:explain-pr-deep main  # every change explained in turn
```

Depending on your Codex version the command may be listed as `/explain-pr`.

## Or: AGENTS.md

To have Codex use the review whenever someone asks it to review a branch, add this to the repo's
`AGENTS.md`:

```markdown
## Reviewing pull requests

When asked to review or explain a PR or branch, follow the instructions in
~/pr-reviewer/prompts/review.md exactly, against `main` unless another base branch is given.
Run `pr-reviewer context --stdout --base <base>` first if it is installed.
```

## Status

The prompt is the same one tested with Claude Code. It has not yet been run end to end in Codex;
reports of how it behaves there are welcome.
