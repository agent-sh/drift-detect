/**
 * Shared Data Collectors
 *
 * Composable data collection infrastructure for drift-detect, deslop, sync-docs.
 * Follows the "JS collectors + single LLM call" pattern for token efficiency.
 *
 * @module lib/collectors
 */

'use strict';

const fs = require('fs');
const path = require('path');

const github = require('./github');
const documentation = require('./documentation');
const codebase = require('./codebase');
const docsPatterns = require('./docs-patterns');
const git = require('./git');

const DEFAULT_OPTIONS = {
  collectors: ['github', 'docs', 'code'],
  depth: 'thorough',
  cwd: process.cwd()
};

/**
 * Detect the state directory for the current platform.
 *
 * Inline detection to avoid importing platform/state-dir (which may not
 * exist in all consumers of this shared module).
 *
 * @param {string} basePath - Repository root
 * @returns {string} State directory name
 */
function _detectStateDir(basePath) {
  if (process.env.AI_STATE_DIR) return process.env.AI_STATE_DIR;
  if (process.env.OPENCODE_CONFIG || process.env.OPENCODE_CONFIG_DIR) return '.opencode';
  try { if (fs.statSync(path.join(basePath, '.opencode')).isDirectory()) return '.opencode'; } catch {}
  if (process.env.CODEX_HOME) return '.codex';
  try { if (fs.statSync(path.join(basePath, '.codex')).isDirectory()) return '.codex'; } catch {}
  return '.claude';
}

/**
 * Collect repo-intel signals (doc-drift and areas) from the agent-analyzer binary.
 *
 * Returns null when the binary or map file is unavailable, so callers can
 * treat repo-intel as a best-effort enrichment.
 *
 * @param {string} cwd - Repository root
 * @returns {{ docDrift: Array, areas: Array }|null}
 */
function getRepoIntelSignals(cwd) {
  try {
    const mapFile = path.join(cwd, _detectStateDir(cwd), 'repo-intel.json');
    if (!fs.existsSync(mapFile)) return null;

    // Lazy-require to avoid hard dependency on @agentsys/lib
    let binary;
    try {
      binary = require('@agentsys/lib').binary;
    } catch {
      return null;
    }

    const docDriftRaw = binary.runAnalyzer([
      'repo-intel', 'query', 'doc-drift', '--top', '20', '--map-file', mapFile, cwd
    ]);
    const areasRaw = binary.runAnalyzer([
      'repo-intel', 'query', 'areas', '--map-file', mapFile, cwd
    ]);

    return {
      docDrift: JSON.parse(docDriftRaw),
      areas: JSON.parse(areasRaw)
    };
  } catch {
    return null;
  }
}

/**
 * Collect data from specified collectors
 *
 * @param {Object} options - Collection options
 * @param {string[]} options.collectors - Which collectors to run: 'github', 'docs', 'code', 'docs-patterns'
 * @param {string} options.depth - 'quick' or 'thorough'
 * @param {string} options.cwd - Working directory
 * @param {string[]} options.changedFiles - For docs-patterns collector
 * @returns {Object} Collected data
 *
 * @example
 * // Drift-detect uses all three
 * const data = collect({ collectors: ['github', 'docs', 'code'] });
 *
 * // Deslop uses codebase only
 * const data = collect({ collectors: ['code'] });
 *
 * // Sync-docs uses docs + docs-patterns
 * const data = collect({ collectors: ['docs', 'docs-patterns'], changedFiles });
 */
function collect(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const collectors = Array.isArray(opts.collectors) ? opts.collectors : DEFAULT_OPTIONS.collectors;

  const data = {
    timestamp: new Date().toISOString(),
    options: opts,
    github: null,
    docs: null,
    code: null,
    docsPatterns: null,
    git: null,
    repoIntel: null
  };

  // Collect from each enabled collector
  if (collectors.includes('github')) {
    data.github = github.scanGitHubState(opts);
  }

  if (collectors.includes('docs')) {
    data.docs = documentation.analyzeDocumentation(opts);
  }

  if (collectors.includes('code')) {
    data.code = codebase.scanCodebase(opts);
  }

  if (collectors.includes('docs-patterns')) {
    data.docsPatterns = docsPatterns.collect(opts);
  }

  if (collectors.includes('git')) {
    data.git = git.collectGitData(opts);
  }

  // Always attempt repo-intel enrichment (no-op when binary/map unavailable)
  data.repoIntel = getRepoIntelSignals(opts.cwd);


  return data;
}

/**
 * Collect all data (backward compat with drift-detect)
 *
 * Supports both new 'collectors' option and legacy 'sources' option
 */
function collectAllData(options = {}) {
  // Map legacy 'sources' option to 'collectors'
  let collectors = ['github', 'docs', 'code'];
  if (options.sources) {
    collectors = options.sources;
  } else if (options.collectors) {
    collectors = options.collectors;
  }

  return collect({
    ...options,
    collectors
  });
}

module.exports = {
  // Main entry point
  collect,
  collectAllData,

  // Individual collectors
  github,
  documentation,
  codebase,
  docsPatterns,
  git,

  // Re-export commonly used functions for convenience
  scanGitHubState: github.scanGitHubState,
  isGhAvailable: github.isGhAvailable,
  analyzeDocumentation: documentation.analyzeDocumentation,
  scanCodebase: codebase.scanCodebase,
  findRelatedDocs: docsPatterns.findRelatedDocs,
  analyzeDocIssues: docsPatterns.analyzeDocIssues,
  checkChangelog: docsPatterns.checkChangelog,

  // Repo-intel integration
  getRepoIntelSignals,

  // New: repo-map integration exports
  ensureRepoMap: docsPatterns.ensureRepoMap,
  ensureRepoMapSync: docsPatterns.ensureRepoMapSync,
  getExportsFromRepoMap: docsPatterns.getExportsFromRepoMap,
  findUndocumentedExports: docsPatterns.findUndocumentedExports,
  isInternalExport: docsPatterns.isInternalExport,
  isEntryPoint: docsPatterns.isEntryPoint,

  collectGitData: git.collectGitData,

  // Constants
  DEFAULT_OPTIONS
};
