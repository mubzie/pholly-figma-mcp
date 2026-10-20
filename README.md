# pholly-figma-mcp

Local-first MCP bridge for live Figma documents. A Figma plugin and a local WebSocket server connect your MCP client to your design files without using the Figma REST API.

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Status

`0.3.0`. This is the first source release after the security fix pass. npm still serves `0.2.1`; that published package sends the raw bridge token on the WebSocket and follows an unproven local port. Do not install from npm until a release matching this source is published. The changelog calls out the breaking changes.

The source supports MCP stdio, the live plugin bridge, multi-file routing, document/style/variable inspection, common node editing, image creation, component and instance authoring, variable creation and binding, batch edits, declarative tree rendering, gradients, effects, strokes, visibility, search, screenshots, and design-token extraction.

## Build and run

```bash
npm install
npm run build          # compiles the packages and copies the plugin into apps/server/plugin
npm run setup          # creates ./pholly-figma-plugin with the bridge token and port stamped in
```

Import `pholly-figma-plugin/manifest.json` into Figma through **Plugins → Development → Import plugin from manifest**, then run it in a design file. `setup` is required: it stamps the machine's bridge token and the bridge port into the plugin.

If the token or port changes, run `setup` again, delete the old entry under **Plugins → Development**, and re-import. Figma caches a development plugin by id, and the id changes when the token changes.

```json
{
  "pholly-figma": {
    "type": "local",
    "command": ["node", "/absolute/path/to/pholly-figma-mcp/apps/server/dist/index.js"],
    "enabled": true
  }
}
```

For clients that use `command`/`args` (for example Codex-style JSON):

```json
{
  "pholly-figma": {
    "command": "node",
    "args": ["/absolute/path/to/pholly-figma-mcp/apps/server/dist/index.js"]
  }
}
```

Codex itself normally uses TOML. Use the same command and arguments in whichever shape your client documents. Claude Code, Claude Desktop, Cursor, VS Code, Gemini CLI, and Warp are not shipped with a config file; they need the same `node <abs>/apps/server/dist/index.js` stdio entry.

Your MCP client starts the server automatically. For bridge-only debugging you may run `npm start`; do not also launch a second manual copy unless you are testing follower behavior. The default port is 1995. `/ping` is open; the other endpoints require the bearer token or the plugin handshake. Check the default with `curl http://127.0.0.1:1995/ping`.

## Architecture

```text
MCP client ──stdio──> Node server ──WebSocket──> Figma plugin ──> Figma Plugin API
```

The project is MIT licensed. See [SECURITY.md](SECURITY.md) for how to report a vulnerability and [CONTRIBUTING.md](CONTRIBUTING.md) for the development and release process.

## Notable tools

- `inspect_selection` returns a detailed textual UI specification and an optional native screenshot.
- `export_selection_assets` extracts raster fills and vector candidates into a project-relative directory, without overwriting different existing files.
- `render_design` creates or reconciles a nested design tree. Use stable `key` values with `mode: "reconcile"`. Reconcile deletes keyed children that are present in the parent but absent from a supplied `children` array only when `confirmDelete: true`; otherwise it refuses before changing anything. Omitting `children` deletes nothing.
- `create_component`, `create_instance`, `set_instance_properties`, `swap_instance_component`, and `detach_instance` cover the common component workflow.
- `create_variable_collection`, `create_variable`, `set_variable_values`, and `bind_variable` cover local tokens. COLOR variables accept a hex string or an `{r,g,b,a}` object.
- `batch` runs non-destructive operations in sequence. It rejects `delete_nodes`, nested `batch`, `undo`, `commit_undo`, `clear_changes`, `create_image`, `export_selection_assets`, `save_screenshots`, and `list_files`. A failed operation still leaves earlier operations applied, so keep batches small and idempotent where it matters.
- `validate_design` checks a tree before rendering it. `commitUndo: false` on `render_design` skips the undo snapshot; the default commits one step.
- Editing: `set_gradient_fill`, `set_effects`, `set_stroke_properties`, `set_node_visibility`, `set_solid_fill` (hex or rgba), and `set_text_properties` (font, size, alignment, color, and bounds). Mixed-font text is loaded per range rather than through a single `fontName`.
- Search: `find_nodes` and `find_text` match by substring or `/regex/`, with an optional type filter and page. Patterns are capped at 80 characters.
- Session: `get_path`, `undo`, `redo` (always reports that the Plugin API has no redo), `get_changes`, and `clear_changes`. `undo` triggers the editor undo; it is not scoped to the bridge, so it can undo the user's last edit.
- Export and analysis: `save_screenshots` writes explicit node lists to `public/figma-screenshots/`, and `extract_design_tokens` summarizes a page's typography, colors, radii, spacing, and opacities.
- Inspection values: `get_styles` includes the paint, font, effect, and grid payloads. `get_design_context` errors on an unknown node id instead of silently returning the page.

## First-use checklist

1. Run `npm install && npm run build && npm run setup`.
2. Import `pholly-figma-plugin/manifest.json` into Figma.
3. Run the plugin in every file the agent should access.
4. Restart the MCP client after adding the configuration.
5. Ask the agent to call `list_files`; pass the returned `fileKey` for multi-file work.

The plugin must be running in Figma's Design editor for write operations. Dev Mode is not an editor target in the manifest, so the plugin is not available there.

## Security

The bridge is local-first and locked down by default:

- The HTTP server and WebSocket bridge bind to `127.0.0.1` and `::1` only. The IPv6 listener is best effort, so the plugin keeps working on IPv4-only machines.
- A per-machine bearer token guards `/files`, `/rpc`, and `/mcp`. The token lives at `$XDG_CONFIG_HOME/pholly-figma-mcp/token` (falling back to `~/.config/pholly-figma-mcp/token`) and can be overridden with `PHOLLY_TOKEN`.
- The plugin proves it knows the token with an HMAC challenge. The raw token is not sent on the WebSocket.
- The server also proves it knows the token: `ready` carries a MAC over both the plugin's challenge nonce and a server nonce that the plugin sent. Until that MAC verifies, the plugin drops any frame with a `method`. A process that merely accepts `ws://localhost:1995` cannot make the plugin read or edit a document.
- Setup stamps `ws://localhost:<port>` and the matching `networkAccess` allowlist into the plugin, so a non-default `PHOLLY_PORT` still matches. The host name is `localhost` because Figma's manifest validator rejects IP literals in `allowedDomains`; the server binds both loopback addresses so the name cannot split across IPv4 and IPv6.
- MAC domains are separate for `prove`, `hello`, and `ready`. A `/prove` MAC cannot register a plugin, and the file key `leader` is reserved and rejected.
- HTTP requests with a missing or non-local `Host` header are refused (blocks DNS rebinding), and WebSocket upgrades from non-local `Origin`s are rejected.
- A connected file key can only be claimed by the plugin that currently owns it. A second window is told the file is busy.
- `create_image` fetches http(s) images in the bridge and blocks loopback, private, link-local, and metadata addresses on the first request and on every redirect, with a 15 MB cap. Set `PHOLLY_ALLOW_PRIVATE_IMAGE_HOSTS=1` only if you deliberately need a local image server.
- Exported assets and screenshots must stay inside the server process working directory after resolving symlinks. Identical bytes are deduplicated; different bytes are never overwritten.
- On Windows, `0600` is not an ACL. `setup` and the token file additionally restrict access to the current user with `icacls` (`/inheritance:r`, one full-control entry). This is best effort; check the ACL if the machine is shared.
- On Unix, the config directory is mode `0700` and the token is mode `0600`. On Windows, treat that as advisory and rely on the ACL.

A process that binds port 1995 before the bridge still receives the plugin connection for as long as it holds the port, but it cannot pass the `ready` MAC, so the plugin will not run a command for it. A follower process re-proves the leader before every send and stops if the proof fails.

### Privacy

This bridge does not send telemetry. When an agent calls an inspection or export tool, the node tree, text, and images from the open Figma file are returned to the MCP client over stdio. Whatever model or service that client uses receives that data. Review your client's data handling before running this on confidential files. The bridge does not call Figma's REST API and does not send design data to Figma.

## Requirements

- Node.js >= 20. The compiled server runs on Node 20; tests use `tsx` so they do not require Node's experimental type stripping.
- The Figma desktop app with the plugin running for write operations. Figma web may block a `ws://localhost` connection under its own network policy; this was not verified.

## WSL

If the MCP client and the bridge run inside WSL and Figma runs on Windows, Windows `127.0.0.1` is not automatically the WSL loopback. Either run the server on the Windows side, or enable WSL localhost forwarding/mirrored networking and verify `curl http://127.0.0.1:1995/ping` from Windows before importing the plugin. The plugin is stamped with the port it should dial, not with a host, so the forwarding must make that port reachable.

## Troubleshooting

- **Plugin loops between "Connecting…" and "Disconnected · retrying"**: the imported plugin is stale or was stamped with another token. Delete it under **Plugins → Development**, run `setup`, and re-import the generated `pholly-figma-plugin/manifest.json`.
- **`list_files` returns `[]`**: the plugin is not connected. Make sure it is running in a design file and the status chip shows "Connected".
- **Bridge rejected this token**: the imported plugin was stamped for a different token, or the plugin was imported from an unstamped `dist/` build. Re-run `setup` on the same machine the bridge runs on, then re-import.
- **`create_image` rejects a local URL**: that is intentional. Use a public URL, inline the bytes as a data URI, or set `PHOLLY_ALLOW_PRIVATE_IMAGE_HOSTS=1` for a trusted local server.
- **`render_design` refuses to delete**: pass `confirmDelete: true` only when the reconcile tree is intentional. Omitting `children` never deletes anything.

## Packaging

The server package is `@mubizzu/pholly-figma-mcp`. `npm run pack` produces a tarball for `0.3.0` containing:

- `dist/` — the compiled MCP server with the `pholly-figma-mcp` binary
- `plugin/` — the bundled Figma plugin (`code.js`, `ui.html`, `manifest.json`)
- `LICENSE` — the MIT text

The `setup` subcommand copies the bundled plugin into a project, stamps the machine bridge token and port into it, and prints the Figma import path:

```bash
pholly-figma-mcp setup [target-dir]   # default target: ./pholly-figma-plugin
```

A published package is configured exactly like any npx server:

```json
{
  "pholly-figma": {
    "type": "local",
    "command": ["npx", "-y", "@mubizzu/pholly-figma-mcp"],
    "enabled": true
  }
}
```

The bridge remains local-first: the plugin in Figma connects to `ws://localhost:<port>` on the same machine. Multiple MCP clients on one machine share the bridge; later starters become followers that proxy to the leader. A follower refuses to send the bearer token to a process that cannot prove it knows it, and re-checks that proof.
