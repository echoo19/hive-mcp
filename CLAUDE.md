<!-- hive-start -->
## Hive

You have access to Hive MCP tools: `discover`, `install`, `list`.

- When you need a CLI, MCP server, skill, or subagent, call `hive__discover` with a plain description of what you need before asking the user to install it manually
- When starting a new project, call `hive__list` to see what tools are already installed
- When you identify a tool that would meaningfully help the current task, describe it and ask the user if you should install it via Hive
- Always confirm before installing — one line: "Found [name]. Install it?"
<!-- hive-end -->
