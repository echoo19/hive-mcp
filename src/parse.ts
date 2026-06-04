export interface McpServerDef {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface InstallSpec {
  name: string;
  types: string[];
  version: string;
  npmPackage: string | null;
  brewFormula: string | null;
  mcpServers: Record<string, McpServerDef> | null;
}

export function parseInstallMd(content: string): InstallSpec {
  const nameMatch = content.match(/^#\s+(.+)$/m);
  const typeMatch = content.match(/^type:\s*(.+)$/m);
  const versionMatch = content.match(/^version:\s*(.+)$/m);

  const name = nameMatch?.[1]?.trim() ?? '';
  const types = typeMatch?.[1]?.split(',').map(t => t.trim()) ?? [];
  const version = versionMatch?.[1]?.trim() ?? 'latest';

  // Extract npm install -g <package>
  const npmMatch = content.match(/npm install\s+-g\s+([\S]+)/);
  const npmPackage = npmMatch?.[1] ?? null;

  // Extract brew install <formula>
  const brewMatch = content.match(/brew install\s+([\S]+)/);
  const brewFormula = brewMatch?.[1] ?? null;

  // Extract mcpServers JSON block
  let mcpServers: Record<string, McpServerDef> | null = null;
  const jsonMatch = content.match(/\{[\s\S]*"mcpServers"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { mcpServers: Record<string, McpServerDef> };
      mcpServers = parsed.mcpServers ?? null;
    } catch {
      // malformed JSON — skip
    }
  }

  return { name, types, version, npmPackage, brewFormula, mcpServers };
}
