import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface InstalledRecord {
  slug: string;
  version: string;
  installedAt: string;
  type: string[];
  scope?: 'project' | 'global';
  artifactKey?: string;
  refs?: string[];
}

export type InstalledState = Record<string, InstalledRecord>;

function statePath(): string {
  return path.join(os.homedir(), '.hive', 'installed.json');
}

export function readState(): InstalledState {
  const p = statePath();
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as InstalledState;
}

export function writeState(state: InstalledState): void {
  const p = statePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

export function recordInstall(slug: string, version: string, type: string[]): void {
  const state = readState();
  state[slug] = { slug, version, installedAt: new Date().toISOString(), type };
  writeState(state);
}

export interface RefMeta {
  version: string;
  type: string[];
  scope: 'project' | 'global';
  artifactKey?: string;
}

/** Record that `projectPath` references the artifact for `slug`. Idempotent per project. */
export function addRef(slug: string, projectPath: string, meta: RefMeta): void {
  const state = readState();
  const existing = state[slug];
  const refs = new Set(existing?.refs ?? []);
  refs.add(projectPath);
  state[slug] = {
    slug,
    version: meta.version,
    installedAt: existing?.installedAt ?? new Date().toISOString(),
    type: meta.type,
    scope: meta.scope,
    artifactKey: meta.artifactKey,
    refs: [...refs],
  };
  writeState(state);
}

/** Remove `projectPath`'s reference to `slug`. Returns the remaining ref count. Deletes the record at 0. */
export function removeRef(slug: string, projectPath: string): number {
  const state = readState();
  const existing = state[slug];
  if (!existing) return 0;
  const refs = (existing.refs ?? []).filter((r) => r !== projectPath);
  if (refs.length === 0) {
    delete state[slug];
    writeState(state);
    return 0;
  }
  state[slug] = { ...existing, refs };
  writeState(state);
  return refs.length;
}

export function refCount(slug: string): number {
  const rec = readState()[slug];
  return rec?.refs?.length ?? 0;
}
