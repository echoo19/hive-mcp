import { execSync } from 'node:child_process';
import { patchMcpConfig, resolveConfigPath } from './config-patch.js';
import { recordInstall } from './state.js';
import type { InstallSpec } from './parse.js';

export interface InstallResult {
  status: 'installed' | 'unsupported' | 'error';
  command?: string;
  message?: string;
}

export async function executeInstall(spec: InstallSpec, cwd: string): Promise<InstallResult> {
  const types = spec.types;

  // CLI: npm install -g
  if ((types.includes('cli') || types.includes('subagent') || types.includes('plugin')) && spec.npmPackage) {
    const cmd = `npm install -g ${spec.npmPackage}`;
    console.log(`[hive] Running: ${cmd}`);
    try {
      execSync(cmd, { stdio: 'inherit' });
      recordInstall(spec.name, spec.version, spec.types);
      return { status: 'installed', command: cmd };
    } catch (err) {
      return { status: 'error', command: cmd, message: (err as Error).message };
    }
  }

  // MCP: patch config file
  if (types.includes('mcp') || types.includes('server')) {
    if (!spec.mcpServers) {
      return { status: 'unsupported', message: 'No mcpServers config found in install.md' };
    }
    const configPath = resolveConfigPath(cwd);
    console.log(`[hive] Patching MCP config: ${configPath}`);
    for (const name of Object.keys(spec.mcpServers)) {
      console.log(`[hive] Adding server: ${name}`);
    }
    try {
      patchMcpConfig(configPath, spec.mcpServers);
      recordInstall(spec.name, spec.version, spec.types);
      return { status: 'installed', message: `Added to ${configPath}` };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  // Skill: npx skills add
  if (types.includes('skill') || types.includes('plugin')) {
    const cmd = `npx skills add ${spec.name}`;
    console.log(`[hive] Running: ${cmd}`);
    try {
      execSync(cmd, { stdio: 'inherit' });
      recordInstall(spec.name, spec.version, spec.types);
      return { status: 'installed', command: cmd };
    } catch (err) {
      return { status: 'error', command: cmd, message: (err as Error).message };
    }
  }

  return { status: 'unsupported', message: `No install method for types: ${types.join(', ')}` };
}
