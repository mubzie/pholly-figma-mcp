# Audit matrix

Status: pass, fail, or not tested. Evidence class is in the note. Product code was not modified.

## Install and release

| Case | Status | Note |
|---|---|---|
| GitHub main version 0.2.2 | pass | Fetched `package.json`. |
| npm latest equals git | fail | npm latest is 0.2.1. REL-001. |
| Tags and releases exist | fail | Both API lists were empty. |
| npm provenance | fail | Signatures only. No `dist.attestations`. |
| Clean clone `npm ci` | pass | `/tmp/pholly-audit-clone2`, exit 0. VERIFIED. |
| Clean clone `npm run build` | pass | `dist/index.js` present. VERIFIED. |
| Clean clone `npm run setup` | fail | Exit 1, bundled plugin not found. REL-002. VERIFIED. |
| Setup after `copy-plugin.mjs` | pass | Exit 0, mode 600, no placeholder. VERIFIED on WSL. |
| `npm run build` in the working tree | pass | VERIFIED. |
| `npm run typecheck` | pass | VERIFIED. |
| `npm test` | pass | 54 server + 7 plugin. VERIFIED on Node v22.23.2. |
| Node 20 test script | not tested | Script needs `--experimental-strip-types` (Node 22.6+). REL-003. |
| `npm audit` on lockfile registry | fail | npmmirror returned NOT_IMPLEMENTED. |
| `npm audit` on registry.npmjs.org | pass | 0 vulnerabilities, `--omit=dev`. |
| `npm outdated` | fail | Several wanted/latest bumps. None reported vulnerable. |
| `npm pack` tarball contents | not tested | Command did not finish. |
| CI workflow | fail | No `.github`. |
| Issue templates / Dependabot | fail | Absent. |
| Branch protection | not tested | Not readable from this session. |
| Secret scan tools | not tested | gitleaks and trufflehog are not installed. Manual pattern search found none. |
| LICENSE in published tarball | not tested | `files` omits root LICENSE. STATIC. |

## Security

| Case | Status | Note |
|---|---|---|
| Bind 127.0.0.1 | pass | `index.ts:297`. STATIC. |
| Bearer on `/files` `/rpc` `/mcp` | pass | Unit tests passed. |
| Missing Host rejected | pass | Unit test passed. |
| Non-local Host rejected | pass | Unit test passed. Smoke `fetch` Host override is invalid. |
| Remote WebSocket origin rejected | pass | Unit test passed. |
| `Origin: null` accepted | pass | Unit test passed. Browser exploit not tested. |
| Cleartext hello rejected | pass | Unit test in 0.2.2. 0.2.1 source accepts it. |
| Bad MAC rejected | pass | Unit test passed. |
| `/prove` without token | fail | Returns a leader MAC. SEC-002. VERIFIED. |
| fileKey `leader` registration | fail | Received `ready`. SEC-002. VERIFIED. |
| Plugin authenticates the server | fail | Any `method` frame is executed. SEC-001. STATIC. |
| `::1` vs `127.0.0.1` split | not tested | Code split is STATIC. This WSL host resolves localhost to 127.0.0.1. Windows Figma MANUAL. |
| Follower joins a proved leader | pass | Stderr showed existing bridge. VERIFIED. |
| Follower re-proves after leader exit | not tested | Code does not. SEC-003. STATIC. |
| Untrusted port refused | not tested | 0.2.2 code path is STATIC. Not executed. |
| First-hop private image URL | fail | Allowed, and the unit test requires it. SEC-004. |
| Redirect to private image URL | pass | Unit test passed when DNS does not change. |
| DNS pin on image fetch | fail | Lookup then fetch by name. STATIC. |
| Data URI size cap | fail | Returned unchanged. STATIC. |
| Asset `..` and absolute path | pass | Unit tests passed. |
| Asset directory symlink escape | pass | Unit test passed. |
| Token mode 0600 on Linux | pass | Temp setup, mode 600. VERIFIED. |
| Token ACL on Windows | not tested | Node mode bits are not an ACL. SEC-006. |
| Secret in tracked source | pass | No matching patterns. |
| Stamped plugin contains placeholder | pass | 0 occurrences after setup. VERIFIED. |

## Protocol and routing

| Case | Status | Note |
|---|---|---|
| Tool count 53, plugin cases 52 | pass | `list_files` is server-only. STATIC. |
| Handler with no tool | pass | None. |
| Schema enforced by server | fail | Advisory only. INT-014. |
| `initialize` negotiates version | fail | Always `2024-11-05`. REL-006. VERIFIED. |
| `tools/list` | pass | 53 tools. VERIFIED. |
| Closed socket | pass | Later call was `NO_PLUGIN`. VERIFIED. |
| Unanswered plugin | pass | `TIMEOUT`. VERIFIED. |
| Pending calls failed on close | fail | They wait for timeout. SEC-005. |
| Two files, omitted `fileKey` | pass | `AMBIGUOUS_FILE`. Unit test. |
| File busy | pass | Unit test. |
| Early fallback file key | fail | UI registers a random key first. INT-013. STATIC. |
| `PHOLLY_PORT` followed by plugin | fail | Plugin stays on 1995. REL-007. |
| WSL to Windows Figma | not tested | MANUAL. |

## Tool contract (source)

| Tool | Status | Note |
|---|---|---|
| `list_files` | pass | Server special. No plugin case. |
| `get_metadata` | pass | Handler exists. No live Figma test. |
| `get_document` | pass | Depth clamped. No byte cap. |
| `get_selection` | pass | Empty selection is success. |
| `inspect_selection` | fail | No output cap. Export failure drops the spec. INT-011. |
| `export_selection_assets` | fail | Bytes cross the socket before the disk cap. Cwd is the server cwd. |
| `get_node` | pass | Missing id throws. |
| `get_design_context` | fail | Missing id returns the page. INT-005. |
| `get_styles` | fail | Names only. INT-006. |
| `get_variable_defs` | pass | Local collections. Values not resolved. |
| `create_variable_collection` | not tested | Handler exists. Figma MANUAL. |
| `create_variable` | fail | `as any`, enum not checked. INT-015. |
| `set_variable_values` | fail | Same. Missing object is a no-op. |
| `bind_variable` | fail | Empty id unbinds. |
| `create_component` | not tested | Existing component ignores `name`. Figma MANUAL. |
| `create_instance` | not tested | Requires `COMPONENT`, not a set. MANUAL. |
| `set_instance_properties` | not tested | Missing properties is a no-op. |
| `swap_instance_component` | not tested | MANUAL. |
| `detach_instance` | not tested | MANUAL whether plugin data survives. |
| `batch` | fail | Partial apply, denylist only, skips server specials. INT-001, INT-008. |
| `commit_undo` | pass | Not double-committed by `execute`. |
| `get_screenshot` | fail | Scale 0 is falsy. No cap. PDF path matches the description. |
| `set_node_properties` | not tested | Allowlist exists. Missing `properties` throws. MANUAL. |
| `set_text_content` | fail | Mixed font cast. INT-003. |
| `set_text_properties` | fail | Color ignored. INT-002. Mixed font. INT-003. |
| `set_solid_fill` | not tested | Handler exists. Hex alpha vs opacity MANUAL. |
| `set_auto_layout` | fail | Read/write field names differ. INT-007. |
| `set_selection` | not tested | No page switch. MANUAL. |
| `scroll_and_zoom_into_view` | not tested | MANUAL. |
| `create_frame` | not tested | Missing `node` still creates. |
| `create_text` | fail | Appends before font load. Missing Inter MANUAL. |
| `create_shape` | fail | Can create FRAME and TEXT. INT-018. |
| `create_image` | fail | First-hop SSRF. Data URI uncapped. Batch skips the download. |
| `duplicate_nodes` | not tested | MANUAL clone placement. |
| `reparent_nodes` | fail | Loop is not transactional. INT-001. |
| `group_nodes` | not tested | Non-siblings MANUAL. |
| `ungroup_node` | not tested | Type is not limited to group/frame. MANUAL. |
| `validate_design` | fail | Does not check layout, font, or fills. A valid tree can still throw. |
| `render_design` | fail | Drops fields on update. Unknown mode appends. Reconcile deletes. INT-001, INT-004. |
| `delete_nodes` | fail | Reports missing ids. Confirm true is tested. INT-009. |
| `set_gradient_fill` | pass | Stop checks exist. Schema-only test passed. Figma MANUAL. |
| `set_effects` | pass | Type check exists. Schema color is narrower than the handler. |
| `set_stroke_properties` | fail | Enums not enforced. |
| `set_node_visibility` | pass | Boolean check exists. Figma MANUAL. |
| `save_screenshots` | fail | Same wire-cap gap as export. Per-id failures are kept. |
| `find_nodes` | pass | Caps exist. Expensive-pattern filter is incomplete. |
| `find_text` | pass | 200-character preview. Same search filter. |
| `get_path` | pass | Walks to the owning page, not necessarily the current page. |
| `undo` | fail | Global `triggerUndo`. INT-010. |
| `redo` | pass | Always throws, matching its description. |
| `get_changes` | pass | Session set only. Lost on reload. |
| `clear_changes` | pass | Does not undo. |
| `extract_design_tokens` | fail | Mixed font and mixed fills are skipped. |

## Figma, clients, and OS

| Case | Status | Note |
|---|---|---|
| Import manifest | not tested | MANUAL. |
| `documentAccess` | not tested | Field absent. Do not set `dynamic-page` until lookups are async. |
| `enablePrivatePluginApi` | not tested | Flag absent. REL-005. |
| Dev Mode read-only | not tested | Plugin `editorType` is `figma` only. |
| Mixed fonts | not tested | Code path is STATIC. INT-003. |
| Components, variants, variables | not tested | MANUAL. |
| Free plan, read-only, two clients | not tested | MANUAL. |
| WSL | not tested | REL-007. |
| Claude, Cursor, Codex, VS Code, Gemini, Warp | not tested | No configs were connected. |
| Windows ACL | not tested | SEC-006. |
| macOS | not tested | |
