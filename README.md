# @hive/mcp

MCP server for discovering and installing Hive agent tools.

## Install

```bash
npm install -g @hive/mcp
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

- `discover(intent)` — find tools by describing what you want to build
- `install(slug)` — install a tool by its Hive catalog slug
- `list()` — see what's currently installed
