# Security Policy

The bridge is local-first and binds to `127.0.0.1` only. The controls below are the ones the source actually implements:

- A bearer token guards `/files`, `/rpc`, and `/mcp`. `/ping` is open and `/prove` returns a proof MAC, not the token.
- Plugin registration proves knowledge of the token with HMAC-SHA256. The raw token is not sent on the WebSocket.
- The server proves knowledge of the token back to the plugin. `ready` carries a MAC over the plugin nonce and a server nonce. Until that verifies, the plugin does not execute a `method` frame.
- Each HMAC purpose has its own domain (`prove`, `hello`, `ready`), so a `/prove` MAC cannot register a plugin. The file key `leader` is reserved.
- Host and Origin validation reject cross-site WebSocket upgrades and DNS-rebinding requests, including requests that omit `Host`.
- The registry gives a live plugin exclusive ownership of its file key.
- On Unix, the token file is mode `0600` inside a `0700` directory. On Windows, setup and `getOrCreateToken` apply an owner-only `icacls` restriction as a best effort.
- `create_image` refuses loopback, private, link-local, and metadata addresses on every hop, with a 15 MB cap. `PHOLLY_ALLOW_PRIVATE_IMAGE_HOSTS=1` is an explicit opt-in.
- Asset and screenshot writes must stay inside the server process working directory after symlink resolution, and never overwrite different bytes.

A process that binds the bridge port before the real server still receives the plugin connection while it holds the port. It does not learn the token, it cannot answer the `ready` MAC, and a follower will not send the token to it.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a live exploit. The bridge can write to any Figma document connected through the plugin, so details should be shared privately until a fix is available.

Include the version, the platform, the exact tool or endpoint, and a minimal reproduction. If the issue requires Figma, say so; the maintainer may need to run it in a design file.
