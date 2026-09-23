#!/usr/bin/env node
// collect.js - gather drift-detect data (GitHub, docs, code, repo-intel) into one JSON file
'use strict';

const fs = require('fs');
const path = require('path');

const lib = path.join(__dirname, '..', 'lib');
const collectors = require(path.join(lib, 'drift-detect', 'collectors.js'));

const ALLOWED = {
  sources: ['github', 'docs', 'code', 'analyzer'],
  depth: ['quick', 'thorough'],
  output: ['file', 'display', 'both']
};
const TOP = 20;

function usage(msg) {
  if (msg) process.stderr.write(`${msg}\n`);
  process.stderr.write('usage: collect.js [--sources github,docs,code,analyzer] [--depth quick|thorough] ' +
    '[--output file|display|both] [--file PATH] [--data-out PATH]\n');
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    sources: ALLOWED.sources.slice(),
    depth: 'thorough',
    output: 'both',
    file: 'drift-detect-report.md',
    dataOut: null
  };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    const value = () => (inline !== undefined ? inline : argv[++i]);
    if (flag === '--sources') opts.sources = String(value() || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (flag === '--depth') opts.depth = value();
    else if (flag === '--output') opts.output = value();
    else if (flag === '--file') opts.file = value();
    else if (flag === '--data-out') opts.dataOut = value();
    else if (flag === '--help' || flag === '-h') usage();
    else usage(`Unknown argument: ${argv[i]}`);
  }
  const bad = opts.sources.filter(s => !ALLOWED.sources.includes(s));
  if (bad.length || !opts.sources.length) usage(`Invalid --sources value(s): ${bad.join(', ') || '(empty)'}. Allowed: ${ALLOWED.sources.join(', ')}`);
  if (!ALLOWED.depth.includes(opts.depth)) usage(`Invalid --depth value: ${opts.depth}. Allowed: ${ALLOWED.depth.join(', ')}`);
  if (!ALLOWED.output.includes(opts.output)) usage(`Invalid --output value: ${opts.output}. Allowed: ${ALLOWED.output.join(', ')}`);
  if (!opts.file) usage('--file needs a path');
  return opts;
}

function stateDir(cwd) {
  try {
    return require(path.join(lib, 'platform', 'state-dir')).getStateDirPath(cwd);
  } catch {
    const found = ['.claude', '.opencode', '.codex'].find(d => fs.existsSync(path.join(cwd, d)));
    return path.join(cwd, found || '.claude');
  }
}

// The analyzer bundle carries Maps, Sets and full lists; keep what the synthesizer reads.
function trimAnalyzer(a) {
  if (!a) return null;
  if (!a.available) return { available: false, reason: a.reason, queryErrors: a.queryErrors || [] };
  const top = (list, n = TOP) => (Array.isArray(list) ? list.slice(0, n) : []);
  const len = list => (Array.isArray(list) ? list.length : 0);
  return {
    available: true,
    queryErrors: a.queryErrors || [],
    counts: {
      staleDocs: len(a.staleDocs),
      docDrift: len(a.docDrift),
      orphanExports: len(a.orphanExports),
      passthroughWrappers: len(a.passthroughWrappers),
      alwaysTrueConditions: len(a.alwaysTrueConditions),
      commentedOutCode: len(a.commentedOutCode),
      staleSuppressions: len(a.staleSuppressions)
    },
    orphanExports: top(a.orphanExports),
    passthroughWrappers: top(a.passthroughWrappers),
    alwaysTrueConditions: top(a.alwaysTrueConditions),
    commentedOutCode: top(a.commentedOutCode),
    staleSuppressions: top(a.staleSuppressions),
    docDrift: top(a.docDrift),
    staleDocsSample: top(a.staleDocs, 30),
    entryPoints: a.entryPoints || []
  };
}

// Area health and project facts are extra repo-intel queries; any failure leaves them null.
function repoIntelExtras(cwd, mapFile) {
  if (!fs.existsSync(mapFile)) return null;
  const safe = fn => { try { return fn(); } catch { return null; } };
  const queries = safe(() => require(path.join(lib, 'repo-intel', 'queries')));
  if (!queries) return null;
  const areas = safe(() => queries.areas(cwd)) || [];
  return {
    atRiskAreas: areas.filter(a => a.health === 'at-risk' || a.health === 'needs-attention'),
    projectInfo: safe(() => queries.projectInfo(cwd))
  };
}

function mapNote(cwd, mapFile) {
  if (!fs.existsSync(mapFile)) {
    return 'No repo-intel map. Drift detection runs without it; /repo-intel init (repo-intel plugin) adds symbol-level doc drift.';
  }
  try {
    const st = require(path.join(lib, 'repo-intel')).status(cwd);
    const stale = st && st.status && st.status.staleness;
    if (stale && stale.isStale) return `Repo-intel map is stale (${stale.reason}). /repo-intel update refreshes it.`;
  } catch { /* status is advisory */ }
  return null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const dir = stateDir(cwd);
  const mapFile = path.join(dir, 'repo-intel.json');

  const raw = await collectors.collectAllData({ sources: opts.sources, depth: opts.depth, cwd });
  const data = {
    timestamp: raw.timestamp,
    options: { sources: opts.sources, depth: opts.depth, output: opts.output, file: opts.file },
    github: raw.github,
    docs: raw.docs,
    code: raw.code,
    analyzer: trimAnalyzer(raw.analyzer),
    repoIntel: opts.sources.includes('analyzer') ? repoIntelExtras(cwd, mapFile) : null,
    notes: []
  };
  const note = mapNote(cwd, mapFile);
  if (note) data.notes.push(note);
  if (opts.sources.includes('github') && data.github && !data.github.available) {
    data.notes.push('GitHub CLI not available or not authenticated; run `gh auth login` to scan issues and PRs.');
  }

  const out = opts.dataOut ? path.resolve(opts.dataOut) : path.join(dir, 'drift-detect-data.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2));

  const gh = !opts.sources.includes('github') ? 'skipped'
    : data.github && data.github.available
      ? `${(data.github.issues || []).length} issues, ${(data.github.prs || []).length} PRs`
      : 'not available';
  const docs = data.docs && data.docs.files ? `${Object.keys(data.docs.files).length} files` : 'skipped';
  const code = data.code && data.code.summary && data.code.summary.totalDirs ? `${data.code.summary.totalDirs} directories` : 'skipped';
  const analyzer = data.analyzer ? (data.analyzer.available ? 'available' : `unavailable (${data.analyzer.reason})`) : 'skipped';
  process.stdout.write([
    `data: ${out}`,
    `github: ${gh}`,
    `docs: ${docs}`,
    `code: ${code}`,
    `analyzer: ${analyzer}`,
    ...data.notes.map(n => `note: ${n}`)
  ].join('\n') + '\n');
}

main().catch(err => {
  process.stderr.write(`collect.js: ${err.message}\n`);
  process.exit(1);
});
