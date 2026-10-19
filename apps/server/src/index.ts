#!/usr/bin/env node
import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BridgeRequest, BridgeResponse, ConnectedFile } from '@pholly/figma-protocol';
import { tools } from './tools.js';
import { validateToolArguments } from './validate.js';
import { nextLiveness, registerConnectedFile, unregisterConnectedFile, type ConnectedTarget } from './registry.js';
import { formatToolResult } from './content.js';
import { materializeAssetBundle, materializeScreenshotBundle } from './assets.js';
import { bridgeMac, getOrCreateToken, isReservedFileKey, macMatches, readyMac, tokenMatches } from './token.js';
import { stampPlugin } from './setup.js';
import { inlineImageSource } from './images.js';

const serverVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;
const maxBodyBytes = 2 * 1024 * 1024;
const maxStdioLineBytes = 2 * 1024 * 1024;
const leaderProofMs = 5_000;
const supportedProtocolVersions = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);

type BridgeMode = 'leader' | 'follower' | 'rejected';
type PendingRpc = { resolve: (response: BridgeResponse) => void; timer: NodeJS.Timeout; socket: WebSocket };

function isLocalHost(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === 'null') return true;
  try {
    const url = new URL(origin);
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

function nonceFrom(url: URL): string | null {
  const nonce = url.searchParams.get('nonce') ?? '';
  return /^[0-9a-f]{32,128}$/i.test(nonce) ? nonce : null;
}

function runSetup(): boolean {
  if (!process.argv.includes('setup')) return false;
  const here = fileURLToPath(new URL('../', import.meta.url));
  const bundled = join(here, 'plugin');
  const argIndex = process.argv.indexOf('setup');
  const target = resolve(process.argv[argIndex + 1] ?? 'pholly-figma-plugin');
  if (!existsSync(join(bundled, 'code.js'))) {
    console.error(`pholly-figma-mcp: bundled plugin not found at ${bundled}.`);
    console.error('Build the package first with: npm run build');
    process.exitCode = 1;
    return true;
  }
  try {
    stampPlugin(bundled, target, getOrCreateToken());
  } catch (error) {
    console.error(`pholly-figma-mcp: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Build the package first with: npm run build');
    process.exitCode = 1;
    return true;
  }
  console.log(`Pholly Figma plugin copied to ${target}`);
  console.log(`Import ${join(target, 'manifest.json')} in Figma via Plugins → Development → Import plugin from manifest, then run it.`);
  process.exitCode = 0;
  return true;
}

if (!runSetup()) {
  const port = Number(process.env.PHOLLY_PORT ?? 1995);
  const token = getOrCreateToken();
  const files = new Map<string, ConnectedTarget<WebSocket>>();
  const pending = new Map<string, PendingRpc>();
  const timeoutMs = Number(process.env.PHOLLY_TIMEOUT ?? 30_000);
  const pingMs = Number(process.env.PHOLLY_WS_PING_MS ?? 15_000);
  let resolveMode: (mode: BridgeMode) => void = () => {};
  const bridgeMode = new Promise<BridgeMode>(resolve => { resolveMode = resolve; });
  let modeSettled = false;
  let leaderProvedAt = 0;
  const settleMode = (mode: BridgeMode) => {
    if (modeSettled) return;
    modeSettled = true;
    resolveMode(mode);
  };

  function isAuthed(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (!header) return false;
    const separator = header.indexOf(' ');
    if (separator <= 0 || header.slice(0, separator).toLowerCase() !== 'bearer') return false;
    return tokenMatches(token, header.slice(separator + 1).trim());
  }
  function sendJson(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }
  function resolveTarget(fileKey: string | undefined): { target?: ConnectedTarget<WebSocket>; error?: BridgeResponse } {
    if (fileKey) {
      const target = files.get(fileKey);
      if (!target) return { error: { id: '', ok: false, error: { code: 'NO_PLUGIN', message: `No plugin is connected for file ${fileKey}.` } } };
      return { target };
    }
    if (files.size === 0) return { error: { id: '', ok: false, error: { code: 'NO_PLUGIN', message: 'No Figma plugin is connected. Open the Pholly plugin in Figma first.' } } };
    if (files.size > 1) return { error: { id: '', ok: false, error: { code: 'AMBIGUOUS_FILE', message: 'More than one Figma file is connected. Pass fileKey from list_files.' } } };
    return { target: files.values().next().value };
  }
  /** Send on a client socket without letting a closed peer throw out of the RPC path. */
  function sendToSocket(socket: WebSocket, payload: string): boolean {
    try {
      if (socket.readyState !== WebSocket.OPEN) return false;
      socket.send(payload);
      return true;
    } catch {
      return false;
    }
  }
  function failPendingFor(socket: WebSocket, code: string, message: string): void {
    for (const [id, waiter] of pending) {
      if (waiter.socket !== socket) continue;
      clearTimeout(waiter.timer);
      pending.delete(id);
      waiter.resolve({ id, ok: false, error: { code, message } });
    }
  }
  async function proveLeader(): Promise<boolean> {
    const nonce = randomBytes(32).toString('hex');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/prove?nonce=${nonce}`);
      if (!response.ok) return false;
      const body = await response.json() as { mac?: unknown };
      return macMatches(bridgeMac(token, 'prove', nonce, 'leader'), body.mac);
    } catch {
      return false;
    }
  }
  /**
   * Follower mode used to prove once and then send the bearer token forever.
   * If the leader died and another process took the port, the next call leaked
   * the token. Re-prove before use, and never send the token without a fresh
   * proof.
   */
  async function ensureLeaderProof(): Promise<boolean> {
    if (Date.now() - leaderProvedAt < leaderProofMs) return true;
    if (!(await proveLeader())) return false;
    leaderProvedAt = Date.now();
    return true;
  }
  async function rpc(request: Omit<BridgeRequest, 'id'>): Promise<BridgeResponse> {
    const mode = await bridgeMode;
    if (mode === 'rejected') return { id: '', ok: false, error: { code: 'LEADER_UNTRUSTED', message: 'Port is occupied by a process that did not prove it knows the bridge token.' } };
    if (mode === 'follower') {
      if (!(await ensureLeaderProof())) return { id: '', ok: false, error: { code: 'LEADER_UNPROVEN', message: 'The local bridge leader no longer proves it knows the bridge token.' } };
      try {
        const response = await fetch(`http://127.0.0.1:${port}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(request) });
        return await response.json() as BridgeResponse;
      } catch (error) { return { id: '', ok: false, error: { code: 'LEADER_UNAVAILABLE', message: `Local bridge leader is unavailable: ${String(error)}` } }; }
    }
    const resolved = resolveTarget(request.fileKey);
    if (!resolved.target) return resolved.error ?? { id: '', ok: false, error: { code: 'NO_PLUGIN', message: 'No Figma plugin is connected.' } };
    const target = resolved.target;
    const id = randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => { pending.delete(id); resolve({ id, ok: false, error: { code: 'TIMEOUT', message: 'Figma plugin did not respond in time.' } }); }, timeoutMs);
      pending.set(id, { resolve, timer, socket: target.socket });
      if (!sendToSocket(target.socket, JSON.stringify({ ...request, id }))) {
        clearTimeout(timer);
        pending.delete(id);
        resolve({ id, ok: false, error: { code: 'PLUGIN_DISCONNECTED', message: 'The Figma plugin connection closed before the request was sent.' } });
      }
    });
  }
  async function body(req: AsyncIterable<Buffer>): Promise<any> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > maxBodyBytes) throw new Error('Request body is too large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }
  const http = createServer(async (req, res) => {
    try {
      if (!isLocalHost(req.headers.host)) return sendJson(res, 403, { error: 'Forbidden' });
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/ping') return sendJson(res, 200, { ok: true, files: files.size, port });
      if (url.pathname === '/prove' && req.method === 'GET') {
        const nonce = nonceFrom(url);
        if (!nonce) return sendJson(res, 400, { error: 'Bad nonce' });
        return sendJson(res, 200, { mac: bridgeMac(token, 'prove', nonce, 'leader') });
      }
      if (!isAuthed(req)) {
        console.error(`pholly-figma-mcp: rejected ${req.method} ${url.pathname} without a valid token`);
        return sendJson(res, 401, { error: 'Unauthorized' });
      }
      if (url.pathname === '/files') return sendJson(res, 200, [...files.values()].map(entry => entry.info));
      if (url.pathname === '/rpc' && req.method === 'POST') { const requestBody = await body(req); const out = await rpc(requestBody); return sendJson(res, out.ok ? 200 : 400, out); }
      if (url.pathname === '/mcp' && req.method === 'POST') { const requestBody = await body(req); const result = await handleMcp(requestBody); return sendJson(res, 200, result); }
      return sendJson(res, 404, { error: 'Not found' });
    } catch (error) { return sendJson(res, 400, { error: String(error) }); }
  });
  const wss = new WebSocketServer({
    server: http,
    path: '/ws',
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      const hostOk = isLocalHost(info.req.headers.host);
      const originOk = isAllowedOrigin(info.origin);
      if (!hostOk || !originOk) console.error(`pholly-figma-mcp: rejected WebSocket upgrade from host=${info.req.headers.host} origin=${info.origin}`);
      return hostOk && originOk;
    }
  });
  const awaitingPong = new WeakMap<WebSocket, boolean>();
  const challenges = new WeakMap<WebSocket, { nonce: string; serverNonce: string; fileKey: string; message: Record<string, unknown> }>();
  const pingTimer = setInterval(() => {
    for (const client of [...wss.clients]) {
      const next = nextLiveness(awaitingPong.get(client) ?? false, 'ping');
      if (next.drop) { client.terminate(); continue; }
      awaitingPong.set(client, next.awaitingPong);
      try { client.ping(); } catch { client.terminate(); }
    }
  }, pingMs);
  pingTimer.unref();
  wss.on('error', () => {});
  wss.on('connection', socket => {
    let key = '';
    awaitingPong.set(socket, false);
    socket.on('error', () => { try { socket.terminate(); } catch { /* already closed */ } });
    socket.on('pong', () => awaitingPong.set(socket, nextLiveness(true, 'pong').awaitingPong));
    socket.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'hello-begin') {
          const fileKey = typeof msg.fileKey === 'string' ? msg.fileKey : '';
          if (!fileKey) {
            sendToSocket(socket, JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Connected file did not provide a file key' }));
            return;
          }
          if (isReservedFileKey(fileKey)) {
            console.error('pholly-figma-mcp: rejected reserved file key');
            sendToSocket(socket, JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Invalid file key' }));
            socket.close(1008, 'Unauthorized');
            return;
          }
          const nonce = randomBytes(32).toString('hex');
          const serverNonce = randomBytes(32).toString('hex');
          challenges.set(socket, {
            nonce,
            serverNonce,
            fileKey,
            message: { fileKey, name: msg.name, pageId: msg.pageId, pageName: msg.pageName, editorType: msg.editorType }
          });
          sendToSocket(socket, JSON.stringify({ type: 'challenge', nonce, serverNonce }));
          return;
        }
        if (msg.type === 'hello') {
          if (typeof msg.token === 'string') {
            console.error(`pholly-figma-mcp: rejected cleartext hello for fileKey=${msg.fileKey ?? '<missing>'}`);
            sendToSocket(socket, JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Invalid bridge token' }));
            socket.close(1008, 'Unauthorized');
            return;
          }
          const pendingHello = challenges.get(socket);
          if (!pendingHello || msg.nonce !== pendingHello.nonce) {
            sendToSocket(socket, JSON.stringify({ type: 'error', code: 'STALE_CHALLENGE', message: 'Challenge expired' }));
            return;
          }
          if (msg.serverNonce !== pendingHello.serverNonce) {
            sendToSocket(socket, JSON.stringify({ type: 'error', code: 'STALE_CHALLENGE', message: 'Challenge expired' }));
            return;
          }
          if (!macMatches(bridgeMac(token, 'hello', pendingHello.nonce, pendingHello.fileKey), msg.mac)) {
            console.error(`pholly-figma-mcp: rejected hello for fileKey=${pendingHello.fileKey}`);
            sendToSocket(socket, JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'Invalid bridge token' }));
            socket.close(1008, 'Unauthorized');
            return;
          }
          challenges.delete(socket);
          const registration = registerConnectedFile(files, socket, key, pendingHello.message);
          if (!registration.accepted) {
            sendToSocket(socket, JSON.stringify({ type: 'error', code: 'FILE_BUSY', message: 'This file is connected in another plugin window' }));
            socket.close(1008, 'File busy');
            return;
          }
          key = registration.fileKey;
          sendToSocket(socket, JSON.stringify({
            type: 'ready',
            fileKey: key,
            mac: readyMac(token, pendingHello.nonce, pendingHello.serverNonce, key)
          }));
          return;
        }
        if (msg.id && pending.has(msg.id)) {
          const waiter = pending.get(msg.id)!;
          clearTimeout(waiter.timer);
          pending.delete(msg.id);
          waiter.resolve(msg);
        }
      } catch (error) {
        console.error(`pholly-figma-mcp: bridge message failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    socket.on('close', () => {
      unregisterConnectedFile(files, socket, key);
      failPendingFor(socket, 'PLUGIN_DISCONNECTED', 'The Figma plugin disconnected before the request finished.');
    });
  });
  function protocolVersionFor(clientVersion: unknown): string {
    return typeof clientVersion === 'string' && supportedProtocolVersions.has(clientVersion) ? clientVersion : '2024-11-05';
  }
  async function handleMcp(q: any): Promise<any | null> {
    if (q.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: q.id, error: { code: -32600, message: 'Invalid JSON-RPC request' } };
    if (q.method === 'initialize') return { jsonrpc: '2.0', id: q.id, result: { protocolVersion: protocolVersionFor(q.params?.protocolVersion), capabilities: { tools: {} }, serverInfo: { name: 'pholly-figma-mcp', version: serverVersion } } };
    if (q.method === 'notifications/initialized') return null;
    if (q.method === 'ping') return { jsonrpc: '2.0', id: q.id, result: {} };
    if (q.method === 'tools/list') return { jsonrpc: '2.0', id: q.id, result: { tools } };
    if (q.method === 'tools/call') {
      const name = q.params?.name;
      const args = { ...(q.params?.arguments ?? {}) };
      const tool = tools.find(candidate => candidate.name === name);
      if (!tool) return { jsonrpc: '2.0', id: q.id, result: formatToolResult(name, { id: '', ok: false, error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${String(name)}` } }) };
      const invalid = validateToolArguments(tool.inputSchema as { type?: string; properties?: Record<string, any>; required?: string[] }, args);
      if (invalid) return { jsonrpc: '2.0', id: q.id, result: formatToolResult(name, { id: '', ok: false, error: { code: 'INVALID_ARGUMENTS', message: invalid } }) };
      if (name === 'list_files') {
        const mode = await bridgeMode;
        if (mode === 'rejected') return { jsonrpc: '2.0', id: q.id, result: formatToolResult(name, { id: '', ok: false, error: { code: 'LEADER_UNTRUSTED', message: 'Port is occupied by a process that did not prove it knows the bridge token.' } }) };
        let connected = [...files.values()].map(entry => entry.info);
        if (mode === 'follower') {
          if (!(await ensureLeaderProof())) return { jsonrpc: '2.0', id: q.id, result: formatToolResult(name, { id: '', ok: false, error: { code: 'LEADER_UNPROVEN', message: 'The local bridge leader no longer proves it knows the bridge token.' } }) };
          try { connected = await (await fetch(`http://127.0.0.1:${port}/files`, { headers: { authorization: `Bearer ${token}` } })).json() as ConnectedFile[]; } catch { /* keep the local view */ }
        }
        return { jsonrpc: '2.0', id: q.id, result: { content: [{ type: 'text', text: JSON.stringify(connected, null, 2) }] } };
      }
      if (name === 'create_image') {
        try { args.src = await inlineImageSource(args.src); }
        catch (error) { return { jsonrpc: '2.0', id: q.id, result: formatToolResult(name, { id: '', ok: false, error: { code: 'IMAGE_FETCH_FAILED', message: error instanceof Error ? error.message : String(error) } }) }; }
      }
      let out = await rpc({ method: name, fileKey: args.fileKey, params: args });
      if (name === 'export_selection_assets' && out.ok) {
        try { out = { ...out, result: await materializeAssetBundle(out.result, args.outputDir) }; }
        catch (error) { out = { id: out.id, ok: false, error: { code: 'ASSET_WRITE_FAILED', message: error instanceof Error ? error.message : String(error) } }; }
      }
      if (name === 'save_screenshots' && out.ok) {
        try { out = { ...out, result: await materializeScreenshotBundle(out.result, args.outputDir) }; }
        catch (error) { out = { id: out.id, ok: false, error: { code: 'ASSET_WRITE_FAILED', message: error instanceof Error ? error.message : String(error) } }; }
      }
      return { jsonrpc: '2.0', id: q.id, result: formatToolResult(name, out) };
    }
    return { jsonrpc: '2.0', id: q.id, error: { code: -32601, message: `Method not found: ${q.method}` } };
  }
  http.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') {
      console.error(`pholly-figma-mcp could not open bridge port ${port}: ${error.message}`);
      settleMode('rejected');
      return;
    }
    void proveLeader().then(trusted => {
      if (!trusted) {
        console.error(`pholly-figma-mcp: port ${port} is not a pholly bridge; refusing to send the bridge token`);
        settleMode('rejected');
        return;
      }
      console.error(`pholly-figma-mcp using existing bridge on http://localhost:${port}`);
      leaderProvedAt = Date.now();
      settleMode('follower');
    });
  });
  http.listen(port, '127.0.0.1', () => {
    console.error(`pholly-figma-mcp listening on http://localhost:${port}`);
    settleMode('leader');
  });

  // MCP clients launch this package over stdio. Each input line is one JSON-RPC
  // request and each response is emitted as one JSON line on stdout.
  if (!process.stdin.isTTY || process.env.PHOLLY_STDIO === '1') {
    process.stdin.on('error', () => {});
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      input += chunk;
      const lines = input.split('\n');
      input = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.length > maxStdioLineBytes) continue;
        let request: any;
        try { request = JSON.parse(line); } catch { continue; }
        void handleMcp(request)
          .then(result => { if (result) process.stdout.write(`${JSON.stringify(result)}\n`); })
          .catch(error => {
            console.error(`pholly-figma-mcp: MCP request failed: ${error instanceof Error ? error.message : String(error)}`);
            process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request?.id, error: { code: -32603, message: 'Internal error' } })}\n`);
          });
      }
    });
  }
}
