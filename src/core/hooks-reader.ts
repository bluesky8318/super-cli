import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CliProvider } from './types.js';
import { getAvailableProviders, getProviderHome } from './providers.js';

export interface HookEntry {
  type: string;
  command?: string;
  url?: string;
  tool?: string;
  timeout?: number;
}

export interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

export interface HookEventGroup {
  event: string;
  matchers: HookMatcher[];
}

export interface HooksConfig {
  provider: CliProvider;
  scope: 'global' | 'project';
  configPath: string;
  events: HookEventGroup[];
}

async function readJsonFile(path: string): Promise<any> {
  if (!existsSync(path)) return null;
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

function parseHooksObject(hooks: Record<string, any>): HookEventGroup[] {
  const events: HookEventGroup[] = [];
  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    events.push({
      event,
      matchers: matchers.map((m: any) => ({
        matcher: m.matcher || '*',
        hooks: Array.isArray(m.hooks) ? m.hooks.map((h: any) => ({
          type: h.type || 'command',
          command: h.command,
          url: h.url,
          tool: h.tool,
          timeout: h.timeout,
        })) : [],
      })),
    });
  }
  return events;
}

export async function getHooks(provider?: CliProvider, projectPath?: string): Promise<HooksConfig[]> {
  const results: HooksConfig[] = [];
  const providers = provider
    ? [{ id: provider, homeDir: getProviderHome(provider) }]
    : getAvailableProviders().filter(p => p.id !== 'codex');

  for (const p of providers) {
    const settingsPath = join(p.homeDir, 'settings.json');
    const data = await readJsonFile(settingsPath);
    if (data?.hooks) {
      results.push({
        provider: p.id as CliProvider,
        scope: 'global',
        configPath: settingsPath,
        events: parseHooksObject(data.hooks),
      });
    }
  }

  if (projectPath) {
    for (const p of providers) {
      const dirName = p.id === 'claude-code' ? '.claude' : p.id === 'qoder' ? '.qoder' : '.codex';
      const projSettingsPath = join(projectPath, dirName, 'settings.json');
      const data = await readJsonFile(projSettingsPath);
      if (data?.hooks) {
        results.push({
          provider: p.id as CliProvider,
          scope: 'project',
          configPath: projSettingsPath,
          events: parseHooksObject(data.hooks),
        });
      }
    }
  }

  return results;
}
