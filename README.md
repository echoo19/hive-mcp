# @echoo19/hive-mcp

MCP server for discovering and installing Hive agent tools.

## Install

```bash
npm install -g @echoo19/hive-mcp
```

## Configure

Add to your agent's MCP config:

```json
{
  "mcpServers": {
    "hive": { "command": "hive-mcp" }
  }
}
```

## Tools

- `discover(intent)` — find tools by describing what you want to build, ranked by fit and always-on context cost
- `install(slug)` — install a tool by its Hive catalog slug, recorded in hive.lock
- `uninstall(slug)` — reverse an install recorded in hive.lock
- `update(slug)` — reinstall a tool at the catalog's current version
- `sync()` — install everything in hive.lock that is not present
- `audit()` — report drift (missing / untracked / stale) plus the always-on context cost of the project's MCP setup, with lighter swaps from the catalog
- `list()` — tools in hive.lock plus the setup's total always-on context cost
