# pholly-figma-mcp

Private, local-first MCP bridge for live Figma documents. It uses a Figma plugin and a local WebSocket server, so document inspection and edits do not consume Figma REST API requests.

## Status

Usable MVP: MCP stdio transport, live plugin bridge, multi-file routing, document/style/variable inspection, common node editing, image creation, component/instance authoring, variable creation/binding, batch edits, and declarative tree rendering are included.

## Build and run

```bash
npm install
npm run build
npm run setup          # creates ./pholly-figma-plugin with the bridge token baked in
```

Import `pholly-figma-plugin/manifest.json` into Figma through **Plugins → Development → Import plugin from manifest**, then run it in a design file. The `setup` step is required: it stamps the machine's bridge token into the plugin, and the bridge rejects untrusted plugins. If the token ever changes (token file deleted or `PHOLLY_TOKEN` env overridden), re-run `setup` and re-import the manifest in Figma.

```json
{
  "pholly-figma": {
    "type": "local",
    "command": [
      "node",
      "/absolute/path/to/pholly-figma-mcp/apps/server/dist/index.js"
    ],
    "enabled": true
  }
}
```

For clients that use `command`/`args` (e.g. codex-style config), the equivalent is:

```json
{
  "pholly-figma": {
    "command": "node",
    "args": ["/absolute/path/to/pholly-figma-mcp/apps/server/dist/index.js"]
  }
}
```

Your MCP client starts the server automatically. For bridge-only debugging you may run `npm start`; do not also launch a second manual copy unless you are testing follower behavior. The bridge stays on `localhost:1995`. Check it with `curl http://localhost:1995/ping` (the other endpoints require the bearer token).

## Architecture

```text
MCP client ──stdio──> Node server ──WebSocket──> Figma plugin ──> Figma Plugin API
```

The project is private by default but organized as independently licensed packages to make future open-sourcing straightforward.

## Notable tools

- `inspect_selection` is the primary design-to-code tool. It returns a detailed textual UI specification and an optional native screenshot, so it works with both vision and non-vision agents.
- `export_selection_assets` extracts exact raster fills and vector/icon candidates into a safe project-relative directory (default `public/figma-assets/`) without overwriting different existing files.
- `render_design` creates or reconciles a nested design tree. Give nodes stable `key` values and use `mode: "reconcile"` for repeatable updates.
- `create_component`, `create_instance`, `set_instance_properties`, `swap_instance_component`, and `detach_instance` cover the common component workflow.
- `create_variable_collection`, `create_variable`, `set_variable_values`, and `bind_variable` support local design tokens.
- `batch` runs safe, non-destructive operations sequentially. `delete_nodes` remains confirmation-gated.
- `validate_design` checks a tree before rendering it; `commitUndo: true` on `render_design` creates a single undo checkpoint.

## First-use checklist

1. Run `npm install && npm run build && npm run setup`.
2. Import `pholly-figma-plugin/manifest.json` into Figma.
3. Run the plugin in every file the agent should access.
4. Restart the MCP client after adding the configuration.
5. Ask the agent to call `list_files`; pass the returned `fileKey` for multi-file work.

The plugin must be running in Figma's Design editor for write operations. Dev Mode is intentionally read-only.

## Security

The bridge is local-first and locked down by default:

- The HTTP server and WebSocket bridge bind to `127.0.0.1` only.
- A per-machine bearer token guards `/files`, `/rpc`, `/mcp`, and plugin registration. The token lives at `$XDG_CONFIG_HOME/pholly-figma-mcp/token` (mode `0600`) and can be overridden with the `PHOLLY_TOKEN` environment variable. The `setup` command stamps it into the plugin's `ui.html`; plugins without a valid token are rejected and closed.
- HTTP requests with a non-local `Host` header are refused (blocks DNS-rebinding attacks), and WebSocket upgrades from non-local `Origin`s are rejected (blocks cross-site WebSocket hijacking from malicious web pages).
- A connected file key can only be claimed by the plugin that currently owns it; a live registration is never overwritten by another connection.

## Packaging

The server package is named `@mubizzu/pholly-figma-mcp`. `npm run pack` produces `mubizzu-pholly-figma-mcp-0.1.1.tgz` containing:

- `dist/` — the compiled MCP server with the `pholly-figma-mcp` binary
- `plugin/` — the bundled Figma plugin (`code.js`, `ui.html`, `manifest.json`)

The `setup` subcommand copies the bundled plugin into a project, stamps the machine bridge token into it, and prints the Figma import path:

```bash
pholly-figma-mcp setup [target-dir]   # default target: ./pholly-figma-plugin
```

Once published, users would configure it in their MCP client exactly like any npx server:

```json
{
  "pholly-figma": {
    "type": "local",
    "command": ["npx", "-y", "@mubizzu/pholly-figma-mcp"],
    "enabled": true
  }
}
```

The bridge remains local-first: the plugin in Figma connects to `ws://localhost:1995/ws` on the same machine. Multiple MCP clients on one machine share the bridge; later starters automatically become followers that proxy to the leader.
