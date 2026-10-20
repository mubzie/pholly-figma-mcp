import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pluginIdSuffix, stampPlugin, TOKEN_PLACEHOLDER, PORT_PLACEHOLDER } from './setup.js';

test('stamped plugin files are owner-only and contain the token', () => {
  const root = mkdtempSync(join(tmpdir(), 'pholly-setup-'));
  const bundled = join(root, 'bundled');
  const target = join(root, 'plugin');
  try {
    mkdirSync(bundled);
    const token = 'a'.repeat(64);
    writeFileSync(join(bundled, 'code.js'), `token ${TOKEN_PLACEHOLDER};`);
    writeFileSync(join(bundled, 'ui.html'), `<script>const token='${TOKEN_PLACEHOLDER}'</script>`);
    writeFileSync(join(bundled, 'manifest.json'), JSON.stringify({ id: 'pholly', name: 'Pholly' }));
    stampPlugin(bundled, target, token);
    assert.equal(statSync(target).mode & 0o777, 0o700);
    for (const name of ['code.js', 'ui.html', 'manifest.json']) assert.equal(statSync(join(target, name)).mode & 0o777, 0o600);
    assert.match(readFileSync(join(target, 'code.js'), 'utf8'), new RegExp(token));
    assert.match(readFileSync(join(target, 'ui.html'), 'utf8'), new RegExp(token));
    const suffix = pluginIdSuffix(token);
    assert.equal(suffix, createHash('sha256').update(token).digest('hex').slice(0, 8));
    assert.notEqual(suffix, token.slice(0, 8));
    assert.equal(JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8')).id, `pholly-${suffix}`);
    assert.doesNotMatch(readFileSync(join(target, 'code.js'), 'utf8'), /__PHOLLY_TOKEN__/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('setup stamps the bridge port and refuses an invalid one', () => {
  const root = mkdtempSync(join(tmpdir(), 'pholly-port-'));
  const bundled = join(root, 'bundled');
  const target = join(root, 'plugin');
  try {
    mkdirSync(bundled);
    writeFileSync(join(bundled, 'code.js'), 'token');
    writeFileSync(join(bundled, 'ui.html'), `const endpoint='ws://localhost:${PORT_PLACEHOLDER}/ws';`);
    writeFileSync(join(bundled, 'manifest.json'), JSON.stringify({ id: 'pholly', networkAccess: { allowedDomains: [`ws://localhost:${PORT_PLACEHOLDER}`] } }));
    stampPlugin(bundled, target, 'b'.repeat(64), 2777);
    assert.match(readFileSync(join(target, 'ui.html'), 'utf8'), /localhost:2777/);
    assert.match(readFileSync(join(target, 'manifest.json'), 'utf8'), /localhost:2777/);
    assert.doesNotMatch(readFileSync(join(target, 'ui.html'), 'utf8'), /__PHOLLY_PORT__/);
    assert.throws(() => stampPlugin(bundled, join(root, 'bad'), 'b'.repeat(64), 0), /invalid bridge port/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
