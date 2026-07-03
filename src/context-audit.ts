// Context audit for local MCP configs and hive.lock. Env blocks are ignored.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { allLock } from './lockfile.js';
import { fetchAuditIndex, formatTokens, type AuditIndexEntry } from './hive-api.js';

export const WINDOW_TOKENS = 200_000;
// Mirror of the catalog's default estimate for an unknown MCP server (40 + 8 * 180).
const UNKNOWN_MCP_TOKENS = 1480;
const CONFIG_FILES = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json'];

export interface ScannedServer {
  name: string;
  command?: string;
  args: string[];
  sourceFile: string;
}

export interface ContextItem {
  label: string;
  kind: string;
  matchSlug: string | null;
  tokens: number;
  tier: 'light' | 'medium' | 'heavy';
  swaps: { slug: string; name: string; type: string[]; saved: number }[];
  source: string;
}

export interface ContextReport {
  items: ContextItem[];
  totalTokens: number;
}

export interface ContextDeps {
  fetchAuditIndex: typeof fetchAuditIndex;
}

const DEFAULT_DEPS: ContextDeps = { fetchAuditIndex };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Depth-first search for every `mcpServers` object in the tree; merges them.
function collectMcpServers(node: unknown, out: Record<string, unknown>): void {
  if (!isRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'mcpServers' && isRecord(value)) {
      for (const [name, def] of Object.entries(value)) out[name] = def;
    } else {
      collectMcpServers(value, out);
    }
  }
}

export function scanMcpConfigs(cwd: string): ScannedServer[] {
  const servers: ScannedServer[] = [];
  for (const rel of CONFIG_FILES) {
    const p = path.join(cwd, rel);
    if (!fs.existsSync(p)) continue;
    let root: unknown;
    try {
      root = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      continue; // malformed config is not our problem to report
    }
    const found: Record<string, unknown> = {};
    collectMcpServers(root, found);
    for (const [name, def] of Object.entries(found)) {
      const d = isRecord(def) ? def : {};
      servers.push({
        name,
        command: typeof d.command === 'string' ? d.command : undefined,
        args: Array.isArray(d.args) ? d.args.filter((a): a is string => typeof a === 'string') : [],
        sourceFile: rel,
      });
    }
  }
  return servers;
}

const NOT_PACKAGES = new Set([
  'npx', 'node', 'uvx', 'uv', 'docker', 'python', 'python3', 'deno', 'bun', 'sh', 'bash',
]);

function candidatePackages(server: ScannedServer): string[] {
  const cands: string[] = [];
  if (server.command && !NOT_PACKAGES.has(server.command)) cands.push(server.command);
  for (const a of server.args) {
    if (a.startsWith('-')) continue;
    if (/^@?[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)?$/.test(a)) cands.push(a);
  }
  return cands;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function matchServer(server: ScannedServer, index: AuditIndexEntry[]): AuditIndexEntry | null {
  const cands = candidatePackages(server);
  for (const entry of index) {
    if (entry.packages.some((p) => cands.includes(p))) return entry;
  }
  const n = normalize(server.name);
  if (!n) return null;
  for (const entry of index) {
    if (!entry.type.includes('mcp')) continue;
    const slugN = normalize(entry.slug);
    const slugStripped = normalize(entry.slug.replace(/^mcp-/, ''));
    const nameN = normalize(entry.name);
    if (n === slugN || n === slugStripped || n === nameN) return entry;
  }
  return null;
}

function swapsOf(entry: AuditIndexEntry | null): ContextItem['swaps'] {
  return (entry?.swaps ?? []).map((s) => ({ slug: s.slug, name: s.name, type: s.type, saved: s.saved }));
}

export async function contextReport(cwd: string, deps: ContextDeps = DEFAULT_DEPS): Promise<ContextReport> {
  const index = await deps.fetchAuditIndex();
  const items: ContextItem[] = [];
  const matchedSlugs = new Set<string>();

  for (const server of scanMcpConfigs(cwd)) {
    const match = matchServer(server, index);
    if (match) matchedSlugs.add(match.slug);
    items.push({
      label: server.name,
      kind: 'mcp',
      matchSlug: match?.slug ?? null,
      tokens: match ? match.context_cost.always_on_tokens : UNKNOWN_MCP_TOKENS,
      tier: match ? match.context_cost.tier : 'medium',
      swaps: swapsOf(match),
      source: server.sourceFile,
    });
  }

  // Count lock entries that were not already found in MCP config files.
  for (const [slug, entry] of Object.entries(allLock(cwd))) {
    if (matchedSlugs.has(slug)) continue;
    const match = index.find((e) => e.slug === slug) ?? null;
    items.push({
      label: entry.name,
      kind: match?.type[0] ?? entry.types[0] ?? 'cli',
      matchSlug: match?.slug ?? null,
      tokens: match ? match.context_cost.always_on_tokens : 0,
      tier: match ? match.context_cost.tier : 'light',
      swaps: swapsOf(match),
      source: 'hive.lock',
    });
  }

  items.sort((a, b) => b.tokens - a.tokens);
  return { items, totalTokens: items.reduce((sum, i) => sum + i.tokens, 0) };
}

export function formatContextReport(report: ContextReport): string {
  if (report.items.length === 0) {
    return 'Context: nothing to audit (no MCP configs found and hive.lock is empty).';
  }
  const pct = ((report.totalTokens / WINDOW_TOKENS) * 100).toFixed(1);
  const lines = [
    `Context: ${formatTokens(report.totalTokens)} always-on (${pct}% of a 200k window) before the first message.`,
  ];
  for (const i of report.items) {
    const match = i.matchSlug ? `catalog: ${i.matchSlug}` : 'estimated (not in catalog)';
    lines.push(`  ${formatTokens(i.tokens)}  [${i.tier}] ${i.label} (${i.kind}, ${i.source}): ${match}`);
    for (const s of i.swaps) {
      lines.push(`      lighter: ${s.slug} (${s.type[0] ?? 'tool'}) saves ${formatTokens(s.saved)}`);
    }
  }
  return lines.join('\n');
}
