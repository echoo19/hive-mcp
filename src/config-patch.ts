import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { McpServerDef } from './parse.js';

export function resolveConfigPath(cwd: string): string {
  const candidates = [
    path.join(cwd, 'mcp.json'),
    path.join(cwd, '.claude', 'settings.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(os.homedir(), '.claude', 'settings.json');
}

export function patchMcpConfig(
  configPath: string,
  servers: Record<string, McpServerDef>
): void {
  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  }

  const existing = (config.mcpServers ?? {}) as Record<string, McpServerDef>;
  const merged: Record<string, McpServerDef> = { ...existing };

  for (const [name, def] of Object.entries(servers)) {
    if (!(name in merged)) {
      merged[name] = def;
    }
  }

  config.mcpServers = merged;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
