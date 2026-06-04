const BASE = 'https://hive-tooling.vercel.app';

export interface MatchResult {
  slug: string;
  name: string;
  type: string | string[];
  tagline: string;
  tags: string[];
  compatible_agents: string[];
  score: number;
}

export async function matchTools(intent: string): Promise<MatchResult[]> {
  const params = new URLSearchParams({ q: intent });
  const res = await fetch(`${BASE}/api/match?${params}`);
  if (!res.ok) throw new Error(`Hive API error: ${res.status}`);
  const body = await res.json() as { results: MatchResult[] };
  return body.results ?? [];
}

export async function fetchInstallMd(slug: string): Promise<string> {
  const res = await fetch(`${BASE}/tools/${slug}/install.md`);
  if (!res.ok) throw new Error(`Hive API error: ${res.status}`);
  return res.text();
}
