# pholly-figma-mcp

Local-first MCP bridge for reading and editing live Figma documents. A Figma plugin and a local WebSocket server connect your MCP client to your design files without using Figma REST API requests.

## Quick start

1. Install and set up the Figma plugin:

   ```bash
   npx -y @mubizzu/pholly-figma-mcp setup
   ```

   This copies the plugin into `./pholly-figma-plugin/` and stamps it with your machine's bridge token (each machine gets its own token and plugin ID). Import its `manifest.json` in Figma via **Plugins → Development → Import plugin from manifest**, then run the plugin in the design file you want to share with your agent.

2. Configure the MCP server in your client (opencode, codex, etc.):

   ```json
   {
     "pholly-figma": {
       "type": "local",
       "command": ["npx", "-y", "@mubizzu/pholly-figma-mcp"],
       "enabled": true
     }
   }
   ```

   For a stable offline setup, install globally instead: `npm install -g @mubizzu/pholly-figma-mcp`, then use `"command": ["pholly-figma-mcp"]`.

3. Restart your MCP client, then ask your agent to call `list_files`, pick the returned `fileKey`, and use `get_metadata`, `get_selection`, `inspect_selection`, `render_design`, and the other tools.

## Architecture

```text
MCP client ──stdio──> Node server ──WebSocket (localhost:1995)──> Figma plugin ──> Figma Plugin API
```

The bridge is local-first: the plugin connects to `ws://localhost:1995/ws` on the same machine. Multiple MCP clients on one machine share the bridge; later starters automatically become followers that proxy to the leader.

## Security

The bridge binds to `127.0.0.1` and requires a bearer token for `/files`, `/rpc`, `/mcp`, and plugin registration. The token is generated per machine at `$XDG_CONFIG_HOME/pholly-figma-mcp/token` (override with `PHOLLY_TOKEN`), and `setup` stamps it into the plugin's `code.js` and `ui.html`. HTTP requests from non-local `Host`s and WebSocket upgrades from non-local `Origin`s are rejected.

See the repository `CHANGELOG.md` for release history.

## Requirements

- Node.js >= 20
- The Figma desktop app with the plugin running (write operations need the Design editor; Dev Mode is read-only)
