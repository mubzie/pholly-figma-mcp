import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'pholly-figma-mcp');
}

function tokenFilePath(): string {
  return join(configDir(), 'token');
}

export function getOrCreateToken(): string {
  const fromEnv = process.env.PHOLLY_TOKEN;
  if (fromEnv) return fromEnv;
  const file = tokenFilePath();
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim();
    if (stored) return stored;
  }
  const token = randomBytes(32).toString('hex');
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}

export function readToken(): string {
  return getOrCreateToken();
}

export function tokenMatches(expected: string, provided: string | undefined | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** HMAC-SHA256 over `nonce.label`. The label is the file key, or `leader` for follower proofs. */
export function bridgeMac(token: string, nonce: string, label: string): string {
  return createHmac('sha256', token).update(`${nonce}.${label}`).digest('hex');
}

export function macMatches(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
