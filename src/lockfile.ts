import * as fs from 'node:fs';
import * as path from 'node:path';

export type InstallMethod = 'mcp' | 'npm' | 'brew' | 'skill';
export type Scope = 'project' | 'global';

export interface LockArtifact {
  npmPackage?: string;
  brewFormula?: string;
  skillName?: string;
  mcpServers?: string[];
  configPath?: string;
}

export interface LockEntry {
  name: string;
  version: string;
  types: string[];
  source: string;
  installedAt: string;
  method: InstallMethod;
  scope: Scope;
  artifact: LockArtifact;
  integrity: null;
}

export interface LockFile {
  lockfileVersion: 1;
  tools: Record<string, LockEntry>;
}

const LOCK_NAME = 'hive.lock';

function lockPath(cwd: string): string {
  return path.join(cwd, LOCK_NAME);
}

function emptyLock(): LockFile {
  return { lockfileVersion: 1, tools: {} };
}

export function readLock(cwd: string): LockFile {
  const p = lockPath(cwd);
  if (!fs.existsSync(p)) return emptyLock();
  const raw = fs.readFileSync(p, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `hive.lock is malformed and cannot be parsed: ${(err as Error).message}. ` +
      `Refusing to overwrite; fix or delete ${p}.`
    );
  }
  const lock = parsed as LockFile;
  if (!lock || typeof lock !== 'object' || typeof lock.tools !== 'object' || lock.tools === null) {
    throw new Error(`hive.lock is malformed (missing "tools"). Refusing to overwrite; fix or delete ${p}.`);
  }
  return { lockfileVersion: 1, tools: lock.tools };
}

export function writeLock(cwd: string, lock: LockFile): void {
  const p = lockPath(cwd);
  const tmp = `${p}.tmp`;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(lock, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

export function getLock(cwd: string, slug: string): LockEntry | undefined {
  return readLock(cwd).tools[slug];
}

export function allLock(cwd: string): Record<string, LockEntry> {
  return readLock(cwd).tools;
}

export function upsertLock(cwd: string, slug: string, entry: LockEntry): void {
  const lock = readLock(cwd);
  lock.tools[slug] = entry;
  writeLock(cwd, lock);
}

export function removeLock(cwd: string, slug: string): void {
  const lock = readLock(cwd);
  delete lock.tools[slug];
  writeLock(cwd, lock);
}
