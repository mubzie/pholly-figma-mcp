# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-10-19

### Security
- The plugin now verifies the server. `ready` carries a MAC over the plugin's challenge nonce and a server nonce, and the plugin drops any `method` frame until that MAC verifies. A local process that accepts `ws://127.0.0.1:<port>` can no longer read or edit the open Figma file without the token.
- HMAC purposes are domain-separated (`prove`, `hello`, `ready`). The unauthenticated `/prove` MAC can no longer register a plugin. The file key `leader` is reserved.
- Followers re-prove the leader before every request and stop sending the bearer token if the proof fails.
- `create_image` blocks loopback, private, link-local, and metadata addresses on the first request and on redirects, and caps data URIs. `PHOLLY_ALLOW_PRIVATE_IMAGE_HOSTS=1` is the explicit escape hatch.
- Socket errors are handled, in-flight calls fail on disconnect instead of waiting for the timeout, and the stdio request path catches rejections.
- On Windows, setup and token creation apply an owner-only `icacls` restriction. The README no longer presents `0600` as a Windows control.

### Changed
- BREAKING: the plugin hello is HMAC with a server nonce, so a 0.2.1 plugin cannot talk to a 0.3.0 server, and the reverse. Delete the development plugin entry in Figma and re-import the stamped manifest.
- BREAKING: `render_design` in `reconcile` mode requires `confirmDelete: true` before it deletes keyed children that are absent from a supplied `children` array. Omitting `children` still deletes nothing.
- `render_design` applies text and layout on both create and update, and rejects an unknown `mode` instead of treating it as `append`.
- `set_text_properties` applies `color`. Mixed-font text is loaded per range instead of casting `fontName`.
- `set_auto_layout` accepts both `direction`/`gap` and `mode`/`itemSpacing`.
- `get_design_context` errors on an unknown node id. `get_styles` returns style payloads, not just metadata. `delete_nodes` reports `deleted` and `missing` separately and refuses pages.
- `batch` rejects `create_image`, `export_selection_assets`, `save_screenshots`, `undo`, `commit_undo`, `clear_changes`, and `list_files`, not only `delete_nodes` and nested `batch`.
- `set_solid_fill` honors the alpha in a four- or eight-digit hex color through paint opacity.
- The MCP server echoes a supported client protocol version. Unknown tool names and invalid arguments are rejected before the plugin is called.
- The plugin test script uses `tsx`, so it runs on Node 20 as well as newer versions.
- `setup` stamps the bridge port into the plugin and its `networkAccess` allowlist.
- The root build copies the plugin into `apps/server/plugin`, so the documented clean-clone `setup` works.

### Added
- `enablePrivatePluginApi` in the development manifest, so `figma.fileKey` can be the real file key.
- CI workflow, Dependabot configuration, issue template, and `LICENSE` in the published package.

## [0.2.2] - 2026-09-25

### Fixed
- `create_image` no longer follows a redirect onto a link-local, metadata, or private address, and it stops reading once the body passes 15 MB
- Stamped plugin ids use a hash prefix instead of the first bytes of the bridge token. The dev build keeps the token placeholder and warns to import the setup copy
- Plugin registration that loses the file key race no longer receives `ready`. A dead WebSocket is dropped when it misses a ping, so a reconnect can take the file back
- `undo` calls `figma.triggerUndo()`. `redo` reports that the plugin API has no redo instead of calling a missing method
- Bridge edits are committed to Figma's undo stack once per tool call (`batch` is one step). `render_design` commits unless `commitUndo` is `false`
- `render_design` validates the tree first, rejects unsupported node types instead of creating rectangles, and reconcile removes keyed children that were omitted
- `create_text` loads a font before writing characters and accepts `content`, `characters`, or `text`
- `delete_nodes` accepts only boolean `true`. Document reads clamp depth to 12. `get_node` errors when the id is missing
- Asset and screenshot writes resolve symlinks and refuse a directory that escapes the project
- A second connected file no longer receives edits that omitted `fileKey`
- `create_image` downloads http(s) URLs in the bridge. The plugin allowlist stays limited to localhost

### Security
- Plugin hello is a one-round HMAC challenge. The raw bridge token is no longer sent on the WebSocket
- Follower processes prove the leader knows the token before they send it, and refuse a port 1995 listener that cannot
- `setup` writes the stamped plugin as mode `0600` inside a `0700` directory
- HTTP requests with a missing `Host` header are rejected, including `/ping`

## [0.2.1] - 2026-08-10

### Changed
- Open-sourced under the MIT License; the npm package now carries the `MIT` license,
  repository, homepage, and bugs metadata
- Added `CONTRIBUTING.md` and `SECURITY.md`

## [0.2.0] - 2026-08-10

### Added
- Editing parity tools: `set_gradient_fill` (LINEAR/RADIAL/ANGULAR/DIAMOND with stops and
  transform), `set_effects` (drop/inner shadows, layer/background blurs), `set_stroke_properties`
  (weight, alignment, dash, caps, joins, miter), and `set_node_visibility` (returns previous state)
- `save_screenshots`: batch-export explicit node lists as PNG/JPG into a safe project directory
- Search tools: `find_nodes` and `find_text` (substring or `/regex/`, optional type filter and page)
- Session tools: `get_path`, `undo`, `redo`, `get_changes`, `clear_changes`
- `extract_design_tokens`: summarize page typography, colors, radii, spacing, opacities, and node types
- `set_solid_fill` now accepts hex colors in addition to rgba objects
- Tests for color normalization, tool schemas, and screenshot writing (39 total)

### Fixed
- `set_solid_fill` color alpha is now clamped to the unit range

## [0.1.1] - 2026-08-09

### Added
- `setup` now stamps the per-machine bridge token into both `code.js` and `ui.html`,
  and assigns the plugin a unique per-machine ID
- Rejection logging for unauthorized connections and invalid plugin hellos (masked token)
- Integration and unit tests for token handling, HTTP auth, origin/host checks, and
  registry protection (25 tests total)
- Root `npm run setup` convenience script

### Changed
- Packaged as scoped `@mubizzu/pholly-figma-mcp` with `dist/` + bundled plugin in `files`,
  `prepack` build, and npx-installable `setup`
- Dev flow now imports the `setup`-generated `pholly-figma-plugin/manifest.json`
  (raw build output is no longer an import target)

### Fixed
- `setup` stamped only `ui.html` while Figma actually runs the UI embedded in `code.js`,
  leaving the plugin with the placeholder token and an endless reject loop
- The file-info hello overwrote its own message type, so the real file key never
  registered: `list_files` now returns the true key and the plugin chip reaches "Connected"
- Crash (`EBADF`) when the server was launched from an interactive shell with `nohup`
- Malformed JSON-RPC input lines no longer crash the stdio loop

### Security
- Per-machine bearer token guards `/files`, `/rpc`, `/mcp`, and plugin registration
  (stored at `$XDG_CONFIG_HOME/pholly-figma-mcp/token`, mode `0600`; `PHOLLY_TOKEN` override)
- WebSocket upgrades from non-local `Origin`s are rejected (cross-site WebSocket hijacking)
- HTTP requests with a non-local `Host` header are refused (DNS-rebinding attacks)
- A file key held by a live plugin connection can no longer be hijacked by another connection

## [0.1.0] - 2026-08-09

### Added
- MCP stdio server with a local WebSocket bridge (`localhost:1995`) and follower
  behavior for multiple MCP clients on one machine
- Figma plugin with automatic reconnection
- Design-to-code tooling: `inspect_selection`, `export_selection_assets`,
  `render_design`, `batch`, component/instance authoring, variables, screenshots,
  and node editing
- Multi-file routing via `list_files` / `fileKey`
- Initial npm publication as `@mubizzu/pholly-figma-mcp`
