const BASE = 'https://hive-tooling.vercel.app';

export interface MatchResult {
  slug: string;
  name: string;
  type: string | string[];
  tagline: string;
  tags: string[];
  compatible_agents: string[];
  score: number;
  fit?: number;
  context_cost?: {
    always_on_tokens: number;
    tier: 'light' | 'medium' | 'heavy';
    basis: string;
    tools_count?: number;
  };
}

export interface Recommendation {
  slug: string;
  reason: string;
}

export type StackBudget = 'lean' | 'balanced' | 'capable';

export interface StackPlanItem {
  role: string;
  slug: string;
  name: string;
  type: string[];
  tagline: string;
  tokens: number;
  reason: string;
}

export interface OmittedStackRole {
  role: string;
  reason: string;
  bestSlug: string;
  tokens: number;
}

export interface StackPlan {
  brief: string;
  budget: StackBudget;
  summary: string;
  totalTokens: number;
  items: StackPlanItem[];
  omitted: OmittedStackRole[];
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `~${(n / 1000).toFixed(1)}k tok`;
  return `~${n} tok`;
}

export async function matchTools(intent: string): Promise<{ results: MatchResult[]; recommendation: Recommendation | null }> {
  const params = new URLSearchParams({ q: intent });
  const res = await fetch(`${BASE}/api/match?${params}`);
  if (!res.ok) throw new Error(`Hive API error: ${res.status}`);
  const body = await res.json() as { results?: MatchResult[]; recommendation?: Recommendation | null };
  return {
    results: body.results ?? [],
    recommendation: body.recommendation ?? null,
  };
}

export async function planStack(brief: string, budget: StackBudget = 'balanced'): Promise<StackPlan> {
  const params = new URLSearchParams({ q: brief, budget });
  const res = await fetch(`${BASE}/api/plan?${params}`);
  if (!res.ok) throw new Error(`Hive API error: ${res.status}`);
  return res.json() as Promise<StackPlan>;
}

export async function fetchInstallMd(slug: string): Promise<string> {
  const res = await fetch(`${BASE}/tools/${slug}/install.md`);
  if (!res.ok) throw new Error(`Hive API error: ${res.status}`);
  return res.text();
}

export interface AuditIndexSwap {
  slug: string;
  name: string;
  type: string[];
  tokens: number;
  saved: number;
}

export interface AuditIndexEntry {
  slug: string;
  name: string;
  type: string[];
  tags: string[];
  tagline: string;
  packages: string[];
  context_cost: {
    always_on_tokens: number;
    tier: 'light' | 'medium' | 'heavy';
    basis: string;
    tools_count?: number;
  };
  swaps?: AuditIndexSwap[];
}

export async function fetchAuditIndex(): Promise<AuditIndexEntry[]> {
  const res = await fetch(`${BASE}/api/audit-index.json`);
  if (!res.ok) throw new Error(`Hive API error: ${res.status}`);
  const body = await res.json() as { entries?: AuditIndexEntry[] };
  return body.entries ?? [];
}
