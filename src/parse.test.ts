import { describe, it, expect } from 'vitest';
import { parseInstallMd } from './parse.js';

const CLI_MD = `# claude-code
type: cli, subagent
compatible_agents: Claude Code
version: 2.2.0

## Install

Install Claude Code from https://github.com/anthropics/claude-code.

Via npm: npm install -g @anthropic-ai/claude-code

Requires an Anthropic API key.`;

const MCP_MD = `# mcp-supabase
type: mcp
compatible_agents: Claude Code, Claude Desktop
version: 0.3.0

## Install

Install the Supabase MCP server from https://github.com/supabase-community/supabase-mcp.

Via npx: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=your_key npx supabase-mcp

For Claude Desktop, add to claude_desktop_config.json:
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "supabase-mcp"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your_service_role_key"
      }
    }
  }
}`;

const BREW_MD = `# gh
type: cli
compatible_agents: Claude Code
version: 2.93.0

## Install

On macOS: brew install gh
On Windows: winget install GitHub.cli`;

describe('parseInstallMd', () => {
  it('extracts name, types, and version from header', () => {
    const spec = parseInstallMd(CLI_MD);
    expect(spec.name).toBe('claude-code');
    expect(spec.types).toEqual(['cli', 'subagent']);
    expect(spec.version).toBe('2.2.0');
  });

  it('extracts npm install command for CLI tools', () => {
    const spec = parseInstallMd(CLI_MD);
    expect(spec.npmPackage).toBe('@anthropic-ai/claude-code');
  });

  it('extracts brew formula for CLI tools', () => {
    const spec = parseInstallMd(BREW_MD);
    expect(spec.brewFormula).toBe('gh');
  });

  it('extracts mcpServers config block for MCP tools', () => {
    const spec = parseInstallMd(MCP_MD);
    expect(spec.mcpServers).toBeDefined();
    expect(spec.mcpServers!['supabase'].command).toBe('npx');
    expect(spec.mcpServers!['supabase'].args).toEqual(['-y', 'supabase-mcp']);
  });

  it('returns null mcpServers for non-MCP tools', () => {
    const spec = parseInstallMd(CLI_MD);
    expect(spec.mcpServers).toBeNull();
  });

  it('returns null npmPackage and brewFormula for MCP tools', () => {
    const spec = parseInstallMd(MCP_MD);
    expect(spec.npmPackage).toBeNull();
    expect(spec.brewFormula).toBeNull();
  });
});
