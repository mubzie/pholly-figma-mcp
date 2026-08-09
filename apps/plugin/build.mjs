import { build, context } from 'esbuild';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';

await mkdir(new URL('./dist/', import.meta.url), {recursive: true});
await mkdir(new URL('../../plugin/', import.meta.url), {recursive: true});
const html = await readFile(new URL('./src/ui.html', import.meta.url), 'utf8');
const options = {
  entryPoints: [new URL('./src/code.ts', import.meta.url).pathname],
  bundle: true,
  outfile: new URL('./dist/code.js', import.meta.url).pathname,
  define: {__html__: JSON.stringify(html)},
  target: 'es2020',
  logLevel: 'info'
};
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
await writeFile(new URL('./dist/manifest.json', import.meta.url), JSON.stringify({...manifest, main:'code.js', ui:'ui.html'}, null, 2));
await copyFile(new URL('./src/ui.html', import.meta.url), new URL('./dist/ui.html', import.meta.url));
await writeFile(new URL('../../plugin/manifest.json', import.meta.url), JSON.stringify({...manifest, main:'code.js', ui:'ui.html'}, null, 2));
await copyFile(new URL('./src/ui.html', import.meta.url), new URL('../../plugin/ui.html', import.meta.url));
if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching Figma plugin…');
} else {
  await build(options);
  await copyFile(new URL('./dist/code.js', import.meta.url), new URL('../../plugin/code.js', import.meta.url));
}
