import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CliProvider } from './types.js';

export interface ProviderConfig {
  id: CliProvider;
  name: string;
  command: string;
  newArgs: string[];
  resumeArgs: (sessionId: string) => string[];
  homeDir: string;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    newArgs: ['--dangerously-skip-permissions'],
    resumeArgs: (id) => ['--dangerously-skip-permissions', '--resume', id],
    homeDir: join(homedir(), '.claude'),
  },
  {
    id: 'qoder',
    name: 'Qoder CLI',
    command: 'qodercli',
    newArgs: ['--dangerously-skip-permissions'],
    resumeArgs: (id) => ['--dangerously-skip-permissions', '--resume', id],
    homeDir: join(homedir(), '.qoder'),
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    newArgs: [],
    resumeArgs: (id) => ['resume', id],
    homeDir: join(homedir(), '.codex'),
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    command: 'kimi',
    newArgs: [],
    resumeArgs: (id) => ['--resume', id],
    homeDir: join(homedir(), '.kimi'),
  },
  {
    id: 'pi',
    name: 'Pi CLI',
    command: 'pi',
    newArgs: [],
    resumeArgs: (id) => ['--resume', id],
    homeDir: join(homedir(), '.pi'),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    newArgs: [],
    resumeArgs: (id) => ['--resume', id],
    homeDir: join(homedir(), '.opencode'),
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    command: 'workbuddy',
    newArgs: [],
    resumeArgs: (id) => ['--resume', id],
    homeDir: join(homedir(), '.workbuddy'),
  },
  {
    id: 'traecode',
    name: 'TraeCode',
    command: 'traecode',
    newArgs: [],
    resumeArgs: (id) => ['--resume', id],
    homeDir: join(homedir(), '.traecode'),
  },
];

export function getAllProviders(): ProviderConfig[] {
  return PROVIDER_CONFIGS;
}

export function getAvailableProviders(): ProviderConfig[] {
  return PROVIDER_CONFIGS.filter(p => existsSync(p.homeDir));
}

export function getProvider(id: CliProvider): ProviderConfig {
  const p = PROVIDER_CONFIGS.find(c => c.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function getProviderHome(provider: CliProvider): string {
  return getProvider(provider).homeDir;
}
