import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { restrictToOwner } from './owner-only.js';

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
    if (stored) {
      restrictToOwner(file);
      return stored;
    }
  }
  const token = randomBytes(32).toString('hex');
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  restrictToOwner(file);
  return token;
}

/** Generate an ephemeral token for tests and callers that want a fresh value. */
export function randomToken(): string {
  return randomBytes(32).toString('hex');
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

/**
 * Each MAC purpose has its own domain. Before this change `/prove` issued a MAC
 * over the literal label `leader`, and plugin hello accepted a MAC over any
 * caller-supplied file key. A caller could take the unauthenticated `/prove`
 * MAC and register a plugin as file `leader`. The domain prefix makes a MAC for
 * one purpose invalid for another, even when the rest of the input is reused.
 */
export type MacDomain = 'prove' | 'hello' | 'ready';

export function bridgeMac(token: string, domain: MacDomain, nonce: string, label: string): string {
  return createHmac('sha256', token)
    .update(`${domain}\u0000${nonce}\u0000${label}`)
    .digest('hex');
}

/**
 * The plugin proves it knows the token to the server, and the server proves it
 * knows the token to the plugin. The plugin sends a `serverNonce` in `hello`;
 * `ready` carries a MAC over both nonces so a peer that merely accepted the
 * socket cannot make the plugin execute commands.
 */
export function readyMac(token: string, clientNonce: string, serverNonce: string, fileKey: string): string {
  return bridgeMac(token, 'ready', `${clientNonce}.${serverNonce}`, fileKey);
}

/** Figma file keys are opaque, but `leader` was reserved for follower proofs. */
export function isReservedFileKey(value: string): boolean {
  return value === 'leader';
}

export function macMatches(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
