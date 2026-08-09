import test from 'node:test';
import assert from 'node:assert/strict';
import { registerConnectedFile, unregisterConnectedFile, type BridgeSocket, type ConnectedTarget } from './registry.js';

const socket = (): BridgeSocket => ({send() {}});
const closedSocket = (): BridgeSocket => ({send() {}, readyState: 3});

test('registers connected file metadata', () => {
  const files = new Map<string, ConnectedTarget>();
  const client = socket();
  const key = registerConnectedFile(files, client, '', {fileKey:'file-1',name:'LABs',pageId:'0:1',pageName:'Home',editorType:'figma'}, 123);
  assert.equal(key, 'file-1');
  assert.deepEqual(files.get(key)?.info, {fileKey:'file-1',name:'LABs',pageId:'0:1',pageName:'Home',editorType:'figma',connectedAt:123});
});

test('replaces a temporary key when real metadata arrives', () => {
  const files = new Map<string, ConnectedTarget>();
  const client = socket();
  const temporaryKey = registerConnectedFile(files, client, '', {fileKey:'temporary',name:'Figma document'});
  const realKey = registerConnectedFile(files, client, temporaryKey, {fileKey:'real-key',name:'LABs'});
  assert.equal(files.has(temporaryKey), false);
  assert.equal(files.get(realKey)?.info.name, 'LABs');
});

test('refuses to overwrite a key held by a live socket', () => {
  const files = new Map<string, ConnectedTarget>();
  const first = socket();
  const second = socket();
  registerConnectedFile(files, first, '', {fileKey:'file-1',name:'First'});
  const key = registerConnectedFile(files, second, '', {fileKey:'file-1',name:'Attacker'});
  assert.equal(key, 'file-1');
  assert.equal(files.get('file-1')?.info.name, 'First');
});

test('allows takeover after the previous socket closed', () => {
  const files = new Map<string, ConnectedTarget>();
  registerConnectedFile(files, closedSocket(), '', {fileKey:'file-1',name:'First'});
  registerConnectedFile(files, socket(), '', {fileKey:'file-1',name:'Second'});
  assert.equal(files.get('file-1')?.info.name, 'Second');
});

test('only removes a registration owned by the closing socket', () => {
  const files = new Map<string, ConnectedTarget>();
  const first: BridgeSocket = {send() {}, readyState: 1};
  registerConnectedFile(files, first, '', {fileKey:'file-1',name:'First'});
  first.readyState = 3;
  const replacement = socket();
  registerConnectedFile(files, replacement, '', {fileKey:'file-1',name:'Second'});
  assert.equal(files.get('file-1')?.info.name, 'Second');
  unregisterConnectedFile(files, first, 'file-1');
  assert.equal(files.get('file-1')?.info.name, 'Second');
  unregisterConnectedFile(files, replacement, 'file-1');
  assert.equal(files.size, 0);
});
