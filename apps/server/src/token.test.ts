import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgeMac, getOrCreateToken, macMatches, tokenMatches } from './token.js';

const dir = mkdtempSync(join(tmpdir(), 'pholly-token-test-'));
const configHome = join(dir, 'config');
process.env.XDG_CONFIG_HOME = configHome;

test.after(() => { rmSync(dir, {recursive: true, force: true}); });

test('creates a token file on first use', () => {
  const token = getOrCreateToken();
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]{64}$/);
  const stat = statSync(join(configHome, 'pholly-figma-mcp', 'token'));
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(statSync(configHome).mode & 0o777, 0o700);
});

test('returns the same token across calls', () => {
  assert.equal(getOrCreateToken(), getOrCreateToken());
});

test('honours the PHOLLY_TOKEN environment override', () => {
  const previous = process.env.PHOLLY_TOKEN;
  process.env.PHOLLY_TOKEN = 'env-token-value';
  try {
    assert.equal(getOrCreateToken(), 'env-token-value');
    assert.equal(tokenMatches('env-token-value', 'env-token-value'), true);
    assert.equal(tokenMatches('env-token-value', 'wrong'), false);
  } finally {
    if (previous === undefined) delete process.env.PHOLLY_TOKEN;
    else process.env.PHOLLY_TOKEN = previous;
  }
});

test('bridgeMac is bound to the nonce and label', () => {
  const nonce = 'a'.repeat(64);
  const mac = bridgeMac('secret', nonce, 'file-1');
  assert.equal(macMatches(mac, mac), true);
  assert.equal(macMatches(mac, bridgeMac('secret', nonce, 'file-2')), false);
  assert.equal(macMatches(mac, bridgeMac('other', nonce, 'file-1')), false);
  assert.equal(macMatches(mac, undefined), false);
});

test('tokenMatches rejects mismatches and missing values', () => {
  assert.equal(tokenMatches('a'.repeat(64), 'b'.repeat(64)), false);
  assert.equal(tokenMatches('a'.repeat(64), undefined), false);
  assert.equal(tokenMatches('a'.repeat(64), null), false);
  assert.equal(tokenMatches('a'.repeat(64), ''), false);
  assert.equal(tokenMatches('a'.repeat(64), 'a'.repeat(63)), false);
});
