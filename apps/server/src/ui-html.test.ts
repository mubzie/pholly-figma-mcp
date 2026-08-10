import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(join(here, '..', '..', 'plugin', 'src', 'ui.html'), 'utf8');

test('file-info hello keeps the message type as hello', () => {
  const line = ui.split('\n').find(l => l.includes("type==='file-info'"));
  assert.ok(line, 'file-info handler exists in ui.html');
  assert.ok(line.includes('const {type:_drop,...fileInfo}=m'), 'file-info type is destructured out of the payload');
  assert.ok(line.includes("{type:'hello',...fileInfo,token}"), 'hello message keeps its type after the spread');
  assert.ok(!line.includes("{type:'hello',...m,"), 'raw payload spread must never overwrite the message type');
});

test('fallback hello carries the bridge token', () => {
  const line = ui.split('\n').find(l => l.includes('fileKey:fallbackKey'));
  assert.ok(line, 'fallback hello exists in ui.html');
  assert.match(line, /type:'hello'/);
  assert.match(line, /token/);
});
