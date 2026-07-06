# Contributing to hive

Thanks for taking the time to help. This repo is the MCP server. If you want to
add a tool to the Hive catalog, that happens on the [website](https://hive-tooling.vercel.app),
not here.

## Ways to help

- **Report a bug.** Open an issue with what you ran, what you expected, and what
  happened. A failing case is worth more than a description.
- **Improve a tool.** The eight MCP tools live in `src/`. Small, focused changes
  with a test are the easiest to review.
- **Fix the docs.** If the README or a tool description is wrong or unclear, a PR
  is welcome.

## Project layout

```
src/
  index.ts          MCP server: registers the eight tools
  hive-api.ts       calls to the Hive API (/api/match, /api/plan, ...)
  lifecycle.ts      install / uninstall / update / sync orchestration
  install.ts        resolve and run a tool's install steps
  lockfile.ts       read and write hive.lock
  state.ts          project state and refcounts
  context-audit.ts  always-on context cost report and swaps
  stack-plan.ts     plan() ranking
  parse.ts          install.md parsing
  config-patch.ts   MCP client config edits
  claude-md-patch.ts CLAUDE.md edits
```

Each module has a matching `*.test.ts` next to it.

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest run
npm run dev        # tsc --watch
```

Node 18 or newer. The server talks to the live Hive API, so most tests stub the
network rather than hit it.

## Making a change

1. Branch from `main`.
2. Keep the change scoped to one thing.
3. Add or update a test that would have failed before your fix.
4. Run `npm run build` and `npm test` before opening the PR.
5. Write a plain commit message: a short imperative subject, and a body only if
   the change needs one.

## Style

- TypeScript, ES modules, existing formatting. Match the file you are editing.
- Prefer clarity over cleverness. The tools run inside someone else's agent, so
  predictable behavior and clear error messages matter more than terseness.
- Tool descriptions are read by a model on every turn. Keep them short and
  concrete.

## Reporting a security issue

If you find a vulnerability, please open a minimal issue asking for a private
channel rather than posting details publicly, and we will follow up.
