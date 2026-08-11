# Security Policy

The bridge is local-first and binds to `127.0.0.1` only. See the README's
[Security section](README.md#security) for the built-in protections:

- Per-machine bearer token guarding `/files`, `/rpc`, `/mcp`, and plugin registration
- Origin and Host validation against cross-site WebSocket hijacking and DNS rebinding
- Registry protection so a live plugin connection cannot be hijacked

## Reporting a vulnerability

Please report security issues privately by opening a GitHub issue on
[github.com/mubzie/pholly-figma-mcp/issues](https://github.com/mubzie/pholly-figma-mcp/issues)
with the `security` label, or contact the maintainer directly.

Do **not** open a public issue for a live exploit: the bridge has write access
to any Figma document connected through the plugin, so details should only be
shared once a fix is available or the issue is confirmed non-exploitable.
