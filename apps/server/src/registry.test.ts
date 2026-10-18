import test from 'node:test';
import assert from 'node:assert/strict';
import { nextLiveness, registerConnectedFile, unregisterConnectedFile, type BridgeSocket, type ConnectedTarget } from './registry.js';

const socket = (): BridgeSocket => ({send() {}});
const closedSocket = (): BridgeSocket => ({send() {}, readyState: 3});

test('registers connected file metadata', () => {
  const files = new Map<string, ConnectedTarget>();
  const client = socket();
  const registration = registerConnectedFile(files, client, '', {fileKey:'file-1',name:'LABs',pageId:'0:1',pageName:'Home',editorType:'figma'}, 123);
  assert.deepEqual(registration, {fileKey:'file-1', accepted:true});
  assert.deepEqual(files.get(registration.fileKey)?.info, {fileKey:'file-1',name:'LABs',pageId:'0:1',pageName:'Home',editorType:'figma',connectedAt:123});
});

test('replaces a temporary key when real metadata arrives', () => {
  const files = new Map<string, ConnectedTarget>();
  const client = socket();
  const temporary = registerConnectedFile(files, client, '', {fileKey:'temporary',name:'Figma document'});
  const real = registerConnectedFile(files, client, temporary.fileKey, {fileKey:'real-key',name:'LABs'});
  assert.equal(real.accepted, true);
  assert.equal(files.has(temporary.fileKey), false);
  assert.equal(files.get(real.fileKey)?.info.name, 'LABs');
});

test('refuses to overwrite a key held by a live socket', () => {
  const files = new Map<string, ConnectedTarget>();
  const first = socket();
  const second = socket();
  registerConnectedFile(files, first, '', {fileKey:'file-1',name:'First'});
  const registration = registerConnectedFile(files, second, '', {fileKey:'file-1',name:'Attacker'});
  assert.deepEqual(registration, {fileKey:'file-1', accepted:false});
  assert.equal(files.get('file-1')?.info.name, 'First');
});

test('keeps the previous registration when a new key is busy', () => {
  const files = new Map<string, ConnectedTarget>();
  const owner = socket();
  const mover = socket();
  registerConnectedFile(files, owner, '', {fileKey:'busy', name:'Owner'});
  registerConnectedFile(files, mover, '', {fileKey:'temporary', name:'Temp'});
  const registration = registerConnectedFile(files, mover, 'temporary', {fileKey:'busy', name:'Mover'});
  assert.equal(registration.accepted, false);
  assert.equal(files.get('temporary')?.socket, mover);
  assert.equal(files.get('busy')?.info.name, 'Owner');
});

test('allows takeover after the previous socket closed', () => {
  const files = new Map<string, ConnectedTarget>();
  registerConnectedFile(files, closedSocket(), '', {fileKey:'file-1',name:'First'});
  const registration = registerConnectedFile(files, socket(), '', {fileKey:'file-1',name:'Second'});
  assert.equal(registration.accepted, true);
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

test('drops a socket only after a ping goes unanswered', () => {
  assert.deepEqual(nextLiveness(false, 'ping'), {awaitingPong:true, drop:false});
  assert.deepEqual(nextLiveness(true, 'pong'), {awaitingPong:false, drop:false});
  assert.deepEqual(nextLiveness(true, 'ping'), {awaitingPong:true, drop:true});
});
