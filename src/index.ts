#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { matchTools, fetchInstallMd } from './hive-api.js';
import { parseInstallMd } from './parse.js';
import { executeInstall } from './install.js';
import { readState } from './state.js';

const server = new McpServer({
  name: 'hive',
  version: '0.1.0',
});

server.tool(
  'discover',
  'Find Hive agent tools by describing what you want to build. Returns a ranked list of tools with name, type, and tagline.',
  { intent: z.string().describe('What you want to build, e.g. "deploy a Next.js app with a Supabase database"') },
  async ({ intent }) => {
    const results = await matchTools(intent);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: 'No tools found for that intent. Try a broader description.' }] };
    }
    const text = results.map(r =>
      `${r.slug} (${Array.isArray(r.type) ? r.type.join(', ') : r.type}) — ${r.tagline}`
    ).join('\n');
    return { content: [{ type: 'text', text }] };
  }
);

server.tool(
  'install',
  'Install a Hive tool by its slug. Fetches install instructions and executes the appropriate installer. Logs all commands before running.',
  { slug: z.string().describe('The tool slug from the Hive catalog, e.g. "mcp-supabase" or "gh"') },
  async ({ slug }) => {
    const md = await fetchInstallMd(slug);
    const spec = parseInstallMd(md);
    const result = await executeInstall(spec, process.cwd());

    if (result.status === 'installed') {
      return { content: [{ type: 'text', text: `✓ ${slug} installed.${result.command ? ` Ran: ${result.command}` : ''} ${result.message ?? ''}`.trim() }] };
    }
    if (result.status === 'unsupported') {
      return { content: [{ type: 'text', text: `Cannot auto-install ${slug}: ${result.message}\n\nFetch manual instructions: https://hive-tooling.vercel.app/tools/${slug}/install.md` }] };
    }
    return { content: [{ type: 'text', text: `Error installing ${slug}: ${result.message}` }], isError: true } as any;
  }
);

server.tool(
  'list',
  'List all tools currently installed via Hive.',
  {},
  async () => {
    const state = readState();
    const entries = Object.values(state);
    if (entries.length === 0) {
      return { content: [{ type: 'text', text: 'No tools installed via Hive yet. Use discover() to find tools.' }] };
    }
    const text = entries.map(e => `${e.slug} v${e.version} (${e.type.join(', ')}) — installed ${e.installedAt}`).join('\n');
    return { content: [{ type: 'text', text }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
