import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readLock, writeLock, upsertLock, getLock, removeLock, allLock,
  type LockEntry, type LockFile,
} from './lockfile.js';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-lock-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const entry: LockEntry = {
  name: 'Supabase MCP', version: '1.2.0', types: ['mcp'],
  source: 'https://hive-tooling.vercel.app/tools/mcp-supabase',
  installedAt: '2026-06-21T14:00:00Z', method: 'mcp', scope: 'project',
  artifact: { mcpServers: ['supabase'], configPath: '.claude/settings.json' },
  integrity: null,
};

describe('readLock', () => {
  it('returns empty lock when file is absent', () => {
    expect(readLock(dir)).toEqual({ lockfileVersion: 1, tools: {} });
  });
  it('throws a clear error on malformed JSON', () => {
    fs.writeFileSync(path.join(dir, 'hive.lock'), '{ not json');
    expect(() => readLock(dir)).toThrow(/malformed/i);
  });
});

describe('writeLock + readLock round-trip', () => {
  it('persists and reads back a lock', () => {
    const lock: LockFile = { lockfileVersion: 1, tools: { 'mcp-supabase': entry } };
    writeLock(dir, lock);
    expect(readLock(dir)).toEqual(lock);
  });
  it('does not leave a .tmp file behind (atomic rename)', () => {
    writeLock(dir, { lockfileVersion: 1, tools: {} });
    expect(fs.existsSync(path.join(dir, 'hive.lock.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'hive.lock'))).toBe(true);
  });
});

describe('upsert / get / remove / all', () => {
  it('upserts then gets by slug', () => {
    upsertLock(dir, 'mcp-supabase', entry);
    expect(getLock(dir, 'mcp-supabase')).toEqual(entry);
  });
  it('upsert overwrites an existing slug', () => {
    upsertLock(dir, 'mcp-supabase', entry);
    upsertLock(dir, 'mcp-supabase', { ...entry, version: '2.0.0' });
    expect(getLock(dir, 'mcp-supabase')!.version).toBe('2.0.0');
  });
  it('removes a slug and returns undefined afterward', () => {
    upsertLock(dir, 'mcp-supabase', entry);
    removeLock(dir, 'mcp-supabase');
    expect(getLock(dir, 'mcp-supabase')).toBeUndefined();
  });
  it('all() returns every entry keyed by slug', () => {
    upsertLock(dir, 'mcp-supabase', entry);
    upsertLock(dir, 'gh', { ...entry, name: 'gh', method: 'brew', scope: 'global', artifact: { brewFormula: 'gh' } });
    expect(Object.keys(allLock(dir)).sort()).toEqual(['gh', 'mcp-supabase']);
  });
  it('get on a missing slug returns undefined', () => {
    expect(getLock(dir, 'nope')).toBeUndefined();
  });
});
