import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { executeInstall, type InstallResult } from './install.js';
import type { InstallSpec } from './parse.js';

vi.mock('node:child_process');
vi.mock('./config-patch.js');
vi.mock('./state.js');

import { patchMcpConfig } from './config-patch.js';
import { recordInstall } from './state.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(childProcess.execSync).mockReturnValue(Buffer.from(''));
  vi.mocked(patchMcpConfig).mockReturnValue(undefined);
  vi.mocked(recordInstall).mockReturnValue(undefined);
});

const cliSpec: InstallSpec = {
  name: 'claude-code', types: ['cli'], version: '2.2.0',
  npmPackage: '@anthropic-ai/claude-code', brewFormula: null, mcpServers: null,
};

const mcpSpec: InstallSpec = {
  name: 'mcp-supabase', types: ['mcp'], version: '0.3.0',
  npmPackage: null, brewFormula: null,
  mcpServers: { supabase: { command: 'npx', args: ['-y', 'supabase-mcp'] } },
};

const unknownSpec: InstallSpec = {
  name: 'goose', types: ['subagent'], version: '1.0.0',
  npmPackage: null, brewFormula: null, mcpServers: null,
};

describe('executeInstall', () => {
  it('runs npm install -g for CLI tools with npm package', async () => {
    const result = await executeInstall(cliSpec, process.cwd());
    expect(childProcess.execSync).toHaveBeenCalledWith(
      'npm install -g @anthropic-ai/claude-code',
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(result.status).toBe('installed');
    expect(result.command).toBe('npm install -g @anthropic-ai/claude-code');
  });

  it('calls patchMcpConfig for MCP tools', async () => {
    const result = await executeInstall(mcpSpec, process.cwd());
    expect(patchMcpConfig).toHaveBeenCalled();
    expect(result.status).toBe('installed');
  });

  it('records the install in state after success', async () => {
    await executeInstall(cliSpec, process.cwd());
    expect(recordInstall).toHaveBeenCalledWith('claude-code', '2.2.0', ['cli']);
  });

  it('returns unsupported status for tool types with no install method', async () => {
    const result = await executeInstall(unknownSpec, process.cwd());
    expect(result.status).toBe('unsupported');
    expect(childProcess.execSync).not.toHaveBeenCalled();
  });

  it('returns error status when exec throws', async () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('permission denied'); });
    const result = await executeInstall(cliSpec, process.cwd());
    expect(result.status).toBe('error');
    expect(result.message).toContain('permission denied');
  });

  it('runs npx skills add for skill tools', async () => {
    const skillSpec: InstallSpec = {
      name: 'superpowers', types: ['skill'], version: '1.0.0',
      npmPackage: null, brewFormula: null, mcpServers: null,
    };
    const result = await executeInstall(skillSpec, process.cwd());
    expect(childProcess.execSync).toHaveBeenCalledWith(
      'npx skills add superpowers',
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(result.status).toBe('installed');
  });

  it('returns error status when patchMcpConfig throws', async () => {
    vi.mocked(patchMcpConfig).mockImplementation(() => { throw new Error('write failed'); });
    const result = await executeInstall(mcpSpec, process.cwd());
    expect(result.status).toBe('error');
    expect(result.message).toContain('write failed');
  });
});
