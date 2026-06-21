import * as path from 'node:path';
import { allLock, getLock, removeLock, type LockEntry } from './lockfile.js';
import { configServerNames } from './config-patch.js';
import { readState } from './state.js';
import { fetchInstallMd } from './hive-api.js';
import { parseInstallMd } from './parse.js';
import { executeInstall, executeUninstall } from './install.js';

export interface LifecycleDeps {
  fetchInstallMd: typeof fetchInstallMd;
  parseInstallMd: typeof parseInstallMd;
  executeInstall: typeof executeInstall;
  executeUninstall: typeof executeUninstall;
}

const DEFAULT_DEPS: LifecycleDeps = { fetchInstallMd, parseInstallMd, executeInstall, executeUninstall };

const BASE = 'https://hive-tooling.vercel.app';
const sourceFor = (slug: string) => `${BASE}/tools/${slug}`;

/** Is a lock entry currently satisfied on this machine/project? */
function isSatisfiedEntry(cwd: string, entry: LockEntry): boolean {
  if (entry.method === 'mcp') {
    const rel = entry.artifact.configPath ?? '';
    const abs = path.isAbsolute(rel) ? rel : path.join(cwd, rel);
    const present = new Set(configServerNames(abs));
    return (entry.artifact.mcpServers ?? []).every((n) => present.has(n));
  }
  // Global artifacts: satisfied if the ledger still records the artifact key.
  const key = entry.artifact.npmPackage ?? entry.artifact.brewFormula ?? entry.artifact.skillName;
  if (!key) return true;
  const state = readState();
  return Object.values(state).some((r) => r.artifactKey === key);
}

export interface UninstallSummary { reversed: boolean; message: string; }

export async function uninstall(slug: string, cwd: string, deps: LifecycleDeps = DEFAULT_DEPS): Promise<UninstallSummary> {
  const entry = getLock(cwd, slug);
  if (!entry) return { reversed: false, message: `${slug} is not in hive.lock; nothing to uninstall.` };
  const result = await deps.executeUninstall(slug, entry, cwd);
  if (result.status === 'error') {
    return { reversed: false, message: `Failed to uninstall ${slug}: ${result.message}` };
  }
  removeLock(cwd, slug);
  return { reversed: true, message: result.message ?? `Uninstalled ${slug}.` };
}

export interface SyncSummary { installed: string[]; alreadyPresent: string[]; failed: { slug: string; message: string }[]; }

export async function sync(cwd: string, deps: LifecycleDeps = DEFAULT_DEPS): Promise<SyncSummary> {
  const tools = allLock(cwd);
  const summary: SyncSummary = { installed: [], alreadyPresent: [], failed: [] };
  for (const [slug, entry] of Object.entries(tools)) {
    if (isSatisfiedEntry(cwd, entry)) { summary.alreadyPresent.push(slug); continue; }
    try {
      const md = await deps.fetchInstallMd(slug);
      const spec = deps.parseInstallMd(md);
      const r = await deps.executeInstall(spec, cwd, { slug, source: sourceFor(slug) });
      if (r.status === 'installed') summary.installed.push(slug);
      else summary.failed.push({ slug, message: r.message ?? r.status });
    } catch (err) {
      summary.failed.push({ slug, message: (err as Error).message });
    }
  }
  return summary;
}

export interface UpdateSummary { updated: { slug: string; from: string; to: string }[]; failed: { slug: string; message: string }[]; }

export async function update(slug: string | undefined, cwd: string, deps: LifecycleDeps = DEFAULT_DEPS): Promise<UpdateSummary> {
  const tools = allLock(cwd);
  const slugs = slug ? [slug] : Object.keys(tools);
  const summary: UpdateSummary = { updated: [], failed: [] };
  for (const s of slugs) {
    const entry = tools[s] ?? getLock(cwd, s);
    if (!entry) { summary.failed.push({ slug: s, message: 'not in hive.lock' }); continue; }
    try {
      const md = await deps.fetchInstallMd(s);
      const spec = deps.parseInstallMd(md);
      const r = await deps.executeInstall(spec, cwd, { slug: s, source: sourceFor(s) });
      if (r.status !== 'installed') { summary.failed.push({ slug: s, message: r.message ?? r.status }); continue; }
      summary.updated.push({ slug: s, from: entry.version, to: spec.version });
    } catch (err) {
      summary.failed.push({ slug: s, message: (err as Error).message });
    }
  }
  return summary;
}

export interface AuditSummary {
  missing: string[];
  untracked: string[];
  stale: { slug: string; lockVersion: string; catalogVersion: string }[];
}

export async function audit(cwd: string, deps: LifecycleDeps = DEFAULT_DEPS): Promise<AuditSummary> {
  const tools = allLock(cwd);
  const summary: AuditSummary = { missing: [], untracked: [], stale: [] };

  for (const [slug, entry] of Object.entries(tools)) {
    if (!isSatisfiedEntry(cwd, entry)) summary.missing.push(slug);
    try {
      const md = await deps.fetchInstallMd(slug);
      const spec = deps.parseInstallMd(md);
      if (spec.version && spec.version !== entry.version) {
        summary.stale.push({ slug, lockVersion: entry.version, catalogVersion: spec.version });
      }
    } catch {
      // network/catalog failure — skip staleness for this tool, not fatal.
    }
  }

  // Untracked: ledger records (keyed by slug) not present in the lock.
  const state = readState();
  for (const slug of Object.keys(state)) {
    if (!(slug in tools)) summary.untracked.push(slug);
  }

  return summary;
}
