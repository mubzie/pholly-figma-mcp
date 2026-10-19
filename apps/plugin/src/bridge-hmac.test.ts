import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hmacSha256Hex } from './bridge-hmac.js';

test('plugin HMAC matches node crypto for bridge hellos', () => {
  const samples = [
    ['key', 'The quick brown fox jumps over the lazy dog'],
    ['integration-test-token', `hello\u0000${'a'.repeat(64)}\u0000security-test-file`],
    ['integration-test-token', `ready\u0000${'a'.repeat(64)}.${'b'.repeat(64)}\u0000security-test-file`],
    ['token-with-unicode', 'nonce.file-キー']
  ] as const;
  for (const [key, message] of samples) {
    assert.equal(hmacSha256Hex(key, message), createHmac('sha256', key).update(message).digest('hex'));
  }
});
