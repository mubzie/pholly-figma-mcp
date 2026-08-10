#!/usr/bin/env node
import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BridgeRequest, BridgeResponse, ConnectedFile } from '@pholly/figma-protocol';
import { tools } from './tools.js';
import { registerConnectedFile, unregisterConnectedFile, type ConnectedTarget } from './registry.js';
import { formatToolResult } from './content.js';
import { materializeAssetBundle, materializeScreenshotBundle } from './assets.js';
import { getOrCreateToken, tokenMatches } from './token.js';

const TOKEN_PLACEHOLDER = '__PHOLLY_TOKEN__';

function isLocalHost(host: string | undefined): boolean {
  if (!host) return true;
  const h = host.replace(/:\d+$/, '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1';
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

function runSetup(): boolean {
  if (!process.argv.includes('setup')) return false;
  const here = fileURLToPath(new URL('../', import.meta.url));
  const bundled = join(here, 'plugin');
  const argIndex = process.argv.indexOf('setup');
  const target = resolve(process.argv[argIndex + 1] ?? 'pholly-figma-plugin');
  if (!existsSync(bundled)) {
    console.error(`pholly-figma-mcp: bundled plugin not found at ${bundled}.`);
    console.error('Run the prepack build first with: npm pack -w pholly-figma-mcp');
    process.exitCode = 1;
    return true;
  }
  const token = getOrCreateToken();
  mkdirSync(target, { recursive: true });
  const code = readFileSync(join(bundled, 'code.js'), 'utf8').replaceAll(TOKEN_PLACEHOLDER, token);
  writeFileSync(join(target, 'code.js'), code);
  const manifest = JSON.parse(readFileSync(join(bundled, 'manifest.json'), 'utf8'));
  const stampedId = typeof manifest.id === 'string' && manifest.id ? `${manifest.id}-${token.slice(0, 8)}` : manifest.id;
  writeFileSync(join(target, 'manifest.json'), JSON.stringify({...manifest, id: stampedId}, null, 2));
  const ui = readFileSync(join(bundled, 'ui.html'), 'utf8').replaceAll(TOKEN_PLACEHOLDER, token);
  writeFileSync(join(target, 'ui.html'), ui);
  console.log(`Pholly Figma plugin copied to ${target}`);
  console.log(`Import ${join(target, 'manifest.json')} in Figma via Plugins → Development → Import plugin from manifest, then run it.`);
  process.exitCode = 0;
  return true;
}

if (!runSetup()) {
  const port = Number(process.env.PHOLLY_PORT ?? 1995);
  const token = getOrCreateToken();
  const files = new Map<string, ConnectedTarget<WebSocket>>();
  const pending = new Map<string, {resolve:(r:BridgeResponse)=>void; timer:NodeJS.Timeout}>();
  const timeoutMs = Number(process.env.PHOLLY_TIMEOUT ?? 30_000);
  let follower = false;

  function isAuthed(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (!header) return false;
    const separator = header.indexOf(' ');
    if (separator <= 0 || header.slice(0, separator).toLowerCase() !== 'bearer') return false;
    return tokenMatches(token, header.slice(separator + 1).trim());
  }
  function sendJson(res: ServerResponse, status:number, body:unknown) { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(body)); }
  async function rpc(request: Omit<BridgeRequest,'id'>): Promise<BridgeResponse> {
    if (follower) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/rpc`, {method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify(request)});
        return await response.json() as BridgeResponse;
      } catch (error) { return {id:'',ok:false,error:{code:'LEADER_UNAVAILABLE',message:`Local bridge leader is unavailable: ${String(error)}`}}; }
    }
    const target = request.fileKey ? files.get(request.fileKey) : files.values().next().value;
    if (!target) return {id:'',ok:false,error:{code:'NO_PLUGIN',message:'No Figma plugin is connected. Open the Pholly plugin in Figma first.'}};
    const id = randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => { pending.delete(id); resolve({id,ok:false,error:{code:'TIMEOUT',message:'Figma plugin did not respond in time.'}}); }, timeoutMs);
      pending.set(id,{resolve,timer}); target.socket.send(JSON.stringify({...request,id}));
    });
  }
  async function body(req:AsyncIterable<Buffer>):Promise<any>{let s='';for await(const c of req)s+=c;return JSON.parse(s||'{}');}
  const http = createServer(async (req,res) => {
    try {
      if(req.url==='/ping') return sendJson(res,200,{ok:true,files:files.size,port});
      if(!isLocalHost(req.headers.host)) return sendJson(res,403,{error:'Forbidden'});
      if(!isAuthed(req)){console.error(`pholly-figma-mcp: rejected ${req.method} ${req.url} without a valid token`);return sendJson(res,401,{error:'Unauthorized'});}
      if(req.url==='/files') return sendJson(res,200,[...files.values()].map(x=>x.info));
      if(req.url==='/rpc'&&req.method==='POST'){const q=await body(req);const out=await rpc(q);return sendJson(res,out.ok?200:400,out);}
      if(req.url==='/mcp'&&req.method==='POST'){const q=await body(req);const result=await handleMcp(q);return sendJson(res,200,result);}
      return sendJson(res,404,{error:'Not found'});
    } catch(e){return sendJson(res,400,{error:String(e)});}
  });
  const wss = new WebSocketServer({
    server:http,
    path:'/ws',
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      const hostOk = isLocalHost(info.req.headers.host);
      const originOk = isAllowedOrigin(info.origin);
      if (!hostOk || !originOk) console.error(`pholly-figma-mcp: rejected WebSocket upgrade from host=${info.req.headers.host} origin=${info.origin}`);
      return hostOk && originOk;
    }
  });
  wss.on('error',()=>{});
  wss.on('connection',socket=>{let key='';socket.on('message',raw=>{try{const msg=JSON.parse(raw.toString());if(msg.type==='hello'){if(!tokenMatches(token,msg.token)){const shown = typeof msg.token === 'string' && msg.token ? `${msg.token.slice(0,8)}…(${msg.token.length})` : '<missing>';console.error(`pholly-figma-mcp: rejected hello for fileKey=${msg.fileKey} token=${shown}`);socket.send(JSON.stringify({type:'error',code:'UNAUTHORIZED',message:'Invalid bridge token'}));socket.close(1008,'Unauthorized');return;}key=registerConnectedFile(files,socket,key,msg);socket.send(JSON.stringify({type:'ready',fileKey:key}));}else if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id)!;clearTimeout(p.timer);pending.delete(msg.id);p.resolve(msg);}}catch{}});socket.on('close',()=>unregisterConnectedFile(files,socket,key));});
  async function handleMcp(q:any):Promise<any|null>{
    if(q.jsonrpc!=='2.0') return {jsonrpc:'2.0',id:q.id,error:{code:-32600,message:'Invalid JSON-RPC request'}};
    if(q.method==='initialize') return {jsonrpc:'2.0',id:q.id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'pholly-figma-mcp',version:'0.1.1'}}};
    if(q.method==='notifications/initialized') return null;
    if(q.method==='tools/list') return {jsonrpc:'2.0',id:q.id,result:{tools}};
    if(q.method==='tools/call'){const name=q.params?.name;const args=q.params?.arguments??{};if(name==='list_files'){let connected=[...files.values()].map(x=>x.info);if(follower)try{connected=await (await fetch(`http://127.0.0.1:${port}/files`,{headers:{'authorization':`Bearer ${token}`}})).json() as ConnectedFile[];}catch{}return {jsonrpc:'2.0',id:q.id,result:{content:[{type:'text',text:JSON.stringify(connected,null,2)}]}};}let out=await rpc({method:name,fileKey:args.fileKey,params:args});if(name==='export_selection_assets'&&out.ok)try{out={...out,result:await materializeAssetBundle(out.result,args.outputDir)};}catch(error){out={id:out.id,ok:false,error:{code:'ASSET_WRITE_FAILED',message:error instanceof Error?error.message:String(error)}};}if(name==='save_screenshots'&&out.ok)try{out={...out,result:await materializeScreenshotBundle(out.result,args.outputDir)};}catch(error){out={id:out.id,ok:false,error:{code:'ASSET_WRITE_FAILED',message:error instanceof Error?error.message:String(error)}};}return {jsonrpc:'2.0',id:q.id,result:formatToolResult(name,out)};}
    return {jsonrpc:'2.0',id:q.id,error:{code:-32601,message:`Method not found: ${q.method}`}};
  }
  http.on('error',(error:NodeJS.ErrnoException)=>{if(error.code==='EADDRINUSE'){follower=true;console.error(`pholly-figma-mcp using existing bridge on http://localhost:${port}`);}else{console.error(`pholly-figma-mcp could not open bridge port ${port}: ${error.message}`);}});
  http.listen(port,'127.0.0.1',()=>console.error(`pholly-figma-mcp listening on http://localhost:${port}`));

  // MCP clients launch this package over stdio. Each input line is one JSON-RPC
  // request and each response is emitted as one JSON line on stdout.
  if (!process.stdin.isTTY || process.env.PHOLLY_STDIO === '1') {
    process.stdin.on('error', () => {});
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      input += chunk;
      const lines = input.split('\n'); input = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let request: any;
        try { request = JSON.parse(line); } catch { continue; }
        void handleMcp(request).then(result => { if(result) process.stdout.write(`${JSON.stringify(result)}\n`); });
      }
    });
  }
}
