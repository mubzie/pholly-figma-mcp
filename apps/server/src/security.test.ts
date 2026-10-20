import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createHmac } from 'node:crypto';
import { connect as connectTcp } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';

const port = 21995;
const token = 'integration-test-token';
const serverEntry = join(dirname(fileURLToPath(import.meta.url)), 'index.js');

function macFor(domain: 'prove' | 'hello' | 'ready', nonce: string, label: string, secret = token): string {
  return createHmac('sha256', secret).update(`${domain}\u0000${nonce}\u0000${label}`).digest('hex');
}

function startServer(extra: Record<string, string> = {}, listenPort = port): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverEntry], {
      env: { ...process.env, PHOLLY_PORT: String(listenPort), PHOLLY_TOKEN: token, PHOLLY_STDIO: '1', ...extra },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let settled = false;
    const deadline = Date.now() + 8000;
    const probe = async () => {
      if (Date.now() > deadline) { if (!settled) { settled = true; reject(new Error('server did not start in time')); } return; }
      try {
        const res = await fetch(`http://127.0.0.1:${listenPort}/ping`);
        if (res.ok) { if (!settled) { settled = true; resolve(child); } return; }
      } catch { /* retry until the bridge binds */ }
      setTimeout(probe, 100);
    };
    child.on('exit', code => { if (!settled) { settled = true; reject(new Error(`server exited early with code ${code}`)); } });
    void probe();
  });
}

function httpGet(path: string, headers: Record<string, string> = {}): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET', headers }, res => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on('error', reject);
    req.end();
  });
}

function rawRequest(payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connectTcp(port, '127.0.0.1', () => sock.end(payload));
    let data = '';
    const timer = setTimeout(() => { sock.destroy(); resolve(data); }, 1000);
    sock.on('data', chunk => { data += chunk; });
    sock.on('end', () => { clearTimeout(timer); resolve(data); });
    sock.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

function registerPlugin(fileKey: string, name = fileKey): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'null' });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error(`hello timed out for ${fileKey}`)); }, 4000);
    let clientNonce = '';
    let serverNonce = '';
    ws.on('error', error => { clearTimeout(timer); reject(error); });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello-begin', fileKey, name, editorType: 'figma' })));
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'challenge') {
        clientNonce = msg.nonce;
        serverNonce = msg.serverNonce;
        ws.send(JSON.stringify({ type: 'hello', nonce: msg.nonce, serverNonce: msg.serverNonce, mac: macFor('hello', msg.nonce, fileKey), fileKey }));
      } else if (msg.type === 'ready') {
        if (msg.mac !== macFor('ready', `${clientNonce}.${serverNonce}`, fileKey)) {
          clearTimeout(timer);
          ws.terminate();
          reject(new Error('server did not prove the bridge token'));
          return;
        }
        clearTimeout(timer);
        resolve(ws);
      } else if (msg.type === 'error' && msg.code !== 'STALE_CHALLENGE') {
        clearTimeout(timer);
        reject(Object.assign(new Error(msg.message ?? msg.code), { code: msg.code }));
      }
    });
  });
}

function helloOutcome(send: (challenge: { nonce: string; serverNonce: string }, ws: WebSocket) => void, fileKey: string): Promise<string> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'null' });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello-begin', fileKey, name: 'Probe' })));
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'challenge') send(msg, ws);
      else if (msg.type === 'error') resolve(msg.code);
      else if (msg.type === 'ready') resolve('ready');
    });
    ws.on('error', () => resolve('error'));
    setTimeout(() => resolve('timeout'), 4000);
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
  assert.equal((await httpGet('/files', { authorization: 'Bearer wrong-token' })).status, 401);
  assert.equal((await httpGet('/files', { authorization: 'Bearer ' + token })).status, 200);
  assert.equal((await httpGet('/files', { authorization: 'Basic abc' })).status, 401);
});

test('/rpc requires the bearer token', async () => {
  const post = (headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{"method":"get_metadata","params":{}}' });
  assert.equal((await post()).status, 401);
  assert.equal((await post({ authorization: 'Bearer wrong' })).status, 401);
  const authed = await post({ authorization: `Bearer ${token}` });
  assert.notEqual(authed.status, 401);
});

test('rejects requests with a non-local Host header (DNS rebinding)', async () => {
  assert.equal((await httpGet('/files', { host: 'evil.example.com' })).status, 403);
  assert.equal((await httpGet('/ping', { host: 'evil.example.com' })).status, 403);
  assert.equal((await httpGet('/prove?nonce=' + 'ab'.repeat(16), { host: 'evil.example.com' })).status, 403);
});

test('rejects requests that omit the Host header', async () => {
  const response = await rawRequest('GET /files HTTP/1.0\r\n\r\n');
  assert.match(response, /^HTTP\/1\.[01] 403/);
});

test('/prove lets a follower check the leader without sending the token', async () => {
  const nonce = 'ab'.repeat(32);
  const response = await fetch(`http://127.0.0.1:${port}/prove?nonce=${nonce}`);
  assert.equal(response.status, 200);
  const body = await response.json() as { mac: string };
  assert.equal(body.mac, macFor('prove', nonce, 'leader'));
  assert.equal(JSON.stringify(body).includes(token), false);
});

test('a prove MAC cannot complete hello for the same label', async () => {
  const outcome = await helloOutcome((challenge, ws) => {
    const proveMac = macFor('prove', challenge.nonce, 'proved-file');
    ws.send(JSON.stringify({ type: 'hello', nonce: challenge.nonce, serverNonce: challenge.serverNonce, mac: proveMac, fileKey: 'proved-file' }));
  }, 'proved-file');
  assert.equal(outcome, 'UNAUTHORIZED');
});

test('the reserved file key leader cannot register', async () => {
  const outcome = await helloOutcome(() => {}, 'leader');
  assert.equal(outcome, 'UNAUTHORIZED');
});

test('ready carries a server MAC over both nonces', async () => {
  const ws = await registerPlugin('ready-proof-file', 'Ready proof');
  ws.close();
});

test('rejects WebSocket upgrades from remote origins', async () => {
  const outcome = await new Promise<string>(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'https://evil.example.com' });
    ws.on('open', () => resolve('open'));
    ws.on('unexpected-response', () => resolve('rejected'));
    ws.on('error', () => resolve('error'));
    ws.on('close', () => resolve('close'));
    setTimeout(() => resolve('timeout'), 4000);
  });
  assert.notEqual(outcome, 'open');
});

test('accepts a challenged hello from a null origin', async () => {
  const ws = await registerPlugin('security-test-file', 'Security Test');
  ws.close();
});

test('rejects a cleartext token and a bad MAC', async () => {
  const cleartext = await new Promise<string>(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'null' });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token: 'wrong', fileKey: 'attacker-file', name: 'Attacker' })));
    ws.on('message', data => { if (JSON.parse(data.toString()).type === 'error') resolve('error-received'); });
    ws.on('error', () => resolve('error'));
    setTimeout(() => resolve('timeout'), 4000);
  });
  assert.equal(cleartext, 'error-received');

  const badMac = await helloOutcome((challenge, ws) => {
    ws.send(JSON.stringify({ type: 'hello', nonce: challenge.nonce, serverNonce: challenge.serverNonce, mac: '0'.repeat(64), fileKey: 'attacker-file' }));
  }, 'attacker-file');
  assert.equal(badMac, 'UNAUTHORIZED');
});

test('a second plugin does not receive ready while the file is busy', async () => {
  const first = await registerPlugin('busy-file', 'First');
  try {
    await assert.rejects(() => registerPlugin('busy-file', 'Second'), /another plugin window/);
  } finally {
    first.close();
    await new Promise(resolve => first.once('close', resolve));
  }
  const replacement = await registerPlugin('busy-file', 'Second');
  replacement.close();
});

test('omitting fileKey is an error once two files are connected', async () => {
  const first = await registerPlugin('file-a', 'A');
  const second = await registerPlugin('file-b', 'B');
  try {
    const response = await fetch(`http://127.0.0.1:${port}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ method: 'get_metadata', params: {} })
    });
    const body = await response.json() as { ok: boolean; error?: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error?.code, 'AMBIGUOUS_FILE');
  } finally {
    first.close();
    second.close();
  }
});

test('drops a plugin that stops answering pings and lets the next hello take the file', async () => {
  const pingPort = 21996;
  const pingChild = await startServer({ PHOLLY_WS_PING_MS: '200' }, pingPort);
  const open = (autoPong: boolean) => new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${pingPort}/ws`, { origin: 'null', autoPong });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('ping hello timed out')); }, 4000);
    ws.on('error', error => { clearTimeout(timer); reject(error); });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello-begin', fileKey: 'ping-file', name: 'Ping' })));
    ws.on('message', data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'challenge') ws.send(JSON.stringify({ type: 'hello', nonce: msg.nonce, serverNonce: msg.serverNonce, mac: macFor('hello', msg.nonce, 'ping-file'), fileKey: 'ping-file' }));
      else if (msg.type === 'ready') { clearTimeout(timer); resolve(ws); }
    });
  });
  try {
    const silent = await open(false);
    const closed = await new Promise<string>(resolve => {
      silent.on('close', () => resolve('closed'));
      setTimeout(() => resolve('timeout'), 2000);
    });
    assert.equal(closed, 'closed');
    const replacement = await open(true);
    replacement.close();
  } finally {
    pingChild.kill();
  }
});
