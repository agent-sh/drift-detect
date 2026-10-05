# drift-detect

> Deep repository analysis to realign project plans with actual code reality - discovers drift, gaps, and produces prioritized reconstruction plans

## Overview

An agentsys plugin: the `/drift-detect` command, the `plan-synthesizer` agent and the `drift-analysis` skill (with `skills/drift-analysis/references/signals.md` and `skills/drift-analysis/references/output-template.md`) are Markdown prompts. `scripts/collect.js` does the data collection the command runs, covered by `tests/collect.test.js`. `lib/` is synced from [agent-core](https://github.com/agent-sh/agent-core); change shared code there, since a local edit is overwritten by the next sync PR.

## Conventions

- Output is plain text with the status markers `[OK]`, `[ERROR]`, `[WARN]`, `[CRITICAL]`, and no emojis or ASCII art. People read it in terminals and other plugins parse it.
- In prose, write a spaced single dash (` - `), not ` -- ` or an em dash.
- Put summaries, plans and audit notes in the PR or issue, not in committed files: committed notes go stale.
- Changes reach main through a PR. A feature or fix is done when tests that cover it pass.
- Keep git hooks on. `scripts/setup-hooks.sh` installs a pre-push hook that runs `npm test`.
- When a script or tool fails, report the failure before working around it, so the tool gets fixed.
- When goals conflict, rank them: plugin users' experience, automation that needs no babysitting, token cost, output quality, simplicity.

## Agents

- plan-synthesizer

## Skills

- drift-analysis

## Commands

- drift-detect

## Dev commands

```bash
npm test                        # loads lib/, then the node:test suite
npm run validate                # loads lib/ only
agnix --config .agnix.toml .    # agent config lint, also run in CI
```

## References

- Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem
- https://agentskills.io
