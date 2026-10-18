# Security Policy

The bridge is local-first and binds to `127.0.0.1` only. See the README's
[Security section](README.md#security) for the built-in protections:

- Per-machine bearer token guarding `/files`, `/rpc`, and `/mcp`
- Plugin registration proves knowledge of that token with HMAC-SHA256. The raw token is not sent on the WebSocket
- Origin and Host validation against cross-site WebSocket hijacking and DNS rebinding, including requests that omit `Host`
- Registry protection so a live plugin connection cannot be hijacked
- Stamped plugin files are written mode `0600`

A process that binds port 1995 before the bridge still receives the plugin connection for as long as it holds the port. It does not learn the token, and a follower will not send the token to it.

## Reporting a vulnerability

Report security issues privately to the maintainer. Do **not** open a public
issue for a live exploit: the bridge has write access to any Figma document
connected through the plugin, so details should only be shared once a fix is
available or the issue is confirmed non-exploitable.
