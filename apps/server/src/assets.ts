import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const defaultOutputDirectory = 'public/figma-assets';
const maxAssetBytes = 25 * 1024 * 1024;
const maxTotalBytes = 100 * 1024 * 1024;

const extensions: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg'
};

interface ExportedAsset {
  assetKey?: unknown;
  kind?: unknown;
  nodeIds?: unknown;
  layerPaths?: unknown;
  suggestedName?: unknown;
  mimeType?: unknown;
  base64?: unknown;
}

export async function materializeAssetBundle(value: unknown, requestedDirectory?: unknown, projectRoot = process.cwd()): Promise<unknown> {
  if (!value || typeof value !== 'object') throw new Error('Figma asset export returned an invalid result');
  const bundle = value as Record<string, unknown>;
  if (!Array.isArray(bundle.assets)) throw new Error('Figma asset export did not include an assets array');
  const root = path.resolve(projectRoot);
  const relativeDirectory = validateRelativeDirectory(requestedDirectory);
  const destination = path.resolve(root, relativeDirectory);
  const relativeCheck = path.relative(root, destination);
  if (!relativeCheck || relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) throw new Error('Asset output directory must stay inside the current project');
  await mkdir(destination, {recursive:true});

  const written: Array<Record<string, unknown>> = [];
  const failures: Array<Record<string, unknown>> = Array.isArray(bundle.failures) ? [...bundle.failures] as Array<Record<string, unknown>> : [];
  const pathsByHash = new Map<string, string>();
  let totalBytes = 0;

  for (const rawAsset of bundle.assets as ExportedAsset[]) {
    try {
      const mimeType = typeof rawAsset.mimeType === 'string' ? rawAsset.mimeType : '';
      const extension = extensions[mimeType];
      if (!extension) throw new Error(`Unsupported asset MIME type: ${mimeType || 'unknown'}`);
      if (typeof rawAsset.base64 !== 'string' || !rawAsset.base64) throw new Error('Asset data is missing');
      const bytes = Buffer.from(rawAsset.base64, 'base64');
      if (!bytes.length) throw new Error('Asset data is empty');
      if (bytes.length > maxAssetBytes) throw new Error(`Asset exceeds the ${maxAssetBytes / 1024 / 1024} MB limit`);
      totalBytes += bytes.length;
      if (totalBytes > maxTotalBytes) throw new Error(`Asset bundle exceeds the ${maxTotalBytes / 1024 / 1024} MB limit`);
      const hash = createHash('sha256').update(bytes).digest('hex');
      let relativePath = pathsByHash.get(hash);
      if (!relativePath) {
        const baseName = sanitizeBaseName(typeof rawAsset.suggestedName === 'string' ? rawAsset.suggestedName : String(rawAsset.assetKey ?? 'figma-asset'));
        const filePath = await writeWithoutOverwrite(destination, baseName, extension, bytes, hash);
        relativePath = path.relative(root, filePath).split(path.sep).join('/');
        pathsByHash.set(hash, relativePath);
      }
      written.push({
        assetKey:rawAsset.assetKey,
        kind:rawAsset.kind,
        nodeIds:rawAsset.nodeIds,
        layerPaths:rawAsset.layerPaths,
        path:relativePath,
        mimeType,
        bytes:bytes.length,
        sha256:hash
      });
    } catch (error) {
      failures.push({assetKey:rawAsset.assetKey,message:error instanceof Error?error.message:String(error)});
    }
  }

  const {assets:_assets,...metadata} = bundle;
  return {...metadata,outputDirectory:relativeDirectory,writtenAssets:written,failures};
}

function validateRelativeDirectory(value: unknown, fallback = defaultOutputDirectory): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim().replaceAll('\\','/') : fallback;
  if (path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) throw new Error('Asset output directory must be project-relative');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '..')) throw new Error('Asset output directory contains an unsafe path');
  return parts.join('/');
}

async function writeWithoutOverwrite(directory: string, baseName: string, extension: string, bytes: Buffer, hash: string): Promise<string> {
  for (let index = 1; index <= 1000; index++) {
    const suffix = index === 1 ? '' : `-${index}`;
    const candidate = path.join(directory, `${baseName}${suffix}${extension}`);
    try {
      const existing = await readFile(candidate);
      if (createHash('sha256').update(existing).digest('hex') === hash) return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        await writeFile(candidate, bytes, {flag:'wx'});
        return candidate;
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
      }
    }
  }
  throw new Error(`Could not allocate a filename for ${baseName}${extension}`);
}

function sanitizeBaseName(value: string): string {
  const withoutExtension = value.replace(/\.[a-z0-9]{1,8}$/i, '');
  const slug = withoutExtension.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return (slug || 'figma-asset').slice(0, 80);
}

const screenshotExtensions: Record<string, string> = {PNG: '.png', JPG: '.jpg'};
const defaultScreenshotDirectory = 'public/figma-screenshots';

interface ScreenshotItem {
  nodeId?: unknown;
  name?: unknown;
  format?: unknown;
  base64?: unknown;
}

export async function materializeScreenshotBundle(value: unknown, requestedDirectory?: unknown, projectRoot = process.cwd()): Promise<unknown> {
  if (!value || typeof value !== 'object') throw new Error('Figma screenshot export returned an invalid result');
  const bundle = value as Record<string, unknown>;
  if (!Array.isArray(bundle.screenshots)) throw new Error('Figma screenshot export did not include a screenshots array');
  const root = path.resolve(projectRoot);
  const relativeDirectory = validateRelativeDirectory(requestedDirectory, defaultScreenshotDirectory);
  const destination = path.resolve(root, relativeDirectory);
  const relativeCheck = path.relative(root, destination);
  if (!relativeCheck || relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) throw new Error('Screenshot output directory must stay inside the current project');
  await mkdir(destination, {recursive:true});

  const written: Array<Record<string, unknown>> = [];
  const failures: Array<Record<string, unknown>> = Array.isArray(bundle.failures) ? [...bundle.failures] as Array<Record<string, unknown>> : [];
  let totalBytes = 0;

  for (const raw of bundle.screenshots as ScreenshotItem[]) {
    try {
      const format = typeof raw.format === 'string' ? raw.format.toUpperCase() : 'PNG';
      const extension = screenshotExtensions[format];
      if (!extension) throw new Error(`Unsupported screenshot format: ${format}`);
      if (typeof raw.base64 !== 'string' || !raw.base64) throw new Error('Screenshot data is missing');
      const bytes = Buffer.from(raw.base64, 'base64');
      if (!bytes.length) throw new Error('Screenshot data is empty');
      if (bytes.length > maxAssetBytes) throw new Error(`Screenshot exceeds the ${maxAssetBytes / 1024 / 1024} MB limit`);
      totalBytes += bytes.length;
      if (totalBytes > maxTotalBytes) throw new Error(`Screenshot bundle exceeds the ${maxTotalBytes / 1024 / 1024} MB limit`);
      const hash = createHash('sha256').update(bytes).digest('hex');
      const baseName = sanitizeBaseName(typeof raw.name === 'string' ? raw.name : String(raw.nodeId ?? 'figma-screenshot'));
      const filePath = await writeWithoutOverwrite(destination, baseName, extension, bytes, hash);
      written.push({
        nodeId: raw.nodeId,
        path: path.relative(root, filePath).split(path.sep).join('/'),
        format,
        bytes: bytes.length,
        sha256: hash
      });
    } catch (error) {
      failures.push({nodeId: raw.nodeId, message: error instanceof Error ? error.message : String(error)});
    }
  }

  const {screenshots:_screenshots, ...metadata} = bundle;
  return {...metadata, outputDirectory: relativeDirectory, writtenScreenshots: written, failures};
}
