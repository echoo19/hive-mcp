import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { patchClaudeMd } from './claude-md-patch.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hive-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('patchClaudeMd', () => {
  it('creates CLAUDE.md when none exists', () => {
    patchClaudeMd(dir);
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('<!-- hive-start -->');
    expect(content).toContain('## Hive');
    expect(content).toContain('hive__discover');
    expect(content).toContain('<!-- hive-end -->');
  });

  it('appends to existing CLAUDE.md without overwriting content', () => {
    const existing = '# My Project\n\nSome existing instructions.\n';
    writeFileSync(join(dir, 'CLAUDE.md'), existing);
    patchClaudeMd(dir);
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('Some existing instructions.');
    expect(content).toContain('<!-- hive-start -->');
    expect(content).toContain('## Hive');
  });

  it('preserves existing content before the hive section', () => {
    const existing = '# Project\n\nDo not use mocks.';
    writeFileSync(join(dir, 'CLAUDE.md'), existing);
    patchClaudeMd(dir);
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    const hiveIndex = content.indexOf('<!-- hive-start -->');
    const projectIndex = content.indexOf('# Project');
    expect(projectIndex).toBeLessThan(hiveIndex);
  });

  it('is idempotent — running twice does not duplicate the section', () => {
    patchClaudeMd(dir);
    patchClaudeMd(dir);
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    const count = (content.match(/<!-- hive-start -->/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('does not duplicate when CLAUDE.md already contains the hive section', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# Existing\n\n<!-- hive-start -->\n## Hive\n<!-- hive-end -->\n');
    patchClaudeMd(dir);
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    const count = (content.match(/<!-- hive-start -->/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('handles existing file with no trailing newline', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# Project');
    patchClaudeMd(dir);
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# Project');
    expect(content).toContain('<!-- hive-start -->');
    expect(content.indexOf('# Project')).toBeLessThan(content.indexOf('<!-- hive-start -->'));
  });

  it('handles completely empty CLAUDE.md', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '');
    patchClaudeMd(dir);
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('<!-- hive-start -->');
    expect(content.startsWith('<!-- hive-start -->')).toBe(true);
  });
});
