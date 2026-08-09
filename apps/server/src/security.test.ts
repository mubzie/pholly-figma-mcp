import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';

const port = 21995;
const token = 'integration-test-token';
const serverEntry = join(dirname(fileURLToPath(import.meta.url)), 'index.js');

function startServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverEntry], {
      env: {...process.env, PHOLLY_PORT: String(port), PHOLLY_TOKEN: token, PHOLLY_STDIO: '1'},
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let settled = false;
    const deadline = Date.now() + 8000;
    const probe = async () => {
      if (Date.now() > deadline) { if (!settled) { settled = true; reject(new Error('server did not start in time')); } return; }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ping`);
        if (res.ok) { if (!settled) { settled = true; resolve(child); } return; }
      } catch {}
      setTimeout(probe, 100);
    };
    child.on('exit', code => { if (!settled) { settled = true; reject(new Error(`server exited early with code ${code}`)); } });
    void probe();
  });
}

function httpGet(path: string, headers: Record<string, string> = {}): Promise<{status: number}> {
  return new Promise((resolve, reject) => {
    const req = request({hostname: '127.0.0.1', port, path, method: 'GET', headers}, res => {
      res.resume();
      resolve({status: res.statusCode ?? 0});
    });
    req.on('error', reject);
    req.end();
  });
}

let child: ChildProcess;

test.before(async () => { child = await startServer(); });
test.after(() => { child?.kill(); });

test('/ping stays open without auth', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/ping`);
  assert.equal(res.status, 200);
});

test('/files requires the bearer token', async () => {
  assert.equal((await httpGet('/files')).status, 401);
  assert.equal((await httpGet('/files', {authorization: 'Bearer wrong-token'})).status, 401);
  assert.equal((await httpGet('/files', {authorization: 'Bearer ' + token})).status, 200);
  assert.equal((await httpGet('/files', {authorization: 'Basic abc'})).status, 401);
});

test('/rpc requires the bearer token', async () => {
  const post = (headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}/rpc`, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: '{"method":"get_metadata","params":{}}'});
  assert.equal((await post()).status, 401);
  assert.equal((await post({authorization: 'Bearer wrong'})).status, 401);
  const authed = await post({authorization: `Bearer ${token}`});
  assert.notEqual(authed.status, 401);
});

test('rejects requests with a non-local Host header (DNS rebinding)', async () => {
  const res = await httpGet('/files', {host: 'evil.example.com'});
  assert.equal(res.status, 403);
});

test('rejects WebSocket upgrades from remote origins', async () => {
  const outcome = await new Promise<string>(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {origin: 'https://evil.example.com'});
    ws.on('open', () => resolve('open'));
    ws.on('unexpected-response', () => resolve('rejected'));
    ws.on('error', () => resolve('error'));
    ws.on('close', () => resolve('close'));
    setTimeout(() => resolve('timeout'), 4000);
  });
  assert.notEqual(outcome, 'open');
});

test('accepts WebSocket upgrades from null origins with a valid token', async () => {
  const outcome = await new Promise<string>(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {origin: 'null'});
    ws.on('open', () => {
      ws.send(JSON.stringify({type: 'hello', token, fileKey: 'security-test-file', name: 'Security Test'}));
    });
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ready') { ws.close(); resolve('ready'); }
    });
    ws.on('error', () => resolve('error'));
    setTimeout(() => resolve('timeout'), 4000);
  });
  assert.equal(outcome, 'ready');
});

test('rejects hello messages with an invalid token', async () => {
  const outcome = await new Promise<string>(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {origin: 'null'});
    ws.on('open', () => {
      ws.send(JSON.stringify({type: 'hello', token: 'wrong', fileKey: 'attacker-file', name: 'Attacker'}));
    });
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'error') { resolve('error-received'); }
    });
    ws.on('close', code => resolve(`closed-${code}`));
    ws.on('error', () => resolve('error'));
    setTimeout(() => resolve('timeout'), 4000);
  });
  assert.equal(outcome, 'error-received');
});
