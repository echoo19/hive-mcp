import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { patchMcpConfig, resolveConfigPath, unpatchMcpConfig, configServerNames } from './config-patch.js';
import type { McpServerDef } from './parse.js';

vi.mock('node:fs');
vi.mock('node:os');

const FAKE_HOME = '/fake/home';
const FAKE_CWD = '/fake/project';

beforeEach(() => {
  vi.mocked(os.homedir).mockReturnValue(FAKE_HOME);
  vi.restoreAllMocks();
  vi.mocked(os.homedir).mockReturnValue(FAKE_HOME);
});

describe('resolveConfigPath', () => {
  it('returns project mcp.json when it exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      p === path.join(FAKE_CWD, 'mcp.json')
    );
    expect(resolveConfigPath(FAKE_CWD)).toBe(path.join(FAKE_CWD, 'mcp.json'));
  });

  it('returns project .claude/settings.json when it exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      p === path.join(FAKE_CWD, '.claude', 'settings.json')
    );
    expect(resolveConfigPath(FAKE_CWD)).toBe(path.join(FAKE_CWD, '.claude', 'settings.json'));
  });

  it('falls back to ~/.claude/settings.json', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(resolveConfigPath(FAKE_CWD)).toBe(path.join(FAKE_HOME, '.claude', 'settings.json'));
  });
});

describe('patchMcpConfig', () => {
  const configPath = path.join(FAKE_HOME, '.claude', 'settings.json');
  const servers: Record<string, McpServerDef> = {
    supabase: { command: 'npx', args: ['-y', 'supabase-mcp'] },
  };

  it('creates new config file with mcpServers when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    const written: string[] = [];
    vi.mocked(fs.writeFileSync).mockImplementation((_, d) => written.push(d as string));

    patchMcpConfig(configPath, servers);

    const saved = JSON.parse(written[0]);
    expect(saved.mcpServers.supabase.command).toBe('npx');
  });

  it('merges into existing config without overwriting other keys', () => {
    const existing = { theme: 'dark', mcpServers: { existing: { command: 'existing-cmd' } } };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    const written: string[] = [];
    vi.mocked(fs.writeFileSync).mockImplementation((_, d) => written.push(d as string));

    patchMcpConfig(configPath, servers);

    const saved = JSON.parse(written[0]);
    expect(saved.theme).toBe('dark');
    expect(saved.mcpServers.existing.command).toBe('existing-cmd');
    expect(saved.mcpServers.supabase.command).toBe('npx');
  });

  it('does not overwrite an already-present server entry', () => {
    const existing = { mcpServers: { supabase: { command: 'already-here' } } };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    const written: string[] = [];
    vi.mocked(fs.writeFileSync).mockImplementation((_, d) => written.push(d as string));

    patchMcpConfig(configPath, servers);

    const saved = JSON.parse(written[0]);
    expect(saved.mcpServers.supabase.command).toBe('already-here');
  });
});

describe('unpatchMcpConfig', () => {
  const configPath = path.join(FAKE_HOME, '.claude', 'settings.json');

  it('removes only the named servers and leaves foreign keys', () => {
    const existing = { theme: 'dark', mcpServers: { supabase: { command: 'npx' }, other: { command: 'keep' } } };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    const written: string[] = [];
    vi.mocked(fs.writeFileSync).mockImplementation((_p, d) => written.push(d as string));

    unpatchMcpConfig(configPath, ['supabase']);

    const saved = JSON.parse(written[0]);
    expect(saved.theme).toBe('dark');
    expect(saved.mcpServers.other.command).toBe('keep');
    expect(saved.mcpServers.supabase).toBeUndefined();
  });

  it('is a no-op (no write) when the file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const written: string[] = [];
    vi.mocked(fs.writeFileSync).mockImplementation((_p, d) => written.push(d as string));
    unpatchMcpConfig(configPath, ['supabase']);
    expect(written).toHaveLength(0);
  });

  it('is a no-op when there is no mcpServers block', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ theme: 'dark' }));
    const written: string[] = [];
    vi.mocked(fs.writeFileSync).mockImplementation((_p, d) => written.push(d as string));
    unpatchMcpConfig(configPath, ['supabase']);
    expect(written).toHaveLength(0);
  });

  it('does not touch the file when none of the named servers are present', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ mcpServers: { other: { command: 'keep' } } }));
    const written: string[] = [];
    vi.mocked(fs.writeFileSync).mockImplementation((_p, d) => written.push(d as string));
    unpatchMcpConfig(configPath, ['supabase']);
    expect(written).toHaveLength(0);
  });
});

describe('configServerNames', () => {
  const configPath = path.join(FAKE_HOME, '.claude', 'settings.json');

  it('returns the mcpServers keys present in a config file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ mcpServers: { a: {}, b: {} } }));
    expect(configServerNames(configPath).sort()).toEqual(['a', 'b']);
  });
  it('returns [] when file or block is absent', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(configServerNames(configPath)).toEqual([]);
  });
});
