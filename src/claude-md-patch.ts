import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MARKER_START = '<!-- hive-start -->';
const MARKER_END = '<!-- hive-end -->';

const HIVE_SECTION = `${MARKER_START}
## Hive

You have access to Hive MCP tools: \`discover\`, \`install\`, \`list\`.

- When you need a CLI, MCP server, skill, or subagent, call \`hive__discover\` with a plain description of what you need before asking the user to install it manually
- When starting a new project, call \`hive__list\` to see what tools are already installed
- When you identify a tool that would meaningfully help the current task, describe it and ask the user if you should install it via Hive
- Always confirm before installing with one line: "Found [name]. Install it?"

**Guardrails for suggesting Hive installs:**
- Only suggest a tool when there is a specific, immediate blocker, not because it might be useful someday
- Suggest at most one tool per task; do not queue up multiple installs
- Before suggesting, verify the tool is compatible with the current platform and project stack
- Do not suggest a tool if the task can be done with built-in shell commands, existing project dependencies, or already-installed Hive tools
- Do not re-suggest a tool the user has already declined in this session
${MARKER_END}`;

export function patchClaudeMd(cwd: string): void {
  const filePath = join(cwd, 'CLAUDE.md');
  mkdirSync(cwd, { recursive: true });

  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf-8');
    if (existing.includes(MARKER_START)) return;
    const separator = existing.trimEnd().length > 0 ? '\n\n' : '';
    writeFileSync(filePath, existing.trimEnd() + separator + HIVE_SECTION + '\n', 'utf-8');
  } else {
    writeFileSync(filePath, HIVE_SECTION + '\n', 'utf-8');
  }
}
