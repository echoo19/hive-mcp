import { describe, it, expect } from 'vitest';
import { formatStackPlan, type StackPlan } from './stack-plan.js';

const PLAN: StackPlan = {
  brief: 'Build a Supabase app and deploy it',
  budget: 'balanced',
  summary: '3 tools, ~940 tok always-on context.',
  totalTokens: 940,
  items: [
    {
      role: 'Database',
      slug: 'mcp-supabase',
      name: 'Supabase MCP',
      type: ['mcp'],
      tagline: 'Manage Supabase projects.',
      tokens: 940,
      reason: 'Matches database work.',
    },
    {
      role: 'Deployment',
      slug: 'vercel-cli',
      name: 'Vercel CLI',
      type: ['cli'],
      tagline: 'Deploy frontend apps.',
      tokens: 0,
      reason: 'Matches deployment work.',
    },
  ],
  omitted: [
    {
      role: 'Browser automation',
      reason: 'Would exceed the lean budget.',
      bestSlug: 'mcp-playwright',
      tokens: 2200,
    },
  ],
};

describe('formatStackPlan', () => {
  it('formats installable plan lines and omitted roles', () => {
    const text = formatStackPlan(PLAN);

    expect(text).toContain('3 tools, ~940 tok always-on context.');
    expect(text).toContain('Database: mcp-supabase (mcp, ~940 tok)');
    expect(text).toContain('Deployment: vercel-cli (cli, ~0 tok)');
    expect(text).toContain('Next: call install(slug) for each slug you want to add.');
    expect(text).toContain('Omitted:');
    expect(text).toContain('Browser automation: mcp-playwright');
  });
});
