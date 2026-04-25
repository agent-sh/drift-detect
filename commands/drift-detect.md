---
description: Deep repository analysis to realign project plans with actual code reality
codex-description: 'Use when user asks to "check plan drift", "compare docs to code", "verify roadmap", "scan for reality gaps". Analyzes documentation vs actual code to detect drift and outdated plans.'
argument-hint: "[--sources github,docs,code] [--depth quick|thorough] [--output file|display|both] [--file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Read, Glob, Grep, Task, Write
---

# /drift-detect - Reality Check Scanner

Perform deep repository analysis to identify drift between documented plans and actual implementation.

## Architecture

```
collectors.js (pure JS) → plan-synthesizer (Sonnet) → report
├─ scanGitHubState()      (single call with full context)
├─ analyzeDocumentation()
├─ scanCodebase()
└─ getRepoIntelSignals()  (optional, requires repo-intel.json)
```

Data collection is pure JavaScript (no LLM). Only semantic analysis uses Sonnet.

## Arguments

Parse from $ARGUMENTS:
- `--sources`: Comma-separated list of sources to scan (default: github,docs,code)
- `--depth`: Scan depth - quick or thorough (default: thorough)
- `--output`: Output mode - file, display, or both (default: both)
- `--file`: Output file path (default: drift-detect-report.md)

Example: `/drift-detect --sources github,docs --depth quick --output file`

## Phase 1: Parse Arguments and Collect Data

```javascript
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) { console.error('Error: CLAUDE_PLUGIN_ROOT not set'); process.exit(1); }
const collectors = require(`${pluginRoot}/lib/drift-detect/collectors.js`);
const { repoMap } = require(`${pluginRoot}/lib/agentsys`).get();
if (!repoMap) { console.error('Error: agentsys repo-map module unavailable - install/update agentsys'); process.exit(1); }

// Suggest repo-intel if missing or stale
const mapStatus = repoMap.status(process.cwd());
if (!mapStatus.exists) {
  console.log('Repo-intel map not found. For faster, more accurate drift detection, run: /repo-intel init');
} else if (mapStatus.status?.staleness?.isStale) {
  console.log('Repo-intel map is stale (' + mapStatus.status.staleness.reason + '). Consider: /repo-intel update');
}

// Parse arguments
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const options = {
  sources: ['github', 'docs', 'code', 'analyzer'],
  depth: 'thorough',
  output: 'both',
  file: 'drift-detect-report.md',
  cwd: process.cwd()
};

// Parse flags
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sources' && args[i+1]) {
    options.sources = args[++i].split(',').map(s => s.trim());
  } else if (args[i] === '--depth' && args[i+1]) {
    options.depth = args[++i];
  } else if (args[i] === '--output' && args[i+1]) {
    options.output = args[++i];
  } else if (args[i] === '--file' && args[i+1]) {
    options.file = args[++i];
  }
}

// Validate options
const allowedSources = ['github', 'docs', 'code', 'analyzer'];
const allowedDepths = ['quick', 'thorough'];
const allowedOutputs = ['file', 'display', 'both'];

const invalidSources = options.sources.filter(s => !allowedSources.includes(s));
if (invalidSources.length > 0) {
  console.error(`Invalid --sources value(s): ${invalidSources.join(', ')}. Allowed: ${allowedSources.join(', ')}`);
  process.exit(1);
}

if (!allowedDepths.includes(options.depth)) {
  console.error(`Invalid --depth value: ${options.depth}. Allowed: ${allowedDepths.join(', ')}`);
  process.exit(1);
}

if (!allowedOutputs.includes(options.output)) {
  console.error(`Invalid --output value: ${options.output}. Allowed: ${allowedOutputs.join(', ')}`);
  process.exit(1);
}

console.log(`
## Starting Reality Check Scan

**Sources**: ${options.sources.join(', ')}
**Depth**: ${options.depth}
**Output**: ${options.output}

Collecting data...
`);

// Collect all data using pure JavaScript (no LLM)
const collectedData = await collectors.collectAllData(options);

// Check if GitHub data collection succeeded
if (options.sources.includes('github') && collectedData.github && !collectedData.github.available) {
  console.log(`
[WARN] GitHub CLI not available or not authenticated.
Run \`gh auth login\` to enable GitHub issue scanning.
Continuing with other sources...
  `);
}

console.log(`
### Data Collection Complete

${collectedData.github?.available ? `- **GitHub**: ${collectedData.github.issues.length} issues, ${collectedData.github.prs.length} PRs` : '- **GitHub**: Not available'}
${collectedData.docs ? `- **Documentation**: ${Object.keys(collectedData.docs.files).length} files analyzed` : '- **Documentation**: Skipped'}
${collectedData.code?.summary?.totalDirs ? `- **Code**: ${collectedData.code.summary.totalDirs} directories scanned` : '- **Code**: Skipped'}

→ Sending to semantic analyzer...
`);
```

## Phase 2: Semantic Analysis (Single Sonnet Call)

Send all collected data to plan-synthesizer for deep semantic analysis:

```javascript
// Pre-fetch repo-intel signals if available
let repoIntelContext = '';
try {
  const pluginRoot2 = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot2) throw new Error('CLAUDE_PLUGIN_ROOT not set');
  const { repoIntel, libRoot } = require(`${pluginRoot2}/lib/agentsys`).get();
  if (!repoIntel) throw new Error('agentsys is older than v5.8.6 (typed repo-intel queries unavailable) - run `/plugin marketplace update`');
  const { getStateDirPath } = require(`${libRoot}/platform/state-dir`);
  const fs = require('fs');
  const cwd = process.cwd();
  const mapFile = require('path').join(getStateDirPath(cwd), 'repo-intel.json');
  // Helper: never let a single query crash the whole context build.
  const q = (fn) => { try { return fn(); } catch { return null; } };

  if (fs.existsSync(mapFile)) {
    const docDrift = q(() => repoIntel.queries.docDrift(cwd, { limit: 20 }));
    const areas = q(() => repoIntel.queries.areas(cwd));
    const staleDocs = q(() => repoIntel.queries.staleDocs(cwd, { limit: 20 }));
    // project-info isn't in the typed wrapper yet - fall through to raw binary.
    const { binary } = require(`${pluginRoot2}/lib/agentsys`).get();
    const projectInfo = q(() => JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'project-info', '--map-file', mapFile, cwd])));
    const atRisk = (areas || []).filter(a => a.health === 'at-risk' || a.health === 'needs-attention');

    repoIntelContext = '\n\nRepo-intel signals (use this data for drift analysis):';

    if (docDrift && docDrift.length > 0) {
      const severelyStale = docDrift.filter(d => d.codeCoupling === 0).map(d => d.path);
      if (severelyStale.length > 0) repoIntelContext += '\nDocs with zero code coupling (severely stale): ' + severelyStale.join(', ');
    }
    if (staleDocs && staleDocs.length > 0) {
      repoIntelContext += '\nStale doc references (symbol-level):\n' +
        staleDocs.map(s => `  ${s.doc}:${s.line} "${s.reference}" [${s.issue}] ${s.suggestion}`).join('\n');
    }
    if (atRisk.length > 0) {
      repoIntelContext += '\nAt-risk areas: ' + atRisk.map(a => `${a.area} (${a.health}, bugFixRate=${a.bugFixRate.toFixed(2)})`).join(', ');
    }
    if (projectInfo) {
      repoIntelContext += '\nProject: ' + (projectInfo.languages || []).map(l => l.language).join(', ');
      if (projectInfo.ci) repoIntelContext += ' | CI: ' + projectInfo.ci.provider;
      if (projectInfo.license) repoIntelContext += ' | License: ' + projectInfo.license;
    }
  }
} catch (e) { console.error(`[INFO] repo-intel context skipped: ${e.message}`); }

const analysisPrompt = `
You are analyzing a project to identify drift between documented plans and actual implementation.

## Collected Data

### GitHub State
${'```'}json
${JSON.stringify(collectedData.github, null, 2)}
${'```'}

### Documentation Analysis
${'```'}json
${JSON.stringify(collectedData.docs, null, 2)}
${'```'}

### Codebase Analysis
${'```'}json
${JSON.stringify(collectedData.code, null, 2)}
${'```'}

## Your Task

Be BRUTALLY SPECIFIC. The user wants concrete, actionable insights - not generic observations.

### 1. Issue-by-Issue Verification

For EACH open issue, determine:
- Is this already implemented? → "Close issue #X - implemented in src/auth/login.js"
- Is this stale/irrelevant? → "Close issue #X - no longer applicable after Y refactor"
- Is this blocked? → "Issue #X blocked by: missing Z dependency"

### 2. Phase/Checkbox Validation

For EACH phase or checkbox marked "complete" in docs:
- Verify against actual code: Does the feature exist?
- Check for missing pieces: "Phase 'Authentication' marked complete but MISSING:
  - Password reset functionality (no code in auth/)
  - Session timeout handling (not implemented)
  - Tests for login flow (0 test files)"

### 3. Release Readiness Assessment

If there are milestones or planned releases, assess:
- "Your plan to release tomorrow is UNREALISTIC because:
  - 3 critical tests missing for payment module
  - No QA coverage on authentication flows
  - Issue #45 (security) still open
  - Phase B only 40% complete despite being marked done"

### 4. Specific Recommendations

Output SPECIFIC actions, not generic advice:
- "Close issues: #12, #34, #56 (already implemented)"
- "Reopen: Phase C (missing: X, Y, Z)"
- "Block release until: tests added for auth/, issue #78 fixed"
- "Update PLAN.md: Phase B is NOT complete - missing items listed above"

## Output Format

```markdown
# Reality Check Report

## Executive Summary
[2-3 sentences: Overall project health and biggest concerns]

## Issues to Close (Already Done)
- #XX: [title] - Implemented in [file/location]
- #YY: [title] - No longer relevant because [reason]

## Phases Marked Complete But NOT Actually Done
### [Phase Name]
**Status in docs**: Complete [OK]
**Actual status**: INCOMPLETE
**Missing**:
- [ ] [Specific missing item 1]
- [ ] [Specific missing item 2]

## Release Blockers
If you're planning to ship soon, these MUST be addressed:
1. [Specific blocker with file/issue reference]
2. [Specific blocker with file/issue reference]

## Issues That Need Attention
- #XX: [why it's stale/blocked/misprioritized]

## Quick Wins
Things you can do right now:
1. Close issue #XX (already done)
2. Update Phase Y status (not complete)
3. Add test for [specific untested code]
```
${repoIntelContext}`;

await Task({
  subagent_type: "drift-detect:plan-synthesizer",
  prompt: analysisPrompt,
  description: "Analyze project reality"
});
```

## Phase 3: Output Report

After the synthesizer completes, the report is available. Handle output per settings:

```javascript
// The synthesizer outputs the report directly
// Handle file writing if requested

if (options.output === 'file' || options.output === 'both') {
  console.log(`\n---\nReport saved to: ${options.file}`);
}

console.log(`
## Reality Check Complete

Use the findings above to realign your project with reality.
Run \`/drift-detect --depth quick\` for faster subsequent scans.
`);
```

## Quick Reference

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| --sources | github,docs,code | all three | Which sources to scan |
| --depth | quick, thorough | thorough | How deep to analyze |
| --output | file, display, both | both | Where to output results |
| --file | path | drift-detect-report.md | Output file path |

## Success Criteria

- Data collected via pure JavaScript (no LLM overhead)
- Single Sonnet call for semantic analysis with full context
- Drift and gaps clearly identified with examples
- Prioritized reconstruction plan produced
- Report output per user settings

Begin scan now.
