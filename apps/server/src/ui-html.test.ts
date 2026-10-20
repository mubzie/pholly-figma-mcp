import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(join(here, '..', '..', 'plugin', 'src', 'ui.html'), 'utf8');

test('file-info hello keeps the message type as hello-begin', () => {
  assert.match(ui, /const \{type:_drop,\.\.\.fileInfo\}=m/);
  assert.match(ui, /beginHello\(fileInfo\.fileKey,fileInfo\)/);
  assert.doesNotMatch(ui, /\{type:'hello',\.\.\.m/);
  assert.doesNotMatch(ui, /\{type:'hello',\.\.\.fileInfo,token\}/);
});

test('registration proves the token instead of sending it', () => {
  assert.match(ui, /type:'hello-begin'/);
  assert.match(ui, /hmacSha256Hex\(token,/);
  assert.match(ui, /type:'hello',nonce:m\.nonce,serverNonce:m\.serverNonce,mac,fileKey/);
  assert.doesNotMatch(ui, /type:'hello',token/);
  assert.match(ui, /\/\*__BRIDGE_HMAC__\*\//);
});

test('the plugin does not run a method until the server proves the token', () => {
  assert.match(ui, /verifyReady/);
  assert.match(ui, /serverVerified/);
  assert.match(ui, /if\(!serverVerified\)/);
  assert.match(ui, /UNVERIFIED_BRIDGE/);
  assert.match(ui, /ready\\u0000/);
  assert.match(ui, /hello\\u0000/);
});

test('the plugin dials loopback on the stamped port', () => {
  assert.match(ui, /ws:\/\/localhost:__PHOLLY_PORT__\/ws/);
  assert.doesNotMatch(ui, /ws:\/\/localhost:1995/);
});

test('a busy file is reported instead of a successful connection', () => {
  assert.match(ui, /FILE_BUSY/);
  assert.match(ui, /another plugin window/);
});

test('the identity card is not part of the plugin UI', () => {
  assert.doesNotMatch(ui, /class="card identity"/);
  assert.doesNotMatch(ui, /\.identity\{/);
  assert.doesNotMatch(ui, /min-width:320px/);
  assert.match(ui, /width:max-content/);
  assert.match(ui, /min-width:250px/);
  assert.match(ui, /\.workspace\{[^}]*width:100%/);
  assert.match(ui, /\.workspace\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(ui, /grid-template-columns:max-content/);
  assert.match(ui, /Math\.max\(250/);
  assert.match(ui, /type:'resize'/);
});
