import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface InstalledRecord {
  slug: string;
  version: string;
  installedAt: string;
  type: string[];
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
