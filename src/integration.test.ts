import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';

vi.mock('node:child_process');
// Mock only os.homedir (keep tmpdir real) so the ~/.hive ledger lands in a temp dir.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(() => actual.homedir()) };
});

import { executeInstall, executeUninstall } from './install.js';
import { getLock } from './lockfile.js';
import { refCount } from './state.js';
import type { InstallSpec } from './parse.js';

let home: string;
let projA: string;
let projB: string;

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-int-'));
  home = path.join(root, 'home'); fs.mkdirSync(home, { recursive: true });
  projA = path.join(root, 'projA'); fs.mkdirSync(projA, { recursive: true });
  projB = path.join(root, 'projB'); fs.mkdirSync(projB, { recursive: true });
  // make each project resolve MCP config to its own .claude/settings.json
  for (const p of [projA, projB]) {
    fs.mkdirSync(path.join(p, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(p, '.claude', 'settings.json'), '{}');
  }
  vi.mocked(os.homedir).mockReturnValue(home);
  vi.mocked(childProcess.execSync).mockReturnValue(Buffer.from(''));
});
afterEach(() => { vi.clearAllMocks(); });

const npmSpec: InstallSpec = { name: 'aider', types: ['cli'], version: '1.0.0', npmPackage: 'aider-chat', brewFormula: null, mcpServers: null };
const mcpSpec: InstallSpec = {
  name: 'Supabase MCP', types: ['mcp'], version: '0.3.0', npmPackage: null, brewFormula: null,
  mcpServers: { supabase: { command: 'npx', args: ['-y', 'supabase-mcp'] } },
};

describe('mcp round-trip', () => {
  it('install writes lock + patches config; uninstall reverses both', async () => {
    const ctx = { slug: 'mcp-supabase', source: 's' };
    const r = await executeInstall(mcpSpec, projA, ctx);
    expect(r.status).toBe('installed');

    const entry = getLock(projA, 'mcp-supabase')!;
    expect(entry.method).toBe('mcp');
    expect(entry.scope).toBe('project');
    expect(entry.artifact.mcpServers).toEqual(['supabase']);

    const cfg = JSON.parse(fs.readFileSync(path.join(projA, '.claude', 'settings.json'), 'utf-8'));
    expect(cfg.mcpServers.supabase.command).toBe('npx');

    const u = await executeUninstall('mcp-supabase', entry, projA);
    expect(u.status).toBe('uninstalled');
    const cfgAfter = JSON.parse(fs.readFileSync(path.join(projA, '.claude', 'settings.json'), 'utf-8'));
    expect(cfgAfter.mcpServers.supabase).toBeUndefined();
  });
});

describe('npm round-trip', () => {
  it('install runs npm + writes lock; uninstall runs npm uninstall at refcount 0', async () => {
    const r = await executeInstall(npmSpec, projA, { slug: 'aider', source: 's' });
    expect(r.status).toBe('installed');
    expect(childProcess.execSync).toHaveBeenCalledWith('npm install -g aider-chat', expect.objectContaining({ stdio: 'inherit' }));
    expect(getLock(projA, 'aider')!.method).toBe('npm');

    const entry = getLock(projA, 'aider')!;
    const u = await executeUninstall('aider', entry, projA);
    expect(u.status).toBe('uninstalled');
    expect(childProcess.execSync).toHaveBeenCalledWith('npm uninstall -g aider-chat', expect.objectContaining({ stdio: 'inherit' }));
  });
});

describe('refcount across two projects', () => {
  it('keeps the global artifact until the last project uninstalls it', async () => {
    await executeInstall(npmSpec, projA, { slug: 'aider', source: 's' });
    await executeInstall(npmSpec, projB, { slug: 'aider', source: 's' });
    expect(refCount('aider')).toBe(2);

    vi.mocked(childProcess.execSync).mockClear();
    const u1 = await executeUninstall('aider', getLock(projA, 'aider')!, projA);
    expect(u1.status).toBe('uninstalled');
    expect(u1.message).toMatch(/still referenced/i);
    expect(childProcess.execSync).not.toHaveBeenCalledWith('npm uninstall -g aider-chat', expect.anything());
    expect(refCount('aider')).toBe(1);

    const u2 = await executeUninstall('aider', getLock(projB, 'aider')!, projB);
    expect(u2.status).toBe('uninstalled');
    expect(childProcess.execSync).toHaveBeenCalledWith('npm uninstall -g aider-chat', expect.objectContaining({ stdio: 'inherit' }));
    expect(refCount('aider')).toBe(0);
  });
});
