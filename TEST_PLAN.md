# Test plan

Phase 1 commands that were run, and the manual matrix that was not. Do not publish, push, or edit a shared Figma file while running the manual rows. Use a disposable file.

## Already run (2026-10-19, WSL, Node v22.23.2, npm 10.9.8)

Working tree, not a clean clone:

```bash
npm run build
npm run typecheck
npm test
```

Result: build and typecheck exit 0. Tests: 54 server pass, 7 plugin pass.

Clean clone, outside the working tree:

```bash
rm -rf /tmp/pholly-audit-clone2
mkdir -p /tmp/pholly-audit-clone2
tar -C /path/to/figma-mcp \
  --exclude node_modules --exclude dist --exclude pholly-figma-plugin \
  --exclude apps/server/plugin --exclude .llm-wiki \
  --exclude '*.tgz' --exclude '*.tsbuildinfo' \
  -cf - . | tar -C /tmp/pholly-audit-clone2 -xf -
cd /tmp/pholly-audit-clone2
npm ci
npm run build
test -f apps/server/dist/index.js
npm run setup   # expected fail today
node apps/server/scripts/copy-plugin.mjs
PHOLLY_TOKEN=audit-setup-token node apps/server/dist/index.js setup /tmp/pholly-setup-c
```

Result: `npm ci` 0, build 0, setup 1 with `bundled plugin not found`, setup after copy 0, stamped files mode 600, no placeholder.

Dependency checks:

```bash
npm audit --omit=dev
npm audit --omit=dev --registry https://registry.npmjs.org
npm outdated
```

Result: lockfile host audit is NOT_IMPLEMENTED. Official registry audit reported 0 vulnerabilities.

Handshake, on a port that is not 1995, with a test token:

- `initialize` for `2024-11-05`, `2025-03-26`, and `2025-06-18` all returned `2024-11-05`.
- `tools/list` returned 53 tools.
- `hello-begin` with file key `leader`, then `/prove` for that nonce, then `hello`, returned `ready`.
- `/files` listed `leader`.
- An unanswered `get_metadata` returned `TIMEOUT`.
- After that socket closed, the next call returned `NO_PLUGIN`.
- A second process on the same port logged that it was using the existing bridge.

Do not repeat the `leader` registration against a server that has a real plugin connected unless the port is isolated.

## Regression commands for the fix pass

```bash
npm run build
npm run typecheck
npm test
```

Add tests before changing behavior:

1. A `/prove` MAC must not complete hello for file key `leader`.
2. A message gate must ignore `{id, method}` until the peer has proved the token. Cover the UI function in a unit test, and keep the Figma row below.
3. Clean-clone setup exits 0 without a manual copy.
4. `create_image` of `http://127.0.0.1/` fails. Update the test that currently requires success.
5. `get_design_context` with a missing id is `isError`.
6. Lock the color contract for `set_text_properties`: either the handler applies it, or the description stops promising it.
7. `initialize` still accepts `2024-11-05` and can return another supported version when the client asks for one.

`npm pack -w @mubizzu/pholly-figma-mcp` was not finished. After the copy-step fix, inspect the tarball for `dist/index.js`, `plugin/manifest.json`, `plugin/code.js`, and a LICENSE file. Confirm `__PHOLLY_TOKEN__` is still the placeholder inside the tarball.

## Manual Figma matrix

Import only a setup-stamped manifest, not `apps/plugin/dist`. Record actual results. Expected results below are from the code, not from a live run.

### Install

1. Plugins, Development, Import plugin from manifest. Pick the stamped `manifest.json`.
   Expected: Figma accepts it, or it shows a specific warning. Record whether `documentAccess` or `enablePrivatePluginApi` is mentioned.
2. Run the plugin in a saved cloud design file.
   Expected: status becomes Connected. `list_files` returns one entry. Record whether `fileKey` equals the key in the file URL.
3. Close the plugin and run it again.
   Expected: same `fileKey`, not a new `local-...` or `figma-...` key.
4. Change `PHOLLY_TOKEN`, run setup, do not delete the old development plugin, run it.
   Expected: Connecting, then Disconnected, retrying. Delete the development entry, re-import, expect Connected.
5. Repeat on Figma web, if the desktop import worked.
   Expected: record whether `networkAccess` blocks `ws://localhost:1995`.

### Connection

6. Stop the server. Run the plugin.
   Expected: Bridge unavailable or Disconnected, retrying. It must not show Connected.
7. Start the server. Leave the plugin retrying.
   Expected: Connected without a re-import.
8. Open the same file in a second window and run the plugin there.
   Expected: the second window says the file is open in another plugin window. `list_files` still has one entry.
9. Close the first plugin. Wait for the ping interval.
   Expected: the second window can connect.
10. Open two different files, both with the plugin. Call `get_metadata` with no `fileKey`.
    Expected: error `AMBIGUOUS_FILE`. Call again with each returned key. Expected: each call matches that file's name.

### Text

11. One text node, Inter Regular, characters `Hello`. `set_text_content` to `Hello 2`.
    Expected: text changes. One Undo reverts it.
12. Same node. `set_text_properties` with `properties.color` `#ff0000` only.
    Expected from current code: success, fill unchanged. After the color fix, fill is red.
13. A text node with two font families. `set_text_content` to `x`. Then a bounds-only `set_text_properties`.
    Expected from current code: both fail before the edit. Record the Figma message.
14. Missing font: a text node whose font is not installed. `set_text_content`.
    Expected: error. Record whether an empty text node was left behind.
15. Styled segments: one word bold. `inspect_selection`.
    Expected: `segments` lists both styles. `fontName` on the node may be `MIXED`.

### Components and variables

16. `create_component` on a frame, then `create_instance`.
    Expected: instance parent is the current page unless `parentId` is set.
17. Pass a component-set id to `create_instance`.
    Expected: `Node is not a component`.
18. `set_instance_properties` with a real variant property, then a wrong key.
    Expected: the real key changes. The wrong key errors. Record the message.
19. `detach_instance`, then `render_design` reconcile using the old key.
    Expected: record whether the detached node still has `pholly-key`.
20. `create_variable` type `COLOR` with a hex string, then with `{r,g,b,a}`.
    Expected from current code: hex is passed through. Record which one Figma accepts.
21. A team-library style and variable. `get_styles` and `get_variable_defs`.
    Expected: local only. Library items are absent.

### Images, export, layout

22. `create_image` with a public https PNG.
    Expected: a rectangle with an image fill. One Undo removes it.
23. `create_image` with `http://127.0.0.1/`.
    Expected from current code: the bridge attempts the fetch. After the image fix, it must fail before the plugin runs.
24. `export_selection_assets` on a frame with a photo and a small vector.
    Expected: files under `public/figma-assets` relative to the server process cwd. Record that cwd.
25. Run the same export again.
    Expected: identical bytes are not duplicated. A changed asset gets a new name, not an overwrite.
26. `set_auto_layout` using `get_node`'s `layout.mode` and `layout.itemSpacing`.
    Expected from current code: no layout change. Repeat with `direction` and `gap`. Expected: those apply.
27. A locked node. `set_node_properties` name.
    Expected: record whether Figma throws or the plugin writes through the lock.
28. A node on another page. `get_node`, `set_selection`.
    Expected: record whether sync `getNodeById` finds it, and whether selection can cross pages.

### Batch, delete, undo

29. `render_design` append a keyed frame with children `a` and `b`. Reconcile with only `a`.
    Expected: `b` is removed. An unkeyed sibling remains.
30. Reconcile again with the `children` field omitted.
    Expected from current code: nothing extra is deleted, because the field is absent.
31. `render_design` with `commitUndo: false`, then editor Undo.
    Expected: the nodes remain, and Undo does not revert that render as its own step.
32. `delete_nodes` with `confirm: true` and one missing id.
    Expected from current code: `ok: true` and `deleted` includes the missing id.
33. `delete_nodes` with `confirm: "true"`.
    Expected: error. Nothing deleted.
34. `batch` of two `set_text_content` calls, second id invalid.
    Expected: first text already changed, tool is an error. Record whether one Undo reverts only that first edit.
35. `batch` containing `undo`.
    Expected from current code: it is allowed. Record what it reverts.
36. Nudge a node by hand, then call `undo`.
    Expected from current code: the nudge is undone, not a prior bridge edit.
37. `redo`.
    Expected: error telling the user to use the editor Redo command.

### Plans, Dev Mode, concurrency

38. A view-only file. Run the plugin.
    Expected: record whether `setPluginData` at startup throws, and whether the chip connects.
39. Dev Mode. Look for the plugin.
    Expected from the manifest: it is not a Dev Mode plugin. Record the actual menu.
40. Free plan versus a paid file, if both are available.
    Expected: record any variable or export error. Do not assume a plan limit.
41. Two MCP clients, one server.
    Expected: the second process logs that it is using the existing bridge. Both can `list_files`.
42. Close the plugin while `render_design` is in flight, if you can time it.
    Expected: record whether a partial tree remains.

## WSL

1. Start the server inside WSL. From Windows, request `http://127.0.0.1:1995/ping`.
   Expected: record whether Windows reaches WSL. This audit did not run that check against a listener used by Figma.
2. Run the stamped plugin in Windows Figma while the server is only inside WSL.
   Expected: record Connected or Bridge unavailable. If unavailable, the README needs a forwarding step. Do not change the default port to paper over it.
3. Set `PHOLLY_PORT=1996` and restart.
   Expected from current code: the plugin still dials 1995 and does not connect.

## MCP clients

For each client, record the config path, whether initialize succeeds, the protocol version the client sent, whether `tools/list` shows 53 tools, one read (`list_files` or `get_metadata`), and one write on a disposable file.

| Client | Config to try | Not tested |
|---|---|---|
| Claude Code / Desktop | `node` plus `apps/server/dist/index.js` | yes |
| Cursor | MCP settings JSON | yes |
| Codex | TOML, not only the README JSON | yes |
| OpenCode | `type: local` command array, as in `apps/server/README.md` | yes |
| VS Code | Copilot MCP config | yes |
| Gemini CLI | its MCP config | yes |
| Warp | its MCP config | yes |

If a client disconnects after initialize, record the protocol version it required before changing the server off `2024-11-05`.

## OS

| OS | What to run | Status |
|---|---|---|
| WSL / Linux | Commands above | Ran |
| Windows | Access check on the token file and stamped plugin after setup | not tested |
| macOS | `npm test` and setup mode bits | not tested |
| Node 20 | `npm test` | not tested; expect the plugin script to reject the strip-types flag |
