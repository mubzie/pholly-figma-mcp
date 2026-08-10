import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, normalizeColor, clamp01 } from './color.js';

test('hexToRgb parses 3, 4, 6, and 8 digit hex', () => {
  assert.deepEqual(hexToRgb('#f00'), {r: 1, g: 0, b: 0});
  assert.deepEqual(hexToRgb('00ff80'), {r: 0, g: 1, b: 0x80 / 255});
  assert.deepEqual(hexToRgb('#abc8'), {r: 0xaa / 255, g: 0xbb / 255, b: 0xcc / 255});
  assert.equal(hexToRgb('nope'), null);
  assert.equal(hexToRgb('#12'), null);
});

test('normalizeColor accepts hex strings with optional opacity', () => {
  assert.deepEqual(normalizeColor('#ff0000'), {r: 1, g: 0, b: 0, a: 1});
  assert.deepEqual(normalizeColor('#f00', 0.5), {r: 1, g: 0, b: 0, a: 0.5});
  assert.equal(normalizeColor('#ff000080').a, Math.round((0x80 / 255) * 1000) / 1000);
});

test('normalizeColor accepts rgba objects', () => {
  assert.deepEqual(normalizeColor({r: 0.2, g: 0.4, b: 0.6}), {r: 0.2, g: 0.4, b: 0.6, a: 1});
  assert.deepEqual(normalizeColor({r: 1, g: 1, b: 1, a: 0.25}), {r: 1, g: 1, b: 1, a: 0.25});
  assert.deepEqual(normalizeColor({r: 1, g: 0, b: 0, a: 1}, 0.25), {r: 1, g: 0, b: 0, a: 0.25});
});

test('normalizeColor rejects invalid input', () => {
  assert.throws(() => normalizeColor('not-a-color'));
  assert.throws(() => normalizeColor({r: 'x', g: 0, b: 0}));
  assert.throws(() => normalizeColor(42));
  assert.throws(() => normalizeColor(null));
});

test('clamp01 clamps to the unit range', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(0.5), 0.5);
});
