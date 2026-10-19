import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restrictToOwner } from './owner-only.js';

test('restrictToOwner is a no-op off Windows and never throws', () => {
  const root = mkdtempSync(join(tmpdir(), 'pholly-owner-'));
  try {
    const file = join(root, 'token');
    writeFileSync(file, 'value');
    assert.doesNotThrow(() => restrictToOwner(file));
    assert.doesNotThrow(() => restrictToOwner(join(root, 'missing')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
