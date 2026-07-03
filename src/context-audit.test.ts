import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  scanMcpConfigs, matchServer, contextReport, formatContextReport,
  type ContextDeps,
} from './context-audit.js';
import { upsertLock, type LockEntry } from './lockfile.js';
import type { AuditIndexEntry } from './hive-api.js';

const INDEX: AuditIndexEntry[] = [
  {
    slug: 'mcp-github', name: 'GitHub MCP', type: ['mcp'], tags: ['github', 'git'],
    tagline: 'GitHub API access for agents.',
    packages: ['@modelcontextprotocol/server-github'],
    context_cost: { always_on_tokens: 7240, tier: 'heavy', basis: 'estimated', tools_count: 40 },
    swaps: [{ slug: 'gh-cli', name: 'GitHub CLI', type: ['cli'], tokens: 0, saved: 7240 }],
  },
  {
    slug: 'mcp-supabase', name: 'Supabase MCP', type: ['mcp'], tags: ['supabase'],
    tagline: 'Manage Supabase from any agent.',
    packages: ['supabase-mcp'],
    context_cost: { always_on_tokens: 940, tier: 'medium', basis: 'estimated', tools_count: 5 },
  },
  {
    slug: 'gh-cli', name: 'GitHub CLI', type: ['cli'], tags: ['github', 'git'],
    tagline: 'Work with GitHub from the shell.',
    packages: ['gh'],
    context_cost: { always_on_tokens: 0, tier: 'light', basis: 'structural' },
  },
];

const deps: ContextDeps = { fetchAuditIndex: async () => INDEX };

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hive-ctx-'));
}

function lockEntry(over: Partial<LockEntry> = {}): LockEntry {
  return {
    name: 'GitHub CLI', version: '2.62.0', types: ['cli'], source: 's', installedAt: 'x',
    method: 'brew', scope: 'global', artifact: { brewFormula: 'gh' }, integrity: null, ...over,
  };
}

describe('scanMcpConfigs', () => {
  it('finds servers in .mcp.json and nested config files', () => {
    const dir = tempProject();
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: { github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { TOKEN: 'secret' } } },
    }));
    fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.cursor/mcp.json'), JSON.stringify({
      mcpServers: { custom: { command: 'node', args: ['server.js'] } },
    }));
    const servers = scanMcpConfigs(dir);
    expect(servers).toHaveLength(2);
    expect(servers[0]).toEqual({
      name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], sourceFile: '.mcp.json',
    });
    expect(JSON.stringify(servers)).not.toContain('secret');
  });

  it('skips malformed config files without throwing', () => {
    const dir = tempProject();
    fs.writeFileSync(path.join(dir, '.mcp.json'), 'not json {');
    expect(scanMcpConfigs(dir)).toEqual([]);
  });

  it('returns empty for a project with no configs', () => {
    expect(scanMcpConfigs(tempProject())).toEqual([]);
  });
});

describe('matchServer', () => {
  it('matches by npm package in args', () => {
    const s = { name: 'gh', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], sourceFile: '.mcp.json' };
    expect(matchServer(s, INDEX)?.slug).toBe('mcp-github');
  });

  it('falls back to name matching against mcp entries only', () => {
    const s = { name: 'supabase', command: 'docker', args: ['run', 'img'], sourceFile: '.mcp.json' };
    expect(matchServer(s, INDEX)?.slug).toBe('mcp-supabase');
  });

  it('returns null for unknown servers', () => {
    const s = { name: 'internal-thing', command: 'node', args: ['x.js'], sourceFile: '.mcp.json' };
    expect(matchServer(s, INDEX)).toBeNull();
  });
});

describe('contextReport', () => {
  it('reports scanned servers with catalog costs and swaps, unknown servers with the default', async () => {
    const dir = tempProject();
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: {
        github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
        mystery: { command: 'node', args: ['x.js'] },
      },
    }));
    const r = await contextReport(dir, deps);
    expect(r.items).toHaveLength(2);
    expect(r.items[0].matchSlug).toBe('mcp-github'); // 7240, sorted first
    expect(r.items[0].swaps[0]?.slug).toBe('gh-cli');
    expect(r.items[1].matchSlug).toBeNull();
    expect(r.items[1].tokens).toBe(1480);
    expect(r.totalTokens).toBe(7240 + 1480);
  });

  it('dedupes hive.lock tools already matched from a scanned config', async () => {
    const dir = tempProject();
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: { github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } },
    }));
    upsertLock(dir, 'mcp-github', lockEntry({ name: 'GitHub MCP', types: ['mcp'], method: 'mcp' }));
    upsertLock(dir, 'gh-cli', lockEntry());
    const r = await contextReport(dir, deps);
    expect(r.items).toHaveLength(2); // github (scanned) + gh-cli (lock); lock mcp-github deduped
    expect(r.totalTokens).toBe(7240);
    const sources = r.items.map((i) => i.source).sort();
    expect(sources).toEqual(['.mcp.json', 'hive.lock']);
  });
});

describe('formatContextReport', () => {
  it('formats totals, per-item lines, and swap lines', async () => {
    const dir = tempProject();
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: { github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] } },
    }));
    const text = formatContextReport(await contextReport(dir, deps));
    expect(text).toContain('~7.2k tok');
    expect(text).toContain('200k window');
    expect(text).toContain('catalog: mcp-github');
    expect(text).toContain('lighter: gh-cli');
  });

  it('says so when there is nothing to audit', () => {
    expect(formatContextReport({ items: [], totalTokens: 0 })).toContain('nothing to audit');
  });
});
