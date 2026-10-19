# Fix summary

Date: 2026-10-19. Phase 2 applied the approved fixes. No product behavior was published. The working tree is version `0.3.0`; npm still serves `0.2.1`, and the README now says so.

Verification on this machine (WSL, Node v22.23.2, npm 10.9.8):

- `npm run build` exit 0.
- `npm run typecheck` exit 0.
- `npm test` pass: 66 server tests, 7 plugin tests.
- Clean clone (`npm ci`, build, test, setup) exit 0, plugin copied by the root build, no `__PHOLLY_TOKEN__` in the stamped output, port `127.0.0.1:1995` stamped.

## Protocol checks after the fix

- `/prove` MAC used as a hello MAC: `UNAUTHORIZED`.
- File key `leader`: `UNAUTHORIZED`.
- Valid hello receives `ready`, and the ready MAC verifies in the test client.
- Unscoped `get_metadata` is routed to the registered fake plugin and returns its response.
- After the plugin socket closes, the next call returns `NO_PLUGIN`, and an in-flight call fails in under 2 s with `PLUGIN_DISCONNECTED` instead of waiting for the 30 s timeout.
- A second server on the same port joins the proved leader and its stderr does not contain the token.
- `initialize` echoes `2025-03-26` and `2025-06-18` and falls back to `2024-11-05` for an unsupported version.
- Unknown tool and missing required `nodeId` are rejected before the plugin is called.
- `npm pack` for 0.3.0 contains `package/LICENSE`, `package/plugin/manifest.json`, and `package/dist/index.js`.

## Finding status

| Finding | Status | What changed | Evidence |
|---|---|---|---|
| SEC-001 plugin does not authenticate the server | Fixed | `ready` now carries a MAC over both nonces; the plugin drops `method` frames until it verifies; setup stamps `ws://127.0.0.1:<port>` | [ui.html](apps/plugin/src/ui.html), [index.ts](apps/server/src/index.ts), [token.ts](apps/server/src/token.ts) |
| REL-001 npm install is 0.2.1 | Mitigated | Version bumped to 0.3.0; README says npm is stale and the handshake is incompatible | [README.md](README.md), [CHANGELOG.md](CHANGELOG.md) |
| SEC-002 `/prove` MAC registers `leader` | Fixed | MAC domains separated; `leader` file key rejected | [token.ts](apps/server/src/token.ts), [index.ts](apps/server/src/index.ts) |
| REL-002 clean clone setup fails | Fixed | Root build ends with `copy-plugin.mjs`; setup error text no longer suggests a manual step | [package.json](package.json) |
| SEC-003 follower keeps sending the token | Fixed | Proof is refreshed every 5 s; failure aborts follower calls | [index.ts](apps/server/src/index.ts) |
| SEC-004 first-hop private image fetch | Fixed | Every hop is checked, including literal IPv6; data URIs capped; explicit `PHOLLY_ALLOW_PRIVATE_IMAGE_HOSTS=1` opt-in | [images.ts](apps/server/src/images.ts) |
| SEC-005 socket close and unhandled rejection | Fixed | Socket error handler, pending calls fail on close, stdio promise caught, sends guarded | [index.ts](apps/server/src/index.ts) |
| INT-001 non-atomic edits and silent reconcile delete | Partially fixed | Reconcile collects deletions before mutating and requires `confirmDelete: true`; reparent preflights ids; text nodes append after font load; batch blocks undo and server-special methods | [code.ts](apps/plugin/src/code.ts) |
| INT-002 `set_text_properties` color | Fixed | Applies a solid fill from hex or RGBA | [code.ts](apps/plugin/src/code.ts) |
| INT-003 mixed-font writes | Fixed | Range-font loading instead of casting `fontName` | [code.ts](apps/plugin/src/code.ts) |
| INT-004 `render_design` drops fields | Fixed | Layout and text apply on update; unknown `mode` is rejected | [code.ts](apps/plugin/src/code.ts) |
| INT-005 `get_design_context` fallback | Fixed | Throws on an unknown node id | [code.ts](apps/plugin/src/code.ts) |
| INT-006 `get_styles` metadata only | Fixed | Style payloads are included | [code.ts](apps/plugin/src/code.ts) |
| INT-007 auto-layout vocabulary | Fixed | Accepts `mode`/`itemSpacing` and `direction`/`gap` | [code.ts](apps/plugin/src/code.ts) |
| INT-008 batch bypasses server steps | Fixed | These methods are rejected inside `batch` with a clear error | [code.ts](apps/plugin/src/code.ts) |
| INT-009 `delete_nodes` false success | Fixed | Returns `deleted` and `missing`; refuses pages | [code.ts](apps/plugin/src/code.ts) |
| INT-010 `undo` scope | Mitigated | Description says it is the editor undo; nested `undo` is rejected; the API cannot scope to bridge commits | [code.ts](apps/plugin/src/code.ts) |
| INT-011 no wire size cap | Deferred | Depth, scale, and vector caps remain; no byte cap yet | See follow-up below |
| INT-012 asset cwd | Mitigated | Documented that output is relative to the server process cwd | [README.md](README.md) |
| INT-013 early fallback key | Mitigated | `ready` requires the file key to match the current hello; the transient key still appears briefly | [ui.html](apps/plugin/src/ui.html) |
| INT-014 missing required fields | Fixed | Server validates `required`, types, enums, and bounds before the plugin call | [validate.ts](apps/server/src/validate.ts) |
| INT-015 variable values `as any` | Fixed | COLOR values are normalized; `resolvedType` is checked; empty `variableId` no longer unbinds silently | [code.ts](apps/plugin/src/code.ts) |
| INT-016 paint target / alpha | Fixed | Unknown targets still fall back to fills; hex alpha becomes paint opacity | [code.ts](apps/plugin/src/code.ts) |
| INT-017 screenshot scale | Fixed | Positive scale is clamped; `0` is no longer silently "no constraint" | [code.ts](apps/plugin/src/code.ts) |
| INT-018 `create_shape` types | Fixed | Only rectangle, ellipse, line | [code.ts](apps/plugin/src/code.ts) |
| INT-020 `get_path` page | Documented | Still walks to the owning page | — |
| INT-021 enum gaps | Fixed | Stroke and variable enums are checked | [code.ts](apps/plugin/src/code.ts) |
| REL-003 Node 20 test floor | Fixed | Plugin tests run through `tsx`, not experimental type stripping | [apps/plugin/package.json](apps/plugin/package.json) |
| REL-004 no CI/tags/provenance | Partially fixed | CI, Dependabot, issue template added. Tags and npm publication still require the maintainer | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| REL-005 `figma.fileKey` flag | Fixed | `enablePrivatePluginApi` added; README explains the dev-plugin caveat and synthetic-key fallback | [manifest.json](apps/plugin/manifest.json) |
| REL-006 hardcoded MCP version | Fixed | Echoes a supported client version; smoke confirmed `2025-03-26` and `2025-06-18` | [index.ts](apps/server/src/index.ts) |
| REL-007 PHOLLY_PORT/WSL | Fixed | Port is stamped into the plugin and allowlist; README has a WSL section | [setup.ts](apps/server/src/setup.ts) |
| SEC-006 Windows mode bits | Mitigated | Best-effort owner-only `icacls` on token and stamped files; docs no longer claim `0600` protects Windows | [owner-only.ts](apps/server/src/owner-only.ts) |
| SEC-007 expensive regex | Deferred | Length and nested-quantifier caps remain; no execution timeout | — |
| SEC-008 unbounded bodies | Fixed | HTTP body and stdio line caps at 2 MB; data URI cap; render depth cap | [index.ts](apps/server/src/index.ts) |
| SEC-009 prompt injection / SVG | Mitigated | Implementation rules now flag file text as data; SVG is still written as received | [code.ts](apps/plugin/src/code.ts) |
| SEC-010 token in plugin files | Accepted | Inherent to a local plugin; default directory is gitignored and Windows ACL is applied | — |
| SEC-011 token create race | Deferred | No exclusive create yet | — |
| REL-008 lockfile mirror | Deferred | Lockfile still resolves through the mirror; integrity hashes are present | — |
| REL-009 license text | Fixed | `LICENSE` copied into the server package; plugin and protocol declare MIT | [apps/server/LICENSE](apps/server/LICENSE) |
| REL-010 security contact | Fixed | `SECURITY.md` points at GitHub private vulnerability reporting | [SECURITY.md](SECURITY.md) |
| REL-011 version skew | Fixed | Root, server, and plugin are 0.3.0; protocol stays an internal 0.1.0 | package files |
| REL-012 Dev Mode claim | Fixed | README says Dev Mode is not an editor target | [README.md](README.md) |
| REL-013 `/prove` undocumented | Fixed | Documented as an open proof endpoint that does not return the token | [README.md](README.md) |
| REL-014 redo docs | Fixed | Root README explains redo always reports unsupported | [README.md](README.md) |
| REL-015 privacy/trademark | Mitigated | Privacy section added; trademark is a legal review outside this pass | [README.md](README.md) |

## Deliberately not changed

- Reconcile still deletes nothing when `children` is omitted. Changing that would be a new data-loss behavior.
- The `batch` operation shape and all tool names are unchanged. New rejections inside `batch` are behavior changes for previously failing calls.
- The default port remains 1995.
- Dropping MCP `2024-11-05` was not done.
- No tool was renamed or had a required field added. `render_design` gained an optional `confirmDelete`.

## Follow-ups still open

1. Atomic batch: a mid-batch failure still leaves earlier operations applied. A full transaction needs a plugin-side staging pass or a documented rollback strategy.
2. Byte caps for `inspect_selection` and asset/screenshot payloads before base64 leaves the plugin.
3. DNS rebinding TOCTOU: the check resolves the name and `fetch` resolves again. Pinning the connection to the checked address needs a custom agent.
4. Regex execution budget for `find_nodes` and `find_text`.
5. SVG sanitization or rasterization before writing into a project directory.
6. Exclusive token-file creation.
7. Publish 0.3.0 with provenance, tag the commit, and confirm `npm view` matches. The current npm package is still 0.2.1.
8. Figma manual matrix in `TEST_PLAN.md`, including mixed fonts, components, variables, Dev Mode, read-only files, and a second window.
9. One real MCP client from the client table.
