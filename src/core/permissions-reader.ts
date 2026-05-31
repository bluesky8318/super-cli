import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CliProvider } from './types.js';
import { getAvailableProviders, getProviderHome } from './providers.js';

export interface PermissionsConfig {
  provider: CliProvider;
  scope: 'global' | 'project';
  configPath: string;
  allow: string[];
  deny: string[];
  additionalDirectories?: string[];
}

async function readJsonFile(path: string): Promise<any> {
  if (!existsSync(path)) return null;
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

export async function getPermissions(provider?: CliProvider, projectPath?: string): Promise<PermissionsConfig[]> {
  const results: PermissionsConfig[] = [];
  const providers = provider
    ? [{ id: provider, homeDir: getProviderHome(provider) }]
    : getAvailableProviders().filter(p => p.id !== 'codex');

  for (const p of providers) {
    const settingsPath = join(p.homeDir, 'settings.json');
    const data = await readJsonFile(settingsPath);
    if (data?.permissions) {
      results.push({
        provider: p.id as CliProvider,
        scope: 'global',
        configPath: settingsPath,
        allow: Array.isArray(data.permissions.allow) ? data.permissions.allow : [],
        deny: Array.isArray(data.permissions.deny) ? data.permissions.deny : [],
        additionalDirectories: data.permissions.additionalDirectories,
      });
    }
  }

  if (projectPath) {
    for (const p of providers) {
      const dirName = p.id === 'claude-code' ? '.claude' : p.id === 'qoder' ? '.qoder' : '.codex';
      const projSettingsPath = join(projectPath, dirName, 'settings.json');
      const data = await readJsonFile(projSettingsPath);
      if (data?.permissions) {
        results.push({
          provider: p.id as CliProvider,
          scope: 'project',
          configPath: projSettingsPath,
          allow: Array.isArray(data.permissions.allow) ? data.permissions.allow : [],
          deny: Array.isArray(data.permissions.deny) ? data.permissions.deny : [],
          additionalDirectories: data.permissions.additionalDirectories,
        });
      }
    }
  }

  return results;
}
