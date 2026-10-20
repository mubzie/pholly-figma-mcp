# Contributing

Thanks for considering contributing to pholly-figma-mcp!

## Getting started

```bash
npm install
npm run build
npm run setup        # creates ./pholly-figma-plugin with the bridge token baked in
```

Import `pholly-figma-plugin/manifest.json` in Figma, run the plugin, and configure
the MCP server (see the README) to develop against a live document.

## Development workflow

- **Branches**: feature work happens on a branch off `main` (e.g. `0.3.0-feature-name`).
  Nothing lands on `main` until it has been verified against a live Figma document.
- **Verify**: `npm run build`, `npm run typecheck`, and `npm run test` must all pass
  (server unit and integration tests, plus plugin policy tests). The root build also
  copies the plugin into `apps/server/plugin`, which is what `setup` reads.
- **Live verification**: plugin-side changes require re-running `setup` and re-importing
  the manifest in Figma before a merge.
- **Changelog**: update `CHANGELOG.md` (keep-a-changelog format) with the version entry.
- **Versioning**: follow semver. New tools and features bump the minor version.

## Release process

1. Merge the verified branch to `main`.
2. Bump the version in `package.json`, `apps/server/package.json`, and `apps/plugin/package.json`;
   add the `CHANGELOG.md` entry.
3. Publish the npm package (`npm publish -w @mubizzu/pholly-figma-mcp`).
4. Tag the release (`git tag vX.Y.Z`) and push the tag.
5. Confirm `npm view @mubizzu/pholly-figma-mcp version` matches the tag. CI does not publish.
