# Local verification branch (`verify/local-agentback`)

This branch points the demo's `@agentback/*` dependencies at the **local**
agentback monorepo instead of the published npm versions, so you can verify a
release end-to-end **before** `pnpm -r publish`.

## Layout assumption

The agentback monorepo is a sibling directory:

```
ninemind/
  agentback/        # the framework monorepo (built dist/)
  agentback-demo/   # this repo, on branch verify/local-agentback
```

The 8 direct deps in `package.json` use pnpm's `link:` protocol
(`link:../agentback/packages/<name>`). Transitive `@agentback/*` deps resolve
through agentback's own workspace symlinks, so only the direct deps are linked.
`npm`/`file:` can't be used here — the local packages declare `workspace:~`
internal deps, which only resolve inside the pnpm workspace; a `link:` symlink
defers each package's resolution to the agentback workspace.

## Workflow

```bash
# 1. Build the framework first — consumers import from dist/, not src/
( cd ../agentback && pnpm build )

# 2. Link + verify the demo (pnpm, not npm, on this branch)
pnpm install        # symlinks the 8 local packages
pnpm run build      # tsc against local @agentback types
pnpm test           # vitest

# 3. Runtime smoke (optional)
PORT=4055 node dist/serve-http.js   # MCP over Streamable HTTP + /openapi.json
node dist/console.js                # the unified dev console
```

After changing framework source, re-run step 1 (rebuild agentback) then step 2.

## Notes

- This branch uses **pnpm** (`pnpm-lock.yaml`); `main` uses npm
  (`package-lock.json`, left in place). Do not merge this branch to `main` —
  the `link:` specs are machine-local. It exists only for pre-publish testing.
- To test against a candidate release instead of local source, swap the
  `link:` specs back to the version range and `pnpm install`.
