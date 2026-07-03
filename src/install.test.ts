import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { executeInstall, executeUninstall } from './install.js';
import type { InstallSpec } from './parse.js';
import type { LockEntry } from './lockfile.js';

vi.mock('node:child_process');
vi.mock('./config-patch.js');
vi.mock('./state.js');
vi.mock('./lockfile.js');
vi.mock('./claude-md-patch.js');

import { patchMcpConfig, unpatchMcpConfig, resolveConfigPath } from './config-patch.js';
import { addRef, removeRef } from './state.js';
import { upsertLock } from './lockfile.js';

const CWD = '/fake/project';
const CTX = { slug: 'mcp-supabase', source: 'https://hive-tooling.vercel.app/tools/mcp-supabase' };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(childProcess.execSync).mockReturnValue(Buffer.from(''));
  vi.mocked(patchMcpConfig).mockReturnValue(undefined);
  vi.mocked(unpatchMcpConfig).mockReturnValue(undefined);
  vi.mocked(resolveConfigPath).mockReturnValue('/fake/project/.claude/settings.json');
  vi.mocked(addRef).mockReturnValue(undefined);
  vi.mocked(removeRef).mockReturnValue(0);
  vi.mocked(upsertLock).mockReturnValue(undefined);
});

const cliSpec: InstallSpec = {
  name: 'claude-code', types: ['cli'], version: '2.2.0',
  npmPackage: '@anthropic-ai/claude-code', brewFormula: null, mcpServers: null,
};
const mcpSpec: InstallSpec = {
  name: 'Supabase MCP', types: ['mcp'], version: '0.3.0',
  npmPackage: null, brewFormula: null,
  mcpServers: { supabase: { command: 'npx', args: ['-y', 'supabase-mcp'] } },
};
const unknownSpec: InstallSpec = {
  name: 'goose', types: ['subagent'], version: '1.0.0',
  npmPackage: null, brewFormula: null, mcpServers: null,
};

describe('executeInstall: installer dispatch', () => {
  it('runs npm install -g for CLI tools with npm package', async () => {
    const result = await executeInstall(cliSpec, CWD, { slug: 'claude-code', source: 's' });
    expect(childProcess.execSync).toHaveBeenCalledWith(
      'npm install -g @anthropic-ai/claude-code',
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(result.status).toBe('installed');
    expect(result.command).toBe('npm install -g @anthropic-ai/claude-code');
  });

  it('calls patchMcpConfig for MCP tools', async () => {
    const result = await executeInstall(mcpSpec, CWD, CTX);
    expect(patchMcpConfig).toHaveBeenCalled();
    expect(result.status).toBe('installed');
  });

  it('returns unsupported status for tool types with no install method', async () => {
    const result = await executeInstall(unknownSpec, CWD, { slug: 'goose', source: 's' });
    expect(result.status).toBe('unsupported');
    expect(childProcess.execSync).not.toHaveBeenCalled();
  });

  it('returns error status when exec throws', async () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('permission denied'); });
    const result = await executeInstall(cliSpec, CWD, { slug: 'claude-code', source: 's' });
    expect(result.status).toBe('error');
    expect(result.message).toContain('permission denied');
  });

  it('runs brew install for CLI tools with brew formula and no npm package', async () => {
    const brewSpec: InstallSpec = { name: 'gh', types: ['cli'], version: '2.93.0', npmPackage: null, brewFormula: 'gh', mcpServers: null };
    const result = await executeInstall(brewSpec, CWD, { slug: 'gh', source: 's' });
    expect(childProcess.execSync).toHaveBeenCalledWith('brew install gh', expect.objectContaining({ stdio: 'inherit' }));
    expect(result.status).toBe('installed');
    expect(result.command).toBe('brew install gh');
  });

  it('prefers npm over brew when both are available', async () => {
    const bothSpec: InstallSpec = { name: 'gh', types: ['cli'], version: '2.93.0', npmPackage: '@github/gh', brewFormula: 'gh', mcpServers: null };
    await executeInstall(bothSpec, CWD, { slug: 'gh', source: 's' });
    expect(childProcess.execSync).toHaveBeenCalledWith('npm install -g @github/gh', expect.objectContaining({ stdio: 'inherit' }));
  });

  it('returns error status when patchMcpConfig throws', async () => {
    vi.mocked(patchMcpConfig).mockImplementation(() => { throw new Error('write failed'); });
    const result = await executeInstall(mcpSpec, CWD, CTX);
    expect(result.status).toBe('error');
    expect(result.message).toContain('write failed');
  });
});

describe('executeInstall: lock + ledger', () => {
  it('writes a slug-keyed npm lock entry with global scope', async () => {
    await executeInstall(cliSpec, CWD, { slug: 'claude-code', source: 's' });
    expect(upsertLock).toHaveBeenCalledWith(CWD, 'claude-code', expect.objectContaining({
      name: 'claude-code', version: '2.2.0', method: 'npm', scope: 'global',
      artifact: { npmPackage: '@anthropic-ai/claude-code' },
    }));
  });

  it('refs the ledger by slug (not name) on npm install', async () => {
    await executeInstall(cliSpec, CWD, { slug: 'claude-code', source: 's' });
    expect(addRef).toHaveBeenCalledWith('claude-code', CWD, expect.objectContaining({
      scope: 'global', artifactKey: '@anthropic-ai/claude-code',
    }));
  });

  it('writes an mcp lock entry with project scope and relative configPath', async () => {
    await executeInstall(mcpSpec, CWD, CTX);
    expect(upsertLock).toHaveBeenCalledWith(CWD, 'mcp-supabase', expect.objectContaining({
      method: 'mcp', scope: 'project',
      artifact: { mcpServers: ['supabase'], configPath: '.claude/settings.json' },
    }));
  });

  it('writes a brew lock entry', async () => {
    const brewSpec: InstallSpec = { name: 'gh', types: ['cli'], version: '2.93.0', npmPackage: null, brewFormula: 'gh', mcpServers: null };
    await executeInstall(brewSpec, CWD, { slug: 'gh', source: 's' });
    expect(upsertLock).toHaveBeenCalledWith(CWD, 'gh', expect.objectContaining({
      method: 'brew', scope: 'global', artifact: { brewFormula: 'gh' },
    }));
  });

  it('writes a skill lock entry keyed by skillName', async () => {
    const skillSpec: InstallSpec = { name: 'pdf', types: ['skill'], version: '1.0.0', npmPackage: null, brewFormula: null, mcpServers: null };
    const r = await executeInstall(skillSpec, CWD, { slug: 'pdf', source: 's' });
    expect(childProcess.execSync).toHaveBeenCalledWith('npx skills add pdf', expect.objectContaining({ stdio: 'inherit' }));
    expect(upsertLock).toHaveBeenCalledWith(CWD, 'pdf', expect.objectContaining({
      method: 'skill', scope: 'global', artifact: { skillName: 'pdf' },
    }));
    expect(r.status).toBe('installed');
  });

  it('does not write a lock entry when install fails', async () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('boom'); });
    const r = await executeInstall(cliSpec, CWD, { slug: 'claude-code', source: 's' });
    expect(r.status).toBe('error');
    expect(upsertLock).not.toHaveBeenCalled();
    expect(addRef).not.toHaveBeenCalled();
  });
});

describe('executeUninstall', () => {
  const npmEntry: LockEntry = {
    name: 'claude-code', version: '2.2.0', types: ['cli'], source: 's', installedAt: 'x',
    method: 'npm', scope: 'global', artifact: { npmPackage: '@anthropic-ai/claude-code' }, integrity: null,
  };
  const mcpEntry: LockEntry = {
    name: 'Supabase MCP', version: '0.3.0', types: ['mcp'], source: 's', installedAt: 'x',
    method: 'mcp', scope: 'project', artifact: { mcpServers: ['supabase'], configPath: '.claude/settings.json' }, integrity: null,
  };

  it('runs npm uninstall -g only when refcount hits 0', async () => {
    vi.mocked(removeRef).mockReturnValue(0);
    const r = await executeUninstall('claude-code', npmEntry, CWD);
    expect(removeRef).toHaveBeenCalledWith('claude-code', CWD);
    expect(childProcess.execSync).toHaveBeenCalledWith('npm uninstall -g @anthropic-ai/claude-code', expect.objectContaining({ stdio: 'inherit' }));
    expect(r.status).toBe('uninstalled');
  });

  it('keeps the global artifact when another project still references it', async () => {
    vi.mocked(removeRef).mockReturnValue(1);
    const r = await executeUninstall('claude-code', npmEntry, CWD);
    expect(childProcess.execSync).not.toHaveBeenCalled();
    expect(r.status).toBe('uninstalled');
    expect(r.message).toMatch(/still referenced/i);
  });

  it('unpatches only the recorded mcp servers from the resolved config', async () => {
    const r = await executeUninstall('mcp-supabase', mcpEntry, CWD);
    expect(unpatchMcpConfig).toHaveBeenCalledWith('/fake/project/.claude/settings.json', ['supabase']);
    expect(r.status).toBe('uninstalled');
  });

  it('is idempotent: a missing npm package resolves to success', async () => {
    vi.mocked(removeRef).mockReturnValue(0);
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('not installed'); });
    const r = await executeUninstall('claude-code', npmEntry, CWD);
    expect(r.status).toBe('uninstalled');
    expect(r.message).toMatch(/already gone|not installed|idempotent|success/i);
  });
});
