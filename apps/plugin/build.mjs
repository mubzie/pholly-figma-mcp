import { build, context } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const distDir = new URL('./dist/', import.meta.url);
const uiPath = new URL('./src/ui.html', import.meta.url);
const hmacPath = new URL('./src/bridge-hmac.js', import.meta.url);
const codePath = new URL('./src/code.ts', import.meta.url);
const manifestPath = new URL('./manifest.json', import.meta.url);

await mkdir(distDir, {recursive: true});

async function loadHtml() {
  const hmacSource = (await readFile(hmacPath, 'utf8')).replace(/^export function /m, 'function ');
  const html = await readFile(uiPath, 'utf8');
  if (!html.includes('/*__BRIDGE_HMAC__*/')) throw new Error('ui.html is missing the bridge HMAC marker');
  return html.replace('/*__BRIDGE_HMAC__*/', hmacSource);
}

function warnIfUnstamped(html) {
  if (html.includes('__PHOLLY_TOKEN__')) {
    console.warn('pholly-figma-plugin: dist still has __PHOLLY_TOKEN__. Run setup and import pholly-figma-plugin/manifest.json.');
  }
}

const uiPlugin = {
  name: 'pholly-ui-html',
  setup(build) {
    build.onResolve({filter: /^virtual:ui-html$/}, () => ({
      path: fileURLToPath(uiPath),
      namespace: 'pholly-ui-html'
    }));
    build.onLoad({filter: /.*/, namespace: 'pholly-ui-html'}, async () => {
      let html;
      try {
        html = await loadHtml();
      } catch (error) {
        return {errors: [{text: error instanceof Error ? error.message : String(error)}]};
      }
      await writeFile(new URL('ui.html', distDir), html);
      warnIfUnstamped(html);
      return {
        contents: `export default ${JSON.stringify(html)};\n`,
        loader: 'js',
        watchFiles: [fileURLToPath(uiPath), fileURLToPath(hmacPath)]
      };
    });
  }
};

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await writeFile(new URL('manifest.json', distDir), JSON.stringify({...manifest, main: 'code.js', ui: 'ui.html'}, null, 2));

const options = {
  entryPoints: [fileURLToPath(codePath)],
  bundle: true,
  outfile: fileURLToPath(new URL('code.js', distDir)),
  plugins: [uiPlugin],
  target: 'es2020',
  logLevel: 'info'
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching Figma plugin…');
} else {
  await build(options);
}
