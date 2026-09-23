---
description: Deep repository analysis to realign project plans with actual code reality
codex-description: 'Use when user asks to "check plan drift", "compare docs to code", "verify roadmap", "scan for reality gaps". Analyzes documentation vs actual code to detect drift and outdated plans.'
argument-hint: "[--sources github,docs,code] [--depth quick|thorough] [--output file|display|both] [--file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(node:*), Read, Glob, Grep, Task, Write
---

# /drift-detect

Find where the project's plans, docs and issues no longer match its code, and produce a prioritized plan to realign them.

## Arguments

`$ARGUMENTS`, all optional:

| Flag | Values | Default |
|------|--------|---------|
| `--sources` | comma list of `github`, `docs`, `code`, `analyzer` | all four |
| `--depth` | `quick`, `thorough` | `thorough` |
| `--output` | `file`, `display`, `both` | `both` |
| `--file` | report path | `drift-detect-report.md` |

`analyzer` uses a repo-intel map when one exists and is skipped quietly when not.

## Collect

Data collection is deterministic code, so run it rather than reproducing it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/collect.js" $ARGUMENTS
```

`${CLAUDE_PLUGIN_ROOT}` is this plugin's root. In a harness that does not substitute it, find `scripts/collect.js` in the plugin directory with Glob. The script validates the flags (exit 2 with the allowed values on a bad one, which you show the user and stop), writes the data to `<stateDir>/drift-detect-data.json`, and prints one line per source plus any notes. Show those lines to the user. A missing `gh` login or repo-intel map is a note, not a failure.

## Analyze

Spawn `drift-detect:plan-synthesizer` with:

```
Data: {path from the "data:" line}
Plugin root: {plugin root}
Output: {file|display|both}
Report path: {--file value}
```

Without the Task tool, do the same work in this session by following the plugin's `agents/plan-synthesizer.md`.

## Done

With `display` or `both`, show the report. With `file` or `both`, say where it was saved. If the synthesizer returned nothing usable, say so and point at the data file so the run is not lost.
