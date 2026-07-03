import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { patchMcpConfig, unpatchMcpConfig, resolveConfigPath } from './config-patch.js';
import { addRef, removeRef } from './state.js';
import { upsertLock, type LockEntry, type InstallMethod, type Scope, type LockArtifact } from './lockfile.js';
import { patchClaudeMd } from './claude-md-patch.js';
import type { InstallSpec } from './parse.js';

export interface InstallContext {
  slug: string;
  source: string;
}

export interface InstallResult {
  status: 'installed' | 'unsupported' | 'error';
  command?: string;
  message?: string;
}

export interface UninstallResult {
  status: 'uninstalled' | 'error';
  command?: string;
  message?: string;
}

interface ResolvedInstall {
  method: InstallMethod;
  scope: Scope;
  artifact: LockArtifact;
  artifactKey?: string;
  command?: string;
  run: () => void;
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Resolve the install method and command for a catalog entry. */
function resolveInstall(spec: InstallSpec, cwd: string): ResolvedInstall | { unsupported: string } {
  const types = spec.types;

  if ((types.includes('cli') || types.includes('subagent') || types.includes('plugin')) && spec.npmPackage) {
    const command = `npm install -g ${spec.npmPackage}`;
    return {
      method: 'npm', scope: 'global',
      artifact: { npmPackage: spec.npmPackage }, artifactKey: spec.npmPackage,
      command, run: () => { console.log(`[hive] Running: ${command}`); execSync(command, { stdio: 'inherit' }); },
    };
  }

  if (types.includes('cli') && spec.brewFormula && !spec.npmPackage) {
    const command = `brew install ${spec.brewFormula}`;
    return {
      method: 'brew', scope: 'global',
      artifact: { brewFormula: spec.brewFormula }, artifactKey: spec.brewFormula,
      command, run: () => { console.log(`[hive] Running: ${command}`); execSync(command, { stdio: 'inherit' }); },
    };
  }

  if (types.includes('mcp') || types.includes('server')) {
    if (!spec.mcpServers) return { unsupported: 'No mcpServers config found in install.md' };
    const absConfig = resolveConfigPath(cwd);
    const names = Object.keys(spec.mcpServers);
    const inProject = isInside(cwd, absConfig);
    const configPath = inProject ? path.relative(cwd, absConfig) : absConfig;
    const servers = spec.mcpServers;
    return {
      method: 'mcp', scope: inProject ? 'project' : 'global',
      artifact: { mcpServers: names, configPath },
      artifactKey: names.join(','),
      run: () => {
        console.log(`[hive] Patching MCP config: ${absConfig}`);
        for (const n of names) console.log(`[hive] Adding server: ${n}`);
        patchMcpConfig(absConfig, servers);
      },
    };
  }

  if (types.includes('skill')) {
    const command = `npx skills add ${spec.name}`;
    return {
      method: 'skill', scope: 'global',
      artifact: { skillName: spec.name }, artifactKey: spec.name,
      command, run: () => { console.log(`[hive] Running: ${command}`); execSync(command, { stdio: 'inherit' }); },
    };
  }

  return { unsupported: `No install method for types: ${types.join(', ')}` };
}

export async function executeInstall(spec: InstallSpec, cwd: string, ctx: InstallContext): Promise<InstallResult> {
  const resolved = resolveInstall(spec, cwd);
  if ('unsupported' in resolved) {
    return { status: 'unsupported', message: resolved.unsupported };
  }

  try {
    resolved.run();
  } catch (err) {
    return { status: 'error', command: resolved.command, message: (err as Error).message };
  }

  // Record provenance after the installer succeeds so the install can be reversed.
  const entry: LockEntry = {
    name: spec.name,
    version: spec.version,
    types: spec.types,
    source: ctx.source,
    installedAt: new Date().toISOString(),
    method: resolved.method,
    scope: resolved.scope,
    artifact: resolved.artifact,
    integrity: null,
  };
  upsertLock(cwd, ctx.slug, entry);
  addRef(ctx.slug, cwd, {
    version: spec.version, type: spec.types, scope: resolved.scope, artifactKey: resolved.artifactKey,
  });
  patchClaudeMd(cwd);

  return {
    status: 'installed',
    command: resolved.command,
    message: resolved.method === 'mcp' ? `Added to ${resolved.artifact.configPath}` : undefined,
  };
}

function uninstallCommand(entry: LockEntry): string | null {
  switch (entry.method) {
    case 'npm': return entry.artifact.npmPackage ? `npm uninstall -g ${entry.artifact.npmPackage}` : null;
    case 'brew': return entry.artifact.brewFormula ? `brew uninstall ${entry.artifact.brewFormula}` : null;
    case 'skill': return entry.artifact.skillName ? `npx skills remove ${entry.artifact.skillName}` : null;
    default: return null;
  }
}

/** Reverse a lock entry. Global installs are removed only after the last project ref is gone. */
export async function executeUninstall(slug: string, entry: LockEntry, cwd: string): Promise<UninstallResult> {
  if (entry.method === 'mcp') {
    const configRel = entry.artifact.configPath ?? '';
    const abs = path.isAbsolute(configRel) ? configRel : path.join(cwd, configRel);
    try {
      unpatchMcpConfig(abs, entry.artifact.mcpServers ?? []);
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
    removeRef(slug, cwd);
    return { status: 'uninstalled', message: `Removed servers [${(entry.artifact.mcpServers ?? []).join(', ')}] from ${configRel}` };
  }

  // Drop this project's ref; remove the global artifact only at refcount 0.
  const remaining = removeRef(slug, cwd);
  if (remaining > 0) {
    return { status: 'uninstalled', message: `Dropped project reference; artifact still referenced by ${remaining} other project(s), left installed.` };
  }

  const command = uninstallCommand(entry);
  if (!command) {
    return { status: 'uninstalled', message: 'Nothing to reverse for this method.' };
  }
  try {
    console.log(`[hive] Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
    return { status: 'uninstalled', command };
  } catch (err) {
    // Idempotent: an artifact already gone is success, not an error.
    return { status: 'uninstalled', command, message: `Artifact already gone or not removable (${(err as Error).message}); treated as success.` };
  }
}
