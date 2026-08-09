import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(here, '..', '..', '..', 'apps', 'plugin', 'dist');
const targetDir = join(here, '..', 'plugin');

for (const file of ['code.js', 'ui.html', 'manifest.json']) {
  const source = join(sourceDir, file);
  if (!existsSync(source)) throw new Error(`Missing plugin build output: ${source}. Run the plugin build first.`);
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, join(targetDir, file));
}

console.log(`pholly-figma-mcp: bundled plugin into ${targetDir}`);
