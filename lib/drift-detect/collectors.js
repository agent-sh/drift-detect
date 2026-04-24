/**
 * Reality Check Data Collectors
 * Pure JavaScript data collection - no LLM needed
 *
 * BACKWARD COMPATIBILITY: This module re-exports from lib/collectors.
 * For new code, use: const { collectors } = require('@agentsys/lib');
 *
 * Replaces three LLM agents (issue-scanner, doc-analyzer, code-explorer)
 * with deterministic JavaScript functions.
 *
 * @module lib/drift-detect/collectors
 */

'use strict';

// Re-export from shared collectors module
const collectors = require('../collectors');

// Legacy DEFAULT_OPTIONS (backward compatible format). Now always
// includes the `analyzer` source so plan-synthesizer sees slop-fix /
// stale-docs / entry-point signals alongside the traditional
// github/docs/code data.
const DEFAULT_OPTIONS = {
  sources: ['github', 'docs', 'code', 'analyzer'],
  depth: 'thorough',
  issueLimit: collectors.github.DEFAULT_OPTIONS.issueLimit,
  prLimit: collectors.github.DEFAULT_OPTIONS.prLimit,
  timeout: collectors.github.DEFAULT_OPTIONS.timeout
};

/**
 * Reshape the analyzer bundle for plan-synthesizer consumption. The
 * full bundle carries Maps and Sets that JSON-stringify to `{}`; the
 * agent only needs the partitioned arrays plus summary counts. We keep
 * the output arrays bounded so we don't blow out context on large
 * repos — top 20 of each category is enough for drift analysis.
 */
function summarizeAnalyzer(bundle) {
  if (!bundle || !bundle.available) {
    return {
      available: false,
      reason: bundle?.reason || 'analyzer-unavailable'
    };
  }
  const cap = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
  return {
    available: true,
    counts: {
      staleDocs: bundle.staleDocs?.length ?? 0,
      docDriftFiltered: bundle.docDrift?.length ?? 0,
      docDriftRaw: bundle.docDriftAll?.length ?? 0,
      entryPoints: bundle.entryPoints?.length ?? 0,
      slopFixes: bundle.slopFixes?.length ?? 0,
      orphanExports: bundle.orphanExports?.length ?? 0,
      passthroughWrappers: bundle.passthroughWrappers?.length ?? 0,
      alwaysTrueConditions: bundle.alwaysTrueConditions?.length ?? 0
    },
    // Per-category samples sized for the agent's context budget.
    orphanExports: cap(bundle.orphanExports, 20),
    passthroughWrappers: cap(bundle.passthroughWrappers, 20),
    alwaysTrueConditions: cap(bundle.alwaysTrueConditions, 20),
    docDrift: cap(bundle.docDrift, 20),
    // Only the path for stale-docs samples — full payload grows fast.
    staleDocsSample: cap(bundle.staleDocs, 30).map((e) => ({
      doc: e.doc, line: e.line, reference: e.reference, issue: e.issue
    }))
  };
}

/**
 * drift-detect's JSON-shaped output for plan-synthesizer. Thin wrapper
 * around `collectors.collectAllData` that swaps the internal analyzer
 * bundle for a serializable summary.
 */
function collectAllData(options = {}) {
  const raw = collectors.collectAllData(options);
  if (raw.analyzer) {
    raw.analyzer = summarizeAnalyzer(raw.analyzer);
  }
  return raw;
}

// Re-export all functions for backward compatibility
module.exports = {
  DEFAULT_OPTIONS,
  scanGitHubState: collectors.scanGitHubState,
  analyzeDocumentation: collectors.analyzeDocumentation,
  scanCodebase: collectors.scanCodebase,
  collectAllData,
  summarizeAnalyzer,
  isGhAvailable: collectors.isGhAvailable,
  isPathSafe: collectors.documentation.isPathSafe
};
