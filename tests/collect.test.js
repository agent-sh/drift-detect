/**
 * Tests for scripts/collect.js, the data-collection step of /drift-detect.
 *
 * Run: `node --test tests/collect.test.js`
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '..', 'scripts', 'collect.js');

function run(args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
}

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-collect-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# demo\n\n- [x] parse input\n- [ ] write output\n');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), 'module.exports = () => 1;\n');
  return dir;
}

test('rejects invalid flag values with exit 2 and the allowed list', () => {
  const dir = tempRepo();
  try {
    for (const args of [['--sources', 'foo'], ['--depth', 'deep'], ['--output', 'nowhere'], ['--bogus']]) {
      const r = run(args, dir);
      assert.equal(r.status, 2, `${args.join(' ')} should exit 2`);
      assert.match(r.stderr, /usage: collect\.js/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writes one JSON file with the documented top-level keys', () => {
  const dir = tempRepo();
  const out = path.join(dir, 'data.json');
  try {
    const r = run(['--sources', 'docs,code,analyzer', '--depth=quick', '--data-out', out], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`^data: ${out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    assert.match(r.stdout, /^github: skipped$/m);
    const data = JSON.parse(fs.readFileSync(out, 'utf8'));
    for (const key of ['timestamp', 'options', 'github', 'docs', 'code', 'analyzer', 'repoIntel', 'notes']) {
      assert.ok(Object.hasOwn(data, key), `missing ${key}`);
    }
    assert.deepEqual(data.options.sources, ['docs', 'code', 'analyzer']);
    assert.equal(data.options.depth, 'quick');
    assert.equal(data.github, null);
    assert.equal(data.analyzer.available, false);
    assert.ok(data.notes.some(n => /repo-intel/.test(n)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
