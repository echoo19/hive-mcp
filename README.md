<p align="center">
  <img src="https://raw.githubusercontent.com/echoo19/hive-mcp/main/.github/banner.svg" alt="hive" width="640">
</p>

<p align="center"><b>The context-aware package manager for agent capabilities.</b></p>

<p align="center">
  <a href="https://hive-tooling.vercel.app">Website</a> ·
  <a href="https://hive-tooling.vercel.app/catalog">Catalog</a> ·
  <a href="https://hive-tooling.vercel.app/audit">Audit</a> ·
  <a href="#quickstart">Quickstart</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@echoo19/hive-mcp"><img src="https://img.shields.io/npm/v/@echoo19/hive-mcp?color=e7ba54&label=npm" alt="npm"></a>
  <img src="https://img.shields.io/node/v/@echoo19/hive-mcp?color=555" alt="node">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license MIT"></a>
</p>

---

Every skill, subagent, plugin, and MCP server you add to a coding agent spends context before it does any work. Tool schemas, system prompts, and always-on descriptions sit in the window whether or not you use them, and it is easy to lose a third of your budget to tools you forgot you installed.

**hive** is an MCP server that treats agent tools like packages with a cost. It finds tools for a task from the [Hive catalog](https://hive-tooling.vercel.app), plans a stack that fits a context budget, installs and records them in a `hive.lock`, and audits the always-on context an existing setup is spending. It runs inside any MCP client, so the agent that uses the tools is the one that manages them.

```
┌────────── hive · one MCP server ───────────┐
│ discover   find tools for a task           │
│ plan       fit a stack to a context budget │
│ install    write it into hive.lock         │
│ audit      price the context you carry     │
│ optimize   apply the swaps audit finds     │
└────────────────────────────────────────────┘
   reads the Hive catalog  ·  writes your hive.lock
```

Nothing runs a model inside hive. It reads a public catalog, writes a lockfile in your project, and reports token costs computed from the same model the [catalog](https://hive-tooling.vercel.app/catalog) uses.

## Install

```bash
npm install -g @echoo19/hive-mcp
```

## Configure

Add hive to your agent's MCP config:

```json
{
  "mcpServers": {
    "hive": { "command": "hive-mcp" }
  }
}
```

That is the whole setup. No API key, no account, no cloud.

## Quickstart

Ask your agent to build something, and let it drive hive:

```
You:    I want to ship a Next.js app on Vercel with a Supabase database.
Agent:  → plan("Next.js on Vercel with Supabase", budget: "balanced")
        Suggested stack (~1.2k always-on tokens):
          gh            source control        cli    0 tok
          mcp-supabase  database              mcp    ~760 tok
          vercel        deployment            cli    0 tok
        → install("mcp-supabase")
        Recorded in hive.lock.
```

Later, check what your setup is costing:

```
You:    How much context are my tools using?
Agent:  → audit()
        Always-on: ~4.3k tokens across 6 tools.
        Lighter swaps: replace mcp-playwright (~1.6k) with the playwright CLI (0 tok).
        → optimize()
        ↓ swapped mcp-playwright → playwright-cli (saved ~1.6k tok)
        Always-on: ~4.3k tok → ~2.7k tok.
```

## Tools

| Tool | Signature | What it does |
| --- | --- | --- |
| `discover` | `discover(intent)` | Find catalog tools that match what you want to build. |
| `plan` | `plan(brief, budget?)` | Suggest a small stack for a project, ranked by fit and context cost. `budget` is `lean`, `balanced`, or `capable`. |
| `install` | `install(slug)` | Install a tool and record it in `hive.lock`. |
| `uninstall` | `uninstall(slug)` | Reverse a recorded install. |
| `update` | `update(slug?)` | Reinstall a tool at the catalog's current version; omit `slug` to update all. |
| `sync` | `sync()` | Install everything listed in `hive.lock` that is missing. |
| `audit` | `audit()` | Report lockfile drift and the always-on context cost of your MCP setup, with lighter swaps. |
| `optimize` | `optimize()` | Apply the lighter swaps `audit()` finds: install the lighter tool, remove the heavier one, and update `hive.lock`. Reports before/after context cost. |
| `list` | `list()` | Show the tools recorded in `hive.lock` and their total context cost. |

## Why context cost

A tool's real price is the context it occupies on every turn, not its download size. hive scores that always-on cost per tool type: CLIs cost nothing until called, skills and subagents cost their description, MCP servers cost roughly the size of the schemas they expose, and plugins carry a fixed load. `plan`, `audit`, and `list` all read from that one model, so the number an agent sees in the client matches the number on the [website](https://hive-tooling.vercel.app/audit).

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest
npm run dev        # tsc --watch
```

The server talks to the live Hive API (`/api/match`, `/api/plan`, `/api/audit-index.json`) and installs from `/tools/<slug>/install.md`. Requires Node 18 or newer.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how the project is laid out and what a good change looks like. To add a tool to the catalog itself, submit it through the [website](https://hive-tooling.vercel.app) rather than this repo.

## License

[MIT](./LICENSE) © Jake Kang
