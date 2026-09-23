# Changelog

## [Unreleased]

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
