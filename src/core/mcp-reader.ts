import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CliProvider, McpServerInfo } from './types.js';
import { getAvailableProviders, getProviderHome } from './providers.js';

interface McpHealthEntry {
  status: string;
  lastError?: string;
}

async function readJsonFile(path: string): Promise<any> {
  if (!existsSync(path)) return null;
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

async function readHealthCache(): Promise<Record<string, McpHealthEntry>> {
  const cachePath = join(getProviderHome('claude-code'), 'mcp-health-cache.json');
  const data = await readJsonFile(cachePath);
  return data?.servers ?? {};
}

function getSettingsPath(provider: CliProvider): string {
  return join(getProviderHome(provider), 'settings.json');
}

function getMcpJsonPath(projectPath: string): string {
  return join(projectPath, '.mcp.json');
}

async function readMcpFromSettings(provider: CliProvider): Promise<Record<string, any>> {
  const data = await readJsonFile(getSettingsPath(provider));
  return data?.mcpServers ?? {};
}

async function writeMcpToSettings(provider: CliProvider, servers: Record<string, any>): Promise<void> {
  const path = getSettingsPath(provider);
  const data = await readJsonFile(path) ?? {};
  data.mcpServers = servers;
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function readMcpFromProject(projectPath: string): Promise<Record<string, any>> {
  const data = await readJsonFile(getMcpJsonPath(projectPath));
  return data?.mcpServers ?? {};
}

async function writeMcpToProject(projectPath: string, servers: Record<string, any>): Promise<void> {
  const path = getMcpJsonPath(projectPath);
  const data = await readJsonFile(path) ?? {};
  data.mcpServers = servers;
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function toServerInfo(id: string, config: any, provider: CliProvider, scope: 'global' | 'project', healthMap: Record<string, McpHealthEntry>): McpServerInfo {
  const type = config.url ? (config.type === 'sse' ? 'sse' : 'http') : 'stdio';
  const health = healthMap[id];
  let status: McpServerInfo['status'] = 'unknown';
  if (health) {
    status = health.status === 'connected' ? 'healthy' : 'unhealthy';
  }
  return {
    id,
    name: id,
    type,
    command: config.command,
    args: config.args,
    url: config.url,
    env: config.env,
    provider,
    scope,
    status,
  };
}

export async function getMcpServers(provider?: CliProvider, projectPath?: string): Promise<McpServerInfo[]> {
  const healthMap = await readHealthCache();
  const results: McpServerInfo[] = [];

  const providers = provider
    ? [{ id: provider }]
    : getAvailableProviders().filter(p => p.id !== 'codex');

  for (const p of providers) {
    const pid = p.id as CliProvider;
    const servers = await readMcpFromSettings(pid);
    for (const [id, config] of Object.entries(servers)) {
      results.push(toServerInfo(id, config, pid, 'global', healthMap));
    }
  }

  if (projectPath && existsSync(getMcpJsonPath(projectPath))) {
    const projectServers = await readMcpFromProject(projectPath);
    for (const [id, config] of Object.entries(projectServers)) {
      results.push(toServerInfo(id, config, provider ?? 'claude-code', 'project', healthMap));
    }
  }

  return results;
}

export async function addMcpServer(provider: CliProvider, id: string, config: object, projectPath?: string): Promise<void> {
  if (projectPath) {
    const servers = await readMcpFromProject(projectPath);
    servers[id] = config;
    await writeMcpToProject(projectPath, servers);
  } else {
    const servers = await readMcpFromSettings(provider);
    servers[id] = config;
    await writeMcpToSettings(provider, servers);
  }
}

export async function updateMcpServer(provider: CliProvider, id: string, config: object, projectPath?: string): Promise<void> {
  await addMcpServer(provider, id, config, projectPath);
}

export async function deleteMcpServer(provider: CliProvider, id: string, projectPath?: string): Promise<void> {
  if (projectPath) {
    const servers = await readMcpFromProject(projectPath);
    delete servers[id];
    await writeMcpToProject(projectPath, servers);
  } else {
    const servers = await readMcpFromSettings(provider);
    delete servers[id];
    await writeMcpToSettings(provider, servers);
  }
}

export async function copyMcpServer(fromProvider: CliProvider, toProvider: CliProvider, id: string): Promise<void> {
  const servers = await readMcpFromSettings(fromProvider);
  const config = servers[id];
  if (!config) throw new Error(`MCP server not found: ${id}`);
  await addMcpServer(toProvider, id, config);
}
