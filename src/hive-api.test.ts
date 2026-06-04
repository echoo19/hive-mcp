import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchTools, fetchInstallMd } from './hive-api.js';

const BASE = 'https://hive-tooling.vercel.app';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('matchTools', () => {
  it('fetches /api/match and returns results array', async () => {
    const mockResults = [
      { slug: 'mcp-supabase', name: 'Supabase MCP', type: ['mcp'], tagline: 'Supabase database', tags: [], compatible_agents: [], score: 3 },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: mockResults }),
    }));

    const results = await matchTools('supabase database');
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/match?q=supabase+database`);
    expect(results).toEqual(mockResults);
  });

  it('returns empty array when API returns no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }));
    expect(await matchTools('nothing')).toEqual([]);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(matchTools('test')).rejects.toThrow('Hive API error: 500');
  });
});

describe('fetchInstallMd', () => {
  it('fetches /tools/[slug]/install.md and returns text', async () => {
    const md = '# claude-code\ntype: cli\n\n## Install\n\nnpm install -g @anthropic-ai/claude-code';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(md) }));

    const result = await fetchInstallMd('claude-code');
    expect(fetch).toHaveBeenCalledWith(`${BASE}/tools/claude-code/install.md`);
    expect(result).toBe(md);
  });

  it('throws on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchInstallMd('nonexistent')).rejects.toThrow('Hive API error: 404');
  });
});
