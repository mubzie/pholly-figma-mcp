import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { materializeAssetBundle, materializeScreenshotBundle } from './assets.js';

test('writes exported assets inside a project-relative directory without base64 in the result', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pholly-assets-'));
  try {
    const result = await materializeAssetBundle({assets:[{assetKey:'logo',kind:'vector',suggestedName:'Brand Logo.svg',mimeType:'image/svg+xml',base64:Buffer.from('<svg/>').toString('base64')}]}, 'public/figma-assets', root) as any;
    assert.equal(result.writtenAssets[0].path, 'public/figma-assets/brand-logo.svg');
    assert.equal('base64' in result.writtenAssets[0], false);
    assert.equal((await readFile(path.join(root, result.writtenAssets[0].path), 'utf8')), '<svg/>');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('does not overwrite a different existing asset', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pholly-assets-'));
  try {
    const directory = path.join(root, 'public/figma-assets');
    await mkdir(directory,{recursive:true});
    await writeFile(path.join(directory,'icon.svg'),'<svg id="existing"/>');
    const result = await materializeAssetBundle({assets:[{assetKey:'icon',suggestedName:'icon.svg',mimeType:'image/svg+xml',base64:Buffer.from('<svg id="new"/>').toString('base64')}]}, undefined, root) as any;
    assert.equal(result.writtenAssets[0].path, 'public/figma-assets/icon-2.svg');
    assert.equal(await readFile(path.join(directory,'icon.svg'),'utf8'), '<svg id="existing"/>');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('rejects output paths outside the project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pholly-assets-'));
  try {
    await assert.rejects(() => materializeAssetBundle({assets:[]}, '../outside', root), /unsafe|inside|relative/);
    await assert.rejects(() => materializeAssetBundle({assets:[]}, '/tmp/outside', root), /project-relative/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('writes screenshots into the default directory with png extension', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pholly-shots-'));
  try {
    const result = await materializeScreenshotBundle({screenshots:[{nodeId:'1:2',name:'Hero.png',format:'PNG',base64:Buffer.from('pngbytes').toString('base64')}]}, undefined, root) as any;
    assert.equal(result.writtenScreenshots[0].path, 'public/figma-screenshots/hero.png');
    assert.equal(await readFile(path.join(root, result.writtenScreenshots[0].path), 'utf8'), 'pngbytes');
    assert.equal('base64' in result.writtenScreenshots[0], false);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('screenshot failures are reported and do not abort the bundle', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pholly-shots-'));
  try {
    const result = await materializeScreenshotBundle({screenshots:[{nodeId:'1:2',name:'ok',format:'PNG',base64:Buffer.from('bytes').toString('base64')},{nodeId:'2:3',name:'bad',format:'PNG',base64:''}]}, 'shots', root) as any;
    assert.equal(result.writtenScreenshots.length, 1);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].nodeId, '2:3');
  } finally { await rm(root,{recursive:true,force:true}); }
});
