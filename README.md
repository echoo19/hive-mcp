# @echoo19/hive-mcp

MCP server for finding, installing, updating, and auditing tools from the Hive catalog.

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

- `discover(intent)`: find matching catalog tools
- `install(slug)`: install a tool and record it in `hive.lock`
- `uninstall(slug)`: reverse a recorded install
- `update(slug)`: reinstall a tool at the current catalog version
- `sync()`: install missing tools from `hive.lock`
- `audit()`: report lockfile drift and MCP context cost
- `list()`: show tools recorded in `hive.lock`
