# pholly-figma-mcp audit

Date: 2026-10-19. Phase 1 is audit only. No product code was modified, nothing was published or pushed, and no Figma file was changed.

Scope: public GitHub [mubzie/pholly-figma-mcp](https://github.com/mubzie/pholly-figma-mcp) `main` (package version 0.2.2) and npm `@mubizzu/pholly-figma-mcp` latest `0.2.1`. The local checkout matches that 0.2.2 source. Gitignored local artifacts were not treated as public repo contents. The stamped local plugin was not opened for its token.

## Executive summary

GitHub `main` is a local MCP bridge with real controls: loopback bind, bearer auth on `/files` `/rpc` `/mcp`, HMAC plugin hello, Host checks, origin checks, a file-busy registry, and asset path checks. Those controls are not what `npx` installs, and two of them do not hold in the 0.2.2 source.

`npm dist-tags.latest` is still `0.2.1` (published 2026-08-11). That package sends the raw bridge token on the WebSocket and, on `EADDRINUSE`, becomes a follower and later sends the bearer token without proving the leader. GitHub has no tags and no releases.

Two authentication gaps are in the unpublished source:

1. The plugin executes any WebSocket message that has a `method`, before `ready`, with no proof that the peer knows the token. A process that accepts `ws://localhost:1995` can read and edit the open Figma file. The token proves the plugin to the server. It does not prove the server to the plugin.
2. `/prove` is unauthenticated and returns `HMAC(token, nonce + ".leader")`. Plugin hello accepts that MAC when `fileKey` is `leader`. This was executed locally: a client that did not use the token received `ready` and was listed as the connected file.

The documented source install is also broken. On a clean tree, `npm install && npm run build && npm run setup` exits 1 because `npm run build` never copies the plugin into `apps/server/plugin/`. That copy exists only in `prepack`.

Automated result on this machine (WSL, Node v22.23.2, npm 10.9.8): temp-clone `npm ci` succeeded, `npm run build` and `npm run typecheck` succeeded, `npm test` passed 54 server tests and 7 plugin tests, and `npm audit --omit=dev` against `registry.npmjs.org` reported 0 vulnerabilities. The lockfile registry (`registry.npmmirror.com`) does not implement `npm audit`. Figma, other operating systems, and MCP clients were not run.

## Severity counts

| Severity | Count | Meaning |
|---|---|---|
| P0 | 4 | Install blocker or security/privacy breach |
| P1 | 16 | Major broken workflow, data integrity, or serious control gap |
| P2 | 22 | Minor correctness, residual security, or compatibility |
| P3 | 8 | Docs and polish |

Counts are the findings in this file, not every matrix row.

## Top 10 risks

1. **SEC-001 (P0)** — The plugin trusts whoever answers `ws://localhost:1995`. No server authentication.
2. **REL-001 (P0)** — `npx` / global install is 0.2.1, which sends the raw token and follows an unproven port.
3. **SEC-002 (P0, verified)** — `/prove` MAC for label `leader` completes plugin registration without the token.
4. **REL-002 (P0, verified)** — Documented clean-clone `setup` fails until `copy-plugin.mjs`.
5. **SEC-003 (P1)** — After one successful `/prove`, a follower keeps sending the bearer token to whoever later owns the port.
6. **SEC-004 (P1)** — `create_image` allows private/loopback on the first hop and does not pin DNS.
7. **INT-001 (P1)** — Batch, reconcile, and reparent can leave a half-applied file. Reconcile deletes keyed children with no confirm.
8. **INT-002 / INT-003 (P1)** — `set_text_properties` ignores color. Mixed-font text is loaded with `fontName as FontName` before any edit.
9. **REL-005 (P1)** — Manifest omits `enablePrivatePluginApi`, which Figma's docs require for `figma.fileKey`.
10. **REL-006 (P1, verified)** — `initialize` always returns protocol `2024-11-05`, ignoring the client version.

## Scope and method

Reviewed every MCP tool in `apps/server/src/tools.ts`, every plugin `switch` case in `apps/plugin/src/code.ts`, HTTP and WebSocket handling in `apps/server/src/index.ts`, image fetch, token, setup, assets, registry, policy, plugin UI, manifests, package metadata, README, CHANGELOG, SECURITY, CONTRIBUTING, LICENSE, and the published 0.2.1 sources at git `b70c5f97e47645a1df43f80f9a9967148b6431d3`.

Executed in WSL: `npm run build`, `npm run typecheck`, `npm test`; a temp clean clone at `/tmp/pholly-audit-clone2`; a handshake check on `127.0.0.1:28771` with a test token; `npm audit --omit=dev` against the official registry; `npm outdated`; a secret-pattern search. `gitleaks` and `trufflehog` are not installed. The working tree and the user's stamped plugin were not deleted.

Not executed: Figma, other MCP clients, Windows ACL, macOS, Node 20, the published 0.2.1 tarball at runtime, a finished `npm pack` listing, and branch protection.

**VERIFIED** means this session ran it. **STATIC** means code, docs, or a fetched public file. **MANUAL** means it needs Figma, another OS, or another client.

## Inventory

53 tools in `apps/server/src/tools.ts:8-60`. 52 plugin cases in `apps/plugin/src/code.ts:51-103`. `list_files` is the only tool with no plugin case, and that is intentional (`apps/server/src/index.ts:255-263`). No plugin case lacks a tool.

The server does not enforce `inputSchema` (`index.ts:252-277`). Special handling is only `list_files`, `create_image` before RPC, and `export_selection_assets` / `save_screenshots` after a successful RPC. `batch` does not get those steps.

HTTP, bound to `127.0.0.1`: `/ping` open; `/prove` open and returns an HMAC for label `leader`; `/files` `/rpc` `/mcp` require a bearer; missing or non-local `Host` is 403. WebSocket: `hello-begin`, outbound `challenge`, `hello`, `ready`, `error`. Any socket message whose `id` is pending is accepted as the response (`index.ts:234-238`). Modes: `leader`, `follower` after prove, `rejected`. The UI also sends an early random fallback key (`ui.html:41`).

Sync `figma.getNodeById` is used throughout `code.ts`. There is no `getNodeByIdAsync`. Figma's docs say the sync form throws if `documentAccess` is `dynamic-page`. The manifest does not set that field. Runtime is MANUAL.

## Findings

### SEC-001 — Plugin command channel is unauthenticated

- Severity: P0. Area: security. Status: STATIC. Windows Figma resolver: MANUAL.
- Evidence: `apps/plugin/src/ui.html:41` dials `ws://localhost:1995/ws`. `ui.html:50` forwards any JSON object with `method` into the sandbox, with no check that `ready` arrived or that the peer knows the token. `apps/plugin/src/code.ts:35-37` runs that call. `delete_nodes` only needs `confirm === true` (`apps/plugin/src/policy.ts:23-25`). The server listens only on `127.0.0.1` (`apps/server/src/index.ts:297`). Setup stamps the token, not the port (`apps/server/src/setup.ts:22-26`). `SECURITY.md:12` says a port squatter does not learn the token.
- Impact: whoever accepts the plugin dial can read, export, and edit the open file without the token. Winning `127.0.0.1:1995` before the bridge is enough; the UI retries every 1.5s. `localhost` can also be `::1` while the server holds `127.0.0.1`. This WSL host resolves `localhost` to `127.0.0.1` only. Figma on Windows was not tested.
- Expected: method frames are ignored until the peer proves the token, and the dial matches the bind address.
- Actual: any peer that accepts the dial can send `{id, method, params}`.
- Fix: stamp `ws://127.0.0.1:<port>` and the matching allowlist. Require a server MAC before accepting methods.
- Test: a listener on 1995, with the real server down, must not receive a document export.
- Breaking: existing imports must be re-imported. Tool schemas do not change.

### REL-001 — Published install is 0.2.1, not the GitHub security fixes

- Severity: P0. Area: release / security. Status: STATIC. Published source was fetched. 0.2.1 was not executed.
- Evidence: npm latest is `0.2.1` (2026-08-11). No `0.2.2`, no tags, no releases. Published git `b70c5f97` sends `{type:'hello', token}` and, on `EADDRINUSE`, follows without prove. It also logs a token prefix, stamps `token.slice(0, 8)` into the plugin id, treats a missing Host as local, and reports MCP version `0.1.1`. Registry `dist` has signatures and no provenance attestations.
- Impact: `npx -y @mubizzu/pholly-figma-mcp` installs the weaker package. A process on port 1995 can receive the raw token from the plugin and the bearer token from a later client.
- Fix: publish only after SEC-001 and SEC-002 are fixed. Tag the commit. Say that 0.2.2 is unpublished until then.
- Test: `npm view @mubizzu/pholly-figma-mcp version` equals the git tag.
- Breaking: HMAC hello is incompatible with a 0.2.1 plugin. Users must delete the dev plugin and re-import. Omitted `fileKey` with two files becomes an error.

### SEC-002 — `/prove` MAC registers fileKey `leader`

- Severity: P0. Area: security. Status: VERIFIED.
- Evidence: `/prove` returns `bridgeMac(token, nonce, 'leader')` before auth (`apps/server/src/index.ts:146-149`). Hello checks `bridgeMac(token, nonce, fileKey)` (`index.ts:217`, `token.ts:41-43`).
- Repro: server on `127.0.0.1:28771` with a test token. `hello-begin` with `fileKey: "leader"`, then `GET /prove?nonce=<challenge>` (200, 64-character MAC), then `hello`. Result: `ready`, and `/files` listed `["leader"]`. A following `get_metadata` was routed there and returned `TIMEOUT`. Leader stderr did not contain the test token.
- Impact: a local client that does not know the token becomes a connected file and can receive unscoped tool calls. It does not enter a different real file key. Browser reachability with `Origin: null` is MANUAL.
- Fix: domain-separate the MAC. Reject reserved labels.
- Test: the repro must receive `UNAUTHORIZED`.
- Breaking: none for real Figma file keys.

### REL-002 — Clean-clone setup does not copy the plugin

- Severity: P0. Area: install. Status: VERIFIED.
- Evidence: root `build` does not run `copy-plugin.mjs` (`package.json:8`). That script is only in `prepack` (`apps/server/package.json:20`). Setup requires `apps/server/plugin` (`index.ts:46-54`), which is gitignored.
- Repro: temp clone excluding build artifacts and `*.tsbuildinfo`. `npm ci` 0. `npm run build` 0. `npm run setup` 1: `bundled plugin not found at /tmp/pholly-audit-clone2/apps/server/plugin`. After the copy script, setup exited 0. Stamped files were mode `600`, directory `700`, and contained no `__PHOLLY_TOKEN__`.
- Fix: copy the plugin at the end of the root build, or from setup when `plugin/` is missing.
- Test: the temp-clone command, then setup exit 0 and no placeholder.
- Breaking: none.

### SEC-003 — Follower proof is not repeated

- Severity: P1. Area: security. Status: STATIC. Joining a real leader was VERIFIED. Replacing that leader was not.
- Evidence: prove runs once (`index.ts:287-295`). Later calls send `Authorization: Bearer ${token}` to `127.0.0.1:${port}` (`index.ts:110-114`).
- Impact: after the leader exits, the next tool call can send the token to the new occupant.
- Fix: re-prove before each send, or keep the proved connection.
- Test: kill the leader, bind a recorder, call a tool, assert no `Authorization`.
- Breaking: none if the leader is stable.

### SEC-004 — First-hop image fetch allows private addresses

- Severity: P1. Area: security. Status: STATIC. The `127.0.0.1` unit test passed.
- Evidence: private and loopback checks run only on redirects (`images.ts:32-48`). `images.test.ts:20` expects a first-hop loopback fetch to succeed. DNS is not pinned (`images.ts:84-85`). Data URIs skip the 15 MB cap (`images.ts:78`).
- Impact: an authorized caller can make the bridge GET loopback, LAN, or a rebinding name. Redirect-to-private is blocked if DNS does not change.
- Fix: check every hop, connect only to the checked addresses, cap data URIs, and make local image servers an opt-in. Update the test that requires the hole.
- Breaking: private `create_image` URLs stop working. Document it. Schema unchanged.

### SEC-005 — Socket close and missing error handler

- Severity: P1. Area: reliability. Status: STATIC for the missing handlers. `TIMEOUT` and later `NO_PLUGIN` were VERIFIED.
- Evidence: no `socket.on('error')` (`index.ts:186-244`). `close` does not fail `pending` (`index.ts:244`). Stdio has no `.catch` (`index.ts:316`).
- Impact: an unhandled `error` event can exit the process. In-flight calls wait for `PHOLLY_TIMEOUT`. The plugin redials in 1.5s, which feeds SEC-001.
- Fix: error listener, fail that socket's pending calls, catch the stdio promise.
- Breaking: faster errors instead of a 30s timeout. Not a schema change.

### INT-001 — Edits are not atomic; reconcile deletes without confirm

- Severity: P1. Area: data integrity. Status: STATIC. Figma undo after a throw is MANUAL.
- Evidence: `batch` uses `dispatch` (`code.ts:96`). A throw skips `commitUndo` (`code.ts:45-48`). Denylist is only `delete_nodes` and `batch`. Reconcile removes a keyed child when `children` is present and the key is absent (`code.ts:118`). `reparent_nodes` is a loop (`code.ts:98`). `createNode` appends before font load (`code.ts:109`). No call queue (`code.ts:27-37`).
- Impact: a failed batch can leave earlier edits. Reconcile can delete keyed children with no confirm. Omitting the `children` field deletes nothing.
- Fix: one mutation queue. Do not append until bytes and fonts succeed. Require confirm or a diff before reconcile deletes. Do not delete when `children` is omitted. That would be a breaking data-loss change.
- Breaking: silent reconcile deletion, if gated, changes current behavior. Call it out. Do not add a required field.

### INT-002 — `set_text_properties` ignores color

- Severity: P1. Area: correctness. Status: STATIC.
- Evidence: `tools.ts:32` promises color. `code.ts:69` does not read it.
- Impact: success with no color change.
- Fix: apply `normalizeColor`, or drop color from the description. Applying the documented color is not a schema break.
- Breaking: a previous no-op becomes a fill change. That is the documented behavior.

### INT-003 — Mixed-font writes cast `fontName`

- Severity: P1. Area: correctness. Status: STATIC. Exception text is MANUAL.
- Evidence: `code.ts:68`, `code.ts:69`, `code.ts:118` load `n.fontName as FontName` before the edit. Reads already map symbols to `MIXED` (`code.ts:125`).
- Impact: mixed text cannot be rewritten or moved through these tools.
- Fix: load every range font. Do not unify the font unless asked.
- Breaking: unifying fonts as a side effect would be a visual break. Do not do that.

### INT-004 — `render_design` drops fields and ignores unknown `mode`

- Severity: P1. Area: correctness. Status: STATIC.
- Evidence: update path applies `applyProps` plus `d.content` only (`code.ts:118`). Layout is not applied (`code.ts:108`). Any mode other than `reconcile` appends (`code.ts:102`). README line 63 implies `commitUndo: true` is required. The default already commits. The tool text matches the code.
- Fix: apply the same text and layout fields on update. Reject unknown `mode`.
- Breaking: unknown `mode` strings will error instead of duplicating. Default stays append.

### INT-005 — Missing id in `get_design_context` returns the page

- Severity: P1. Area: correctness. Status: STATIC.
- Evidence: `code.ts:58` uses `getNodeById(id) ?? currentPage`. `get_node` throws (`code.ts:57`).
- Fix: throw `Node not found`.
- Breaking: undocumented page fallback starts failing. Call it out.

### INT-006 — `get_styles` returns names only

- Severity: P1. Area: correctness. Status: STATIC.
- Evidence: `code.ts:119` returns `{id, name, key, description}`.
- Fix: include style payloads, or narrow the description. Adding fields is not a break. Do not remove `id` or `name`.

### INT-007 — Auto-layout names do not round-trip

- Severity: P1. Area: correctness. Status: STATIC.
- Evidence: reader emits `mode` and `itemSpacing` (`code.ts:126`). Writer reads `direction` and `gap` (`code.ts:75`).
- Fix: accept both. Do not stop accepting the old names.
- Breaking: none if both work.

### INT-008 — `batch` skips server image and asset steps

- Severity: P1. Area: contract. Status: STATIC.
- Evidence: special cases use the top-level name only (`index.ts:264-276`). Plugin `create_image` rejects non-data URIs (`code.ts:110`).
- Fix: reject those nested methods with a clear error, or run the server steps. Keep `{method, params}`.
- Breaking: none. The nested http URL already fails in the plugin.

### INT-010 — `undo` is the editor undo

- Severity: P1. Area: data integrity. Status: STATIC. Which step moves is MANUAL.
- Evidence: `tools.ts:56` vs `figma.triggerUndo()` at `code.ts:88`. Allowed inside `batch`.
- Fix: describe the real behavior. Reject nested `undo`.
- Breaking: nested `undo` only.

### REL-005 — `enablePrivatePluginApi` is missing

- Severity: P1. Area: compatibility. Status: STATIC. Runtime MANUAL.
- Evidence: manifest has no `enablePrivatePluginApi` and no `documentAccess`. Figma says `figma.fileKey` requires the flag ([docs](https://developers.figma.com/docs/plugins/api/figma/)). Code falls back to a synthetic key (`code.ts:14-16`). Sync `getNodeById` is incompatible with `dynamic-page`. Do not set that field yet.
- Fix: set the private-plugin flag for this dev plugin. Document that a community publish cannot use the URL key. Returned keys may change for files that stored a synthetic key.
- Breaking: `list_files` keys may change. Schema does not.

### REL-006 — Protocol version is hardcoded

- Severity: P1. Area: compatibility. Status: VERIFIED for the response. Clients MANUAL.
- Evidence: smoke asked for `2024-11-05`, `2025-03-26`, and `2025-06-18`. All got `2024-11-05` and server `0.2.2`. `tools/list` returned 53. No cancellation or progress. [Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) says a client that does not support the server version should disconnect.
- Fix: echo a supported client version. Keep `2024-11-05`. Do not drop it in the security release.
- Breaking: dropping `2024-11-05` would be breaking.

### REL-007 — Port and WSL are not wired to the plugin

- Severity: P1. Area: compatibility. Status: STATIC. Windows-to-WSL reachability MANUAL.
- Evidence: `PHOLLY_PORT ?? 1995` (`index.ts:71`). Plugin and allowlist are hardcoded to 1995. No WSL note.
- Fix: do not change the default port. Stamp the port with SEC-001, or refuse a non-default port until the URL is stamped.
- Breaking: do not change port 1995.

### SEC-006 — Windows `0600` is not an owner-only ACL

- Severity: P1 on multi-user Windows. Status: STATIC. WSL temp setup was mode `600` (VERIFIED). `icacls` not run.
- Evidence: `token.ts:24-25`, `setup.ts:15-20`. Node does not implement owner/group/others on Windows. Tests assert `stat.mode` (`token.test.ts:19`). Existing token files are not re-chmodded.
- Fix: set an owner-only Windows access entry. Do not treat `stat.mode` as that test.
- Breaking: none.

### P2 and P3

| ID | Sev | Status | Note |
|---|---|---|---|
| INT-009 | P2 | STATIC | `delete_nodes` reports requested ids even when missing (`code.ts:103`). Shrinking `deleted` is a small response change. |
| INT-011 | P2 | STATIC | No wire cap on inspect or export. Disk caps apply after base64. Export failure discards the spec. |
| INT-012 | P2 | STATIC | Asset directory is process cwd. Path-escape tests passed. |
| INT-013 | P2 | STATIC | UI fallback key is replaced later. Early `list_files` can 404. |
| INT-014 | P2 | STATIC | Missing required fields can no-op. Enforcing fields that are already required is a behavior change. Do not add required fields. |
| INT-015 | P2 | STATIC | Variable values are `as any`. Empty `variableId` unbinds. Figma text MANUAL. |
| INT-016 | P2 | STATIC | Unknown paint target becomes fills. Hex alpha vs opacity is MANUAL. |
| INT-017 | P2 | STATIC | Screenshot `scale: 0` means no constraint. |
| INT-018 | P2 | STATIC | `create_shape` can create `FRAME` and `TEXT`. |
| INT-019 | P3 | STATIC | `list_files` success has no `isError`. |
| INT-020 | P2 | STATIC | `get_path` walks to the owning page. |
| INT-021 | P2 | STATIC | Stroke enums are not checked. Effects schema says color is a string; the handler accepts objects. |
| INT-022 | P3 | STATIC | Unused `RENDER_TYPES`. |
| SEC-007 | P2 | STATIC | Search length cap 80. The expensive-pattern filter is incomplete. No payload here. |
| SEC-008 | P2 | STATIC | Unbounded HTTP body, data URI, and render recursion. |
| SEC-009 | P2 | STATIC | File text has no untrusted-content boundary. SVG export is unsanitized. |
| SEC-010 | P2 | STATIC | Token is embedded in stamped `ui.html` and `code.js`. Default directory is gitignored. Plugin id is a hash prefix. |
| SEC-011 | P2 | STATIC | Token create is not exclusive. |
| SEC-012 | P3 | STATIC | `timingSafeEqual` after a length check. MAC length is fixed. |
| SEC-013 | P3 | STATIC | Challenges have no TTL. A new socket gets a new nonce. |
| REL-003 | P2 | STATIC | Engines `>=20`. Plugin tests need Node 22.6+. This machine is v22.23.2 and those tests passed. Node 20 was not run. |
| REL-004 | P2 | STATIC | No CI, tags, releases, or provenance. Branch protection not readable. |
| REL-008 | P2 | VERIFIED ci | Lockfile uses `registry.npmmirror.com`. Temp `npm ci` succeeded. Audit there is unimplemented. Official-registry audit reported 0 vulnerabilities. |
| REL-009 | P2 | STATIC | Only the server package has `"license": "MIT"`. Older npm versions were `UNLICENSED` and are deprecated. `files` omits the root LICENSE. |
| REL-010 | P2 | STATIC | `SECURITY.md` has no contact. |
| REL-011 | P3 | STATIC | Server 0.2.2, plugin and protocol packages 0.1.0. |
| REL-012 | P2 | STATIC | `editorType` is only `figma`. README says Dev Mode is read-only. The plugin is absent there. MANUAL. |
| REL-013 | P3 | STATIC | README omits that `/prove` is open. It does not return the token. |
| REL-014 | P3 | STATIC | `redo` always throws, matching its own description. Root README lists it beside working tools. |
| REL-015 | P3 | STATIC | No privacy notice that design data goes to the MCP client and then to that client's model. Trademark use of "Figma" was not legally determined. This audit is not legal advice. |

Controls that held in the passing tests: non-local Host is 403; remote origins are rejected; cleartext hello and a bad MAC are rejected; a second live socket does not get `ready`; two files without `fileKey` is `AMBIGUOUS_FILE`; asset path escape is rejected; image redirect-to-private is rejected when DNS does not change; plugin HMAC matches Node crypto. A smoke `fetch` with a custom Host returned 200 because Node fetch does not honor that override. That is not a bypass.

No secret-shaped strings were found in tracked source. The public npm maintainer email is registry metadata, not a repo file, and is not repeated here.

## Contract to preserve

Do not change, without a version bump and a changelog note: tool names, already-required fields, `list_files` fields, port 1995, boolean `confirm: true`, `render_design` default append and default commit, "omitted `children` does not delete", and `{method, params}`. HMAC hello versus 0.2.1 cleartext hello is already a break. Say so at publish time.

## What I could not verify

Figma import and runtime, mixed fonts, components, variables, images, read-only files, Dev Mode, free plan, concurrent edits, plugin close mid-write, Windows ACL, Node 20, the published tarball at runtime, `npm pack` contents, MCP client connections, WSL forwarding from Windows Figma, browser `Origin: null`, branch protection, macOS, and secret scanners that were not installed. Steps are in `TEST_PLAN.md`.
