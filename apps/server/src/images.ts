import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const maxImageBytes = 15 * 1024 * 1024;
const maxRedirects = 5;
const mimePattern = /^[\w.+-]+\/[\w.+-]+$/;
const metadataNames = new Set(['metadata.google.internal']);

const linkLocal = new BlockList();
linkLocal.addSubnet('169.254.0.0', 16, 'ipv4');
linkLocal.addSubnet('fe80::', 10, 'ipv6');

const inward = new BlockList();
inward.addSubnet('0.0.0.0', 8, 'ipv4');
inward.addSubnet('10.0.0.0', 8, 'ipv4');
inward.addSubnet('127.0.0.0', 8, 'ipv4');
inward.addSubnet('169.254.0.0', 16, 'ipv4');
inward.addSubnet('172.16.0.0', 12, 'ipv4');
inward.addSubnet('192.168.0.0', 16, 'ipv4');
inward.addAddress('::1', 'ipv6');
inward.addSubnet('fc00::', 7, 'ipv6');
inward.addSubnet('fe80::', 10, 'ipv6');

function normalizedIp(address: string): { address: string; family: 'ipv4' | 'ipv6' } | null {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped?.[1] && isIP(mapped[1]) === 4) return { address: mapped[1], family: 'ipv4' };
  if (isIP(address) === 4) return { address, family: 'ipv4' };
  if (isIP(address) === 6) return { address, family: 'ipv6' };
  return null;
}

async function assertFetchable(url: URL, redirect: boolean): Promise<void> {
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!host) throw new Error('Image host is missing');
  if (metadataNames.has(host)) throw new Error('Image host is a metadata address');
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('Image host could not be resolved');
  }
  if (!records.length) throw new Error('Image host could not be resolved');
  for (const record of records) {
    const ip = normalizedIp(record.address);
    if (!ip) throw new Error('Image host did not resolve to an IP address');
    if (linkLocal.check(ip.address, ip.family)) throw new Error('Image host is a link-local address');
    if (redirect && inward.check(ip.address, ip.family)) throw new Error('Image redirect targets a private address');
  }
}

async function readLimited(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxImageBytes) throw new Error('Image exceeds the 15 MB limit');
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxImageBytes) throw new Error('Image exceeds the 15 MB limit');
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    total += value.byteLength;
    if (total > maxImageBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('Image exceeds the 15 MB limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
}

export async function inlineImageSource(src: unknown, fetcher: typeof fetch = fetch): Promise<string> {
  if (typeof src !== 'string' || !src.trim()) throw new Error('create_image requires src');
  if (src.startsWith('data:')) return src;
  let url: URL;
  try { url = new URL(src); } catch { throw new Error('create_image src must be an http(s) URL or a data URI'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('create_image only accepts http(s) URLs or data URIs');
  let response: Response | undefined;
  for (let redirects = 0; ; redirects += 1) {
    await assertFetchable(url, redirects > 0);
    response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const redirected = response.status >= 300 && response.status < 400 && response.status !== 304;
    if (!redirected) break;
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => {});
    if (!location) throw new Error('Image fetch redirect had no Location');
    if (redirects >= maxRedirects) throw new Error('Image fetch followed too many redirects');
    url = new URL(location, url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Image redirect left http(s)');
  }
  if (!response?.ok) throw new Error(`Image fetch failed: ${response?.status ?? 0}`);
  const bytes = await readLimited(response);
  if (!bytes.length) throw new Error('Image fetch returned an empty body');
  const rawType = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]?.trim().toLowerCase() ?? '';
  const mimeType = mimePattern.test(rawType) ? rawType : 'application/octet-stream';
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}
