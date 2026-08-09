import test from 'node:test';
import assert from 'node:assert/strict';
import { formatToolResult } from './content.js';

test('returns PNG screenshots as native MCP image content', () => {
  const result = formatToolResult('get_screenshot', {id:'1',ok:true,result:{format:'PNG',base64:'cG5n'}});
  assert.deepEqual(result, {
    isError:false,
    content:[
      {type:'text',text:'{\n  "format": "PNG"\n}'},
      {type:'image',data:'cG5n',mimeType:'image/png'}
    ]
  });
});

test('maps JPG and SVG screenshot MIME types', () => {
  assert.equal(formatToolResult('get_screenshot', {id:'1',ok:true,result:{format:'JPG',base64:'a'}}).content[1]?.type, 'image');
  assert.deepEqual(formatToolResult('get_screenshot', {id:'1',ok:true,result:{format:'SVG',base64:'b'}}).content[1], {type:'image',data:'b',mimeType:'image/svg+xml'});
});

test('keeps normal tool results and errors as text', () => {
  assert.deepEqual(formatToolResult('get_metadata', {id:'1',ok:true,result:{name:'LABs'}}), {isError:false,content:[{type:'text',text:'{\n  "name": "LABs"\n}'}]});
  assert.equal(formatToolResult('get_metadata', {id:'1',ok:false,error:{code:'NO_PLUGIN',message:'Missing'}}).isError, true);
});

test('returns inspection spec as text and screenshot as a separate image block', () => {
  const result = formatToolResult('inspect_selection', {id:'1',ok:true,result:{selectionCount:1,nodes:[{id:'1',type:'FRAME'}],screenshot:{format:'PNG',base64:'cG5n'}}});
  assert.equal(result.content[0]?.type, 'text');
  assert.match((result.content[0] as {type:'text';text:string}).text, /selectionCount/);
  assert.deepEqual(result.content[1], {type:'image',data:'cG5n',mimeType:'image/png'});
  assert.equal((result.content[0] as {type:'text';text:string}).text.includes('cG5n'), false);
});
