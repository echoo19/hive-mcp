import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchTools, fetchInstallMd, formatTokens } from './hive-api.js';

const BASE = 'https://hive-tooling.vercel.app';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('matchTools', () => {
  it('fetches /api/match and returns results and recommendation', async () => {
    const mockResults = [
      { slug: 'mcp-supabase', name: 'Supabase MCP', type: ['mcp'], tagline: 'Supabase database', tags: [], compatible_agents: [], score: 3 },
    ];
    const mockRecommendation = { slug: 'mcp-supabase', reason: 'Use `mcp-supabase` for Supabase.' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: mockResults, recommendation: mockRecommendation }),
    }));

    const { results, recommendation } = await matchTools('supabase database');
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/match?q=supabase+database`);
    expect(results).toEqual(mockResults);
    expect(recommendation).toEqual(mockRecommendation);
  });

  it('returns empty array and null recommendation when API returns no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }));
    const { results, recommendation } = await matchTools('nothing');
    expect(results).toEqual([]);
    expect(recommendation).toBeNull();
  });

  it('tolerates legacy response with no recommendation field', async () => {
    const mockResults = [
      { slug: 'pdf', name: 'PDF Tool', type: ['skill'], tagline: 'Read PDFs', tags: [], compatible_agents: [], score: 80 },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: mockResults }),
    }));
    const { results, recommendation } = await matchTools('pdf');
    expect(results).toEqual(mockResults);
    expect(recommendation).toBeNull();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(matchTools('test')).rejects.toThrow('Hive API error: 500');
  });
});

describe('formatTokens', () => {
  it('formats counts below 1000 as plain number', () => {
    expect(formatTokens(70)).toBe('~70 tok');
    expect(formatTokens(999)).toBe('~999 tok');
  });

  it('formats counts of 1000+ as X.Xk', () => {
    expect(formatTokens(1000)).toBe('~1.0k tok');
    expect(formatTokens(1500)).toBe('~1.5k tok');
    expect(formatTokens(12300)).toBe('~12.3k tok');
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
