import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';

/**
 * POSIX mode bits are not an ACL on Windows. `chmod 0600` there only toggles a
 * read-only bit, so another local user who can traverse the folder may still
 * read the token file and the stamped plugin. On Windows, replace inheritance
 * with a single full-control entry for the current user. This is best effort:
 * a restricted environment should not make setup fail, but the README no
 * longer claims `0600` protects Windows users.
 */
export function restrictToOwner(path: string): void {
  if (process.platform !== 'win32') return;
  try {
    const username = process.env.USERNAME || userInfo().username;
    const domain = process.env.USERDOMAIN;
    const account = domain && username ? `${domain}\\${username}` : username;
    if (!account) return;
    execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${account}:F`], { stdio: 'ignore' });
  } catch {
    /* best effort */
  }
}
