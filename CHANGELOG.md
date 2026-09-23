# Changelog

## [Unreleased]

## [5.3.0] - 2026-09-24

### Added
- `scripts/collect.js` runs the data collection the command used to describe as inline JavaScript: flag validation, GitHub, docs, code and analyzer collectors, repo-intel area health and project info. It writes one JSON file to `<stateDir>/drift-detect-data.json` and prints a line per source. The command's allowed tools had no `node`, so the old block could not run as written.
- `tests/collect.test.js`, wired into `npm test`.

### Changed
- Rewrote the command, `plan-synthesizer` and the `drift-analysis` skill for current models: goal, constraints with reasons, done, and one report format instead of three different ones.
- Analyzer data now reaches the synthesizer. The old prompt passed only `github`, `docs` and `code`, so the analyzer signals the agent was told to read were never in its input.
- `plan-synthesizer` gets Glob and Grep and checks each claim in the code before making it. It stays on `sonnet`.
- Reference material (data keys, analyzer signals, severity guide, report layout) moved to `skills/drift-analysis/references/`. The priority-score formula and the fuzzy-match code are gone; the model weighs priority from the severity guide.
- The skill no longer asks to generate a repo-intel map; the collector notes when one is missing or stale.

## [5.2.0] - 2026-09-23

### Added
- Wire Phase 2-4 repo-intel data: query stale-docs for symbol-level doc staleness (replaces heuristic doc-drift) and project-info for language/CI/license context

### Changed
- Harnesses without AskUserQuestion (Codex, OpenCode) skip the repo-intel generation prompt and continue; without Task, the synthesis prompt runs in the current session.
- The missing-map hint no longer assumes the repo-intel plugin is installed.
- Release-blocker line in the report template drops the all-caps MUST.
- Switch plan-synthesizer agent to Sonnet model (5x cheaper, same quality validated)

### Fixed
- Remove AUTO-GENERATED comment and redundant 'Be concise' instruction from AGENTS.md and CLAUDE.md (#13)

## [5.1.0] - 2026-03-16

### Added
- Pre-fetch doc-drift and area health signals from repo-intel in drift-detect command (#10)
- Ask user to generate repo-intel map when not present in drift-analysis skill (#9)
- Repo-intel integration: doc-drift and directory area health signals from agent-analyzer binary (#7)
- CI: agnix validation pipeline
- agent-knowledge submodule

## [1.0.0] - 2026-02-21

Initial release. Extracted from [agentsys](https://github.com/agent-sh/agentsys) monorepo.
