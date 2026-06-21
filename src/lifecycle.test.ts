import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { uninstall, update, sync, audit, type LifecycleDeps } from './lifecycle.js';
import { upsertLock, getLock, type LockEntry } from './lockfile.js';
import { patchMcpConfig } from './config-patch.js';
import { addRef } from './state.js';

// Mock only os.homedir (keep tmpdir real) so the ~/.hive ledger lands in a temp dir.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(() => actual.homedir()) };
});

let dir: string;
let home: string;
beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-lc-'));
  dir = path.join(root, 'proj'); fs.mkdirSync(dir, { recursive: true });
  home = path.join(root, 'home'); fs.mkdirSync(home, { recursive: true });
  vi.mocked(os.homedir).mockReturnValue(home);
});
afterEach(() => { vi.clearAllMocks(); });

function mcpEntry(over: Partial<LockEntry> = {}): LockEntry {
  return {
    name: 'Supabase MCP', version: '0.3.0', types: ['mcp'], source: 's', installedAt: 'x',
    method: 'mcp', scope: 'project', artifact: { mcpServers: ['supabase'], configPath: '.claude/settings.json' },
    integrity: null, ...over,
  };
}
function npmEntry(over: Partial<LockEntry> = {}): LockEntry {
  return {
    name: 'aider', version: '1.0.0', types: ['cli'], source: 's', installedAt: 'x',
    method: 'npm', scope: 'global', artifact: { npmPackage: 'aider-chat' }, integrity: null, ...over,
  };
}

// Default deps: stub network + install/uninstall side effects; real lockfile/config/state on temp dirs.
function makeDeps(over: Partial<LifecycleDeps> = {}): LifecycleDeps {
  return {
    fetchInstallMd: vi.fn(async () => '# x\nversion: 9.9.9'),
    parseInstallMd: vi.fn(() => ({ name: 'x', types: ['mcp'], version: '9.9.9', npmPackage: null, brewFormula: null, mcpServers: { supabase: { command: 'npx' } } })),
    executeInstall: vi.fn(async () => ({ status: 'installed' as const })),
    executeUninstall: vi.fn(async () => ({ status: 'uninstalled' as const })),
    ...over,
  };
}

describe('uninstall', () => {
  it('reverses the entry and removes it from the lock', async () => {
    upsertLock(dir, 'mcp-supabase', mcpEntry());
    const deps = makeDeps();
    const r = await uninstall('mcp-supabase', dir, deps);
    expect(deps.executeUninstall).toHaveBeenCalledWith('mcp-supabase', expect.objectContaining({ method: 'mcp' }), dir);
    expect(getLock(dir, 'mcp-supabase')).toBeUndefined();
    expect(r.reversed).toBe(true);
  });
  it('reports a clear message when the slug is not in the lock', async () => {
    const r = await uninstall('ghost', dir, makeDeps());
    expect(r.reversed).toBe(false);
    expect(r.message).toMatch(/not.*lock/i);
  });
});

describe('sync', () => {
  it('installs an mcp tool whose servers are missing from config', async () => {
    upsertLock(dir, 'mcp-supabase', mcpEntry());
    const deps = makeDeps();
    const r = await sync(dir, deps);
    expect(deps.executeInstall).toHaveBeenCalledTimes(1);
    expect(r.installed).toContain('mcp-supabase');
  });
  it('skips an mcp tool whose servers are already present', async () => {
    upsertLock(dir, 'mcp-supabase', mcpEntry());
    const cfg = path.join(dir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    patchMcpConfig(cfg, { supabase: { command: 'npx' } });
    const deps = makeDeps();
    const r = await sync(dir, deps);
    expect(deps.executeInstall).not.toHaveBeenCalled();
    expect(r.alreadyPresent).toContain('mcp-supabase');
  });
});

describe('audit', () => {
  it('flags a lock tool whose mcp servers are missing as "missing"', async () => {
    upsertLock(dir, 'mcp-supabase', mcpEntry());
    const r = await audit(dir, makeDeps());
    expect(r.missing).toContain('mcp-supabase');
  });
  it('flags a stale version when catalog version differs', async () => {
    upsertLock(dir, 'mcp-supabase', mcpEntry({ version: '0.3.0' }));
    const cfg = path.join(dir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    patchMcpConfig(cfg, { supabase: { command: 'npx' } });
    const deps = makeDeps({ parseInstallMd: vi.fn(() => ({ name: 'x', types: ['mcp'], version: '9.9.9', npmPackage: null, brewFormula: null, mcpServers: null })) });
    const r = await audit(dir, deps);
    expect(r.stale.find((s) => s.slug === 'mcp-supabase')?.catalogVersion).toBe('9.9.9');
  });
  it('flags a ledger artifact not in the lock as "untracked"', async () => {
    addRef('ghost-cli', dir, { version: '1.0.0', type: ['cli'], scope: 'global', artifactKey: 'ghost' });
    const r = await audit(dir, makeDeps());
    expect(r.untracked).toContain('ghost-cli');
  });
});

describe('update', () => {
  it('reinstalls and bumps the version for one slug', async () => {
    upsertLock(dir, 'mcp-supabase', mcpEntry({ version: '0.3.0' }));
    const deps = makeDeps();
    const r = await update('mcp-supabase', dir, deps);
    expect(deps.executeInstall).toHaveBeenCalledTimes(1);
    expect(r.updated[0]).toMatchObject({ slug: 'mcp-supabase', from: '0.3.0', to: '9.9.9' });
  });
  it('with no slug updates every tool in the lock', async () => {
    upsertLock(dir, 'mcp-supabase', mcpEntry());
    upsertLock(dir, 'aider', npmEntry());
    const deps = makeDeps();
    const r = await update(undefined, dir, deps);
    expect(deps.executeInstall).toHaveBeenCalledTimes(2);
    expect(r.updated.map((u) => u.slug).sort()).toEqual(['aider', 'mcp-supabase']);
  });
});
