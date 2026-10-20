# Fix plan

Audit only. Do not apply these until the findings are approved. Order is by risk, then by what later fixes depend on. Effort is relative: S under a day, M one to three days, L longer. Risk is the chance of a bad publish or a broken file, not the size of the diff.

Do not change tool names, already-required fields, the `list_files` field set, port 1995, boolean `confirm: true`, default `render_design` mode `append`, or default undo commit. HMAC hello versus the published 0.2.1 cleartext hello is already a break. Say so when publishing.

## 1. Authenticate the server to the plugin (SEC-001)

- Effort: M. Risk: medium. Depends on nothing.
- Change: ignore inbound `method` frames until the peer returns a MAC over a plugin-chosen nonce. Stamp `ws://127.0.0.1:<actual port>` into the plugin and the `networkAccess` allowlist at setup. Do not dial the name `localhost` if the server binds `127.0.0.1`.
- Regression: unit test that a `method` frame before the MAC is dropped. MANUAL: Figma still connects to a real server and does not connect to a dummy listener on 1995 while the real server is down.
- Breaking: existing development imports must be deleted and re-imported. Tool schemas do not change. Do not change the default port.

## 2. Stop the `/prove` MAC from registering a file (SEC-002)

- Effort: S. Risk: low. Can ship with 1.
- Change: use different HMAC domains for prove and hello, with a length prefix so a label cannot be confused with `leader`. Reject reserved file keys.
- Regression: the isolated-port repro in `TEST_PLAN.md` must get `UNAUTHORIZED`, not `ready`. Existing file-key hellos must still succeed.
- Breaking: none for real Figma keys.

## 3. Do not publish 0.2.2 until 1 and 2 are in (REL-001)

- Effort: S after those fixes. Risk: high if skipped.
- Change: tag the fixed commit, publish with provenance, and point the README at that version. Until then, say that npm latest is 0.2.1 and does not have the GitHub security notes.
- Regression: `npm view @mubizzu/pholly-figma-mcp version` matches the tag. A fresh npx setup does not send `token` on the socket.
- Breaking: 0.2.1 plugins will not speak HMAC to a 0.2.2 server. The upgrade note must say: delete the development plugin and re-import. Omitted `fileKey` with two files becomes an error. That is intentional.

## 4. Make source setup copy the plugin (REL-002)

- Effort: S. Risk: low. Independent.
- Change: run `copy-plugin.mjs` at the end of the root build, or have setup build and copy when `apps/server/plugin` is missing. Keep the placeholder out of the import path.
- Regression: the temp-clone commands in `TEST_PLAN.md` end with setup exit 0 and no `__PHOLLY_TOKEN__`.
- Breaking: none.

## 5. Re-prove the follower before sending the token (SEC-003)

- Effort: S. Risk: low. After 2, because the prove MAC domain changes.
- Change: do not cache `follower` forever. Re-prove, or hold one proved connection. If prove fails, stop sending the bearer token.
- Regression: kill the leader, bind a recorder, call a tool, assert the recorder got no `Authorization`.
- Breaking: none while the same leader stays up.

## 6. Close the image-fetch hole (SEC-004)

- Effort: M. Risk: medium. Independent.
- Change: block private, loopback, link-local, and metadata addresses on the first hop as well as redirects. Connect to the addresses just checked. Cap data URIs at 15 MB. If a local image server is required, add an explicit opt-in. Do not leave `http://127.0.0.1` as the default success path.
- Regression: update `images.test.ts` so the current loopback success becomes a rejection. A public image still inlines.
- Breaking: private `create_image` URLs stop working. Document it. Schema unchanged.

## 7. Fail closed on socket errors (SEC-005)

- Effort: S. Risk: low. Independent.
- Change: `socket.on('error')`, fail that socket's pending calls on close, and `.catch` the stdio `handleMcp` promise.
- Regression: reset the plugin connection. Process stays up. The in-flight call returns immediately.
- Breaking: clients see a fast error instead of a 30 second timeout. Not a schema change.

## 8. Text color and mixed fonts (INT-002, INT-003)

- Effort: M. Risk: medium. Needs a disposable Figma file.
- Change: apply color through `normalizeColor`, or remove color from the description. For mixed `fontName`, load range fonts before editing. Do not assign one font unless the caller asked to unify.
- Regression: single-font color test. MANUAL mixed-font rows in `TEST_PLAN.md`.
- Breaking: a color no-op becomes a fill change. That matches the current description. Unifying fonts as a side effect of a move would be a visual break. Do not do that.

## 9. Render, batch, and undo honesty (INT-001, INT-004, INT-008, INT-010)

- Effort: L. Risk: high, because this writes the file.
- Change: one mutation queue. Apply the same text and layout fields on create and update. Reject unknown `mode`. Do not append a text node before the font loads. Reject nested `create_image`, export, screenshot, and `undo` inside `batch` unless the server steps are actually run. Keep reconcile deletion only when `children` is an array. Add confirm, or a returned diff, before those deletes. Do not start deleting when `children` is omitted.
- Regression: MANUAL rows 29 through 37. A batch whose second operation fails must not look like a clean success.
- Breaking: unknown `mode` starts failing. Gating reconcile deletes changes current silent removal. Nested methods that already fail may start failing earlier, with a clearer error. Do not add required fields.

## 10. Wrong success results (INT-005, INT-006, INT-007, INT-009)

- Effort: M. Risk: low to medium.
- Change: `get_design_context` throws on a missing id. `get_styles` includes values or the description is narrowed. `set_auto_layout` accepts both `mode`/`itemSpacing` and `direction`/`gap`. `delete_nodes` returns only ids that were removed, and refuses pages.
- Regression: missing id is `isError`. A paint style includes paints if the payload is expanded. Auto-layout round-trip. Missing delete id is not listed as deleted.
- Breaking: the undocumented page fallback goes away. `deleted` may be shorter. Adding style fields is not a break. Do not remove `id` or `name`. Do not drop the old auto-layout names.

## 11. File key and page access (REL-005)

- Effort: S for the flag, L if switching to `dynamic-page`.
- Change: set `enablePrivatePluginApi: true` for this development plugin. Document that the listed key is the URL key only when that flag is accepted, and that a community publish cannot use it. Do not set `documentAccess: dynamic-page` until every `figma.getNodeById` is async or the page is loaded. There is no `getNodeByIdAsync` in the plugin today.
- Regression: MANUAL import. Record the URL key, a node on another page, and any manifest warning.
- Breaking: files that stored a synthetic `pholly-file-key` may start listing the URL key, because the code prefers `figma.fileKey`. Call `list_files` again. Schema unchanged.

## 12. Protocol versions, without dropping the old one (REL-006)

- Effort: S. Risk: medium if `2024-11-05` is removed.
- Change: if the client asks for a version this server supports, return that version. Keep returning `2024-11-05` when that is what the client sent, and when the client sends a version you do not support yet, keep the current response until a real client is checked.
- Regression: the three initialize calls in `TEST_PLAN.md`, plus one client from the client table.
- Breaking: removing `2024-11-05` is breaking. Do not do it in the security release.

## 13. Port, WSL, and Windows file access (REL-007, SEC-006)

- Effort: S for docs, M for a Windows access entry.
- Change: document that the plugin is pinned to port 1995 and that a WSL server is not the same as Windows localhost unless forwarding is enabled. On Windows, set an owner-only access entry for the token file and stamped plugin. Do not treat `stat.mode` as that test.
- Regression: MANUAL WSL rows. A Windows access check after setup.
- Breaking: none. Do not change the default port.

## 14. Release hygiene (REL-003, REL-004, REL-008, REL-009, REL-010)

- Effort: M. Risk: low.
- Change: one CI workflow for `npm ci`, build, typecheck, and test. Set the test Node floor to 22.6 or run plugin tests without `--experimental-strip-types`. Add a contact to `SECURITY.md`. Copy LICENSE into the published `files` set. Decide whether the lockfile should resolve from the public npm registry; integrity hashes already exist, and `npm ci` succeeded against the mirror.
- Regression: CI green on a clean runner. `npm pack` contains LICENSE and the placeholder plugin.
- Breaking: raising `engines` makes npm warn on Node 20. Say whether the binary still runs there. The test script does not.

## Explicitly not in the first fix pass

- Rewriting every tool schema. Enforce fields that are already required, but do not add required fields.
- `documentAccess: dynamic-page` before async node lookup.
- Changing reconcile so a missing `children` field deletes nodes.
- Dropping MCP `2024-11-05`.
- Client-specific config files for Claude, Cursor, Codex, VS Code, Gemini, and Warp until one of them is actually connected.
- Legal wording beyond a short privacy note that design text and screenshots leave Figma into the MCP client. That note is not a legal opinion.

## Suggested release cut

Ship 1 through 7 together, with the setup copy fix, before any npm publish. Then 8 through 10. Then the file-key flag and protocol echo, after one manual Figma pass and one MCP client pass. Tag that commit. Do not tag the current `main`.
