import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readState, writeState, recordInstall, addRef, removeRef, refCount, type InstalledState } from './state.js';

vi.mock('node:fs');
vi.mock('node:os');

const FAKE_HOME = '/fake/home';
const STATE_PATH = path.join(FAKE_HOME, '.hive', 'installed.json');

beforeEach(() => {
  vi.mocked(os.homedir).mockReturnValue(FAKE_HOME);
  vi.restoreAllMocks();
  vi.mocked(os.homedir).mockReturnValue(FAKE_HOME);
});

describe('readState', () => {
  it('returns empty object when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(readState()).toEqual({});
  });

  it('returns parsed JSON when file exists', () => {
    const state: InstalledState = { 'claude-code': { slug: 'claude-code', version: '2.2.0', installedAt: '2026-06-01', type: ['cli'] } };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(state));
    expect(readState()).toEqual(state);
  });
});

describe('writeState', () => {
  it('creates ~/.hive directory and writes JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const state: InstalledState = { 'gh': { slug: 'gh', version: '2.93.0', installedAt: '2026-06-01', type: ['cli'] } };
    writeState(state);

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(FAKE_HOME, '.hive'), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(STATE_PATH, JSON.stringify(state, null, 2));
  });
});

describe('recordInstall', () => {
  it('adds a new entry to state and writes it', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    const written: string[] = [];
    vi.mocked(fs.writeFileSync).mockImplementation((_, data) => { written.push(data as string); });

    recordInstall('claude-code', '2.2.0', ['cli']);

    const saved = JSON.parse(written[0]) as InstalledState;
    expect(saved['claude-code'].slug).toBe('claude-code');
    expect(saved['claude-code'].version).toBe('2.2.0');
    expect(saved['claude-code'].type).toEqual(['cli']);
  });
});

describe('refcount helpers', () => {
  // Each test drives a real in-memory state via mocked fs read/write.
  function withState(initial: Record<string, unknown>) {
    let current = JSON.stringify(initial);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => current);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.writeFileSync).mockImplementation((_p, d) => { current = d as string; });
    return () => JSON.parse(current);
  }

  it('addRef creates a record keyed by slug with one project ref', () => {
    const read = withState({});
    addRef('aider', '/proj/a', { version: '1.0.0', type: ['cli'], scope: 'global', artifactKey: 'aider-chat' });
    const s = read();
    expect(s.aider.slug).toBe('aider');
    expect(s.aider.refs).toEqual(['/proj/a']);
    expect(s.aider.artifactKey).toBe('aider-chat');
  });

  it('addRef is idempotent for the same project (no double count)', () => {
    const read = withState({});
    addRef('aider', '/proj/a', { version: '1.0.0', type: ['cli'], scope: 'global', artifactKey: 'aider-chat' });
    addRef('aider', '/proj/a', { version: '1.0.0', type: ['cli'], scope: 'global', artifactKey: 'aider-chat' });
    expect(read().aider.refs).toEqual(['/proj/a']);
  });

  it('two projects referencing one artifact => refCount 2', () => {
    withState({});
    addRef('aider', '/proj/a', { version: '1.0.0', type: ['cli'], scope: 'global', artifactKey: 'aider-chat' });
    addRef('aider', '/proj/b', { version: '1.0.0', type: ['cli'], scope: 'global', artifactKey: 'aider-chat' });
    expect(refCount('aider')).toBe(2);
  });

  it('removeRef drops one project and returns remaining count', () => {
    withState({
      aider: { slug: 'aider', version: '1.0.0', installedAt: 'x', type: ['cli'], scope: 'global', artifactKey: 'aider-chat', refs: ['/proj/a', '/proj/b'] },
    });
    const remaining = removeRef('aider', '/proj/a');
    expect(remaining).toBe(1);
    expect(refCount('aider')).toBe(1);
  });

  it('removeRef of the last project removes the record entirely', () => {
    withState({
      aider: { slug: 'aider', version: '1.0.0', installedAt: 'x', type: ['cli'], scope: 'global', artifactKey: 'aider-chat', refs: ['/proj/a'] },
    });
    const remaining = removeRef('aider', '/proj/a');
    expect(remaining).toBe(0);
    expect(refCount('aider')).toBe(0);
  });

  it('refCount of an unknown slug is 0', () => {
    withState({});
    expect(refCount('ghost')).toBe(0);
  });
});
