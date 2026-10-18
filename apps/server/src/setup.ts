import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const TOKEN_PLACEHOLDER = '__PHOLLY_TOKEN__';

export function pluginIdSuffix(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}

export function stampPlugin(bundledDir: string, targetDir: string, token: string): void {
  if (!existsSync(join(bundledDir, 'code.js')) || !existsSync(join(bundledDir, 'ui.html')) || !existsSync(join(bundledDir, 'manifest.json'))) {
    throw new Error(`bundled plugin not found at ${bundledDir}`);
  }
  mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  chmodSync(targetDir, 0o700);
  const writeSecret = (name: string, contents: string) => {
    const path = join(targetDir, name);
    writeFileSync(path, contents, { mode: 0o600 });
    chmodSync(path, 0o600);
  };
  writeSecret('code.js', readFileSync(join(bundledDir, 'code.js'), 'utf8').replaceAll(TOKEN_PLACEHOLDER, token));
  const manifest = JSON.parse(readFileSync(join(bundledDir, 'manifest.json'), 'utf8')) as { id?: unknown };
  const stampedId = typeof manifest.id === 'string' && manifest.id ? `${manifest.id}-${pluginIdSuffix(token)}` : manifest.id;
  writeSecret('manifest.json', JSON.stringify({ ...manifest, id: stampedId }, null, 2));
  writeSecret('ui.html', readFileSync(join(bundledDir, 'ui.html'), 'utf8').replaceAll(TOKEN_PLACEHOLDER, token));
}
