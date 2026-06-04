import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readState, writeState, recordInstall, type InstalledState } from './state.js';

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
