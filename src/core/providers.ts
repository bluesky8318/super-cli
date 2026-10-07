import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CliProvider } from './types.js';

/** How a provider stores session transcripts on disk. */
export interface SessionLayout {
  /** Directory under homeDir that holds one subdirectory per project. */
  projectsDir: string;
  /** How project directory names encode the project path. */
  encoding: 'dash' | 'dash-no-prefix' | 'double-dash' | 'md5';
  /** How session files are named inside a project directory. */
  file: 'uuid.jsonl' | 'context.jsonl-subdir' | 'timestamp_uuid.jsonl';
}

export interface ProviderConfig {
  id: CliProvider;
  name: string;
  command: string;
  newArgs: string[];
  resumeArgs: (sessionId: string) => string[];
  homeDir: string;
  /** Whether the CLI accepts an initial prompt as a positional argument on launch. */
  supportsPrompt?: boolean;
  /** Session storage layout; undefined means sessions cannot be indexed (yet). */
  sessionLayout?: SessionLayout;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    newArgs: ['--dangerously-skip-permissions'],
    resumeArgs: (id) => ['--dangerously-skip-permissions', '--resume', id],
    supportsPrompt: true,
    homeDir: join(homedir(), '.claude'),
    sessionLayout: { projectsDir: 'projects', encoding: 'dash', file: 'uuid.jsonl' },
  },
  {
    id: 'qoder',
    name: 'Qoder CLI',
    command: 'qodercli',
    newArgs: ['--dangerously-skip-permissions'],
    resumeArgs: (id) => ['--dangerously-skip-permissions', '--resume', id],
    homeDir: join(homedir(), '.qoder'),
    sessionLayout: { projectsDir: 'projects', encoding: 'dash', file: 'uuid.jsonl' },
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    newArgs: [],
    resumeArgs: (id) => ['resume', id],
    supportsPrompt: true,
    homeDir: join(homedir(), '.codex'),
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    command: 'kimi',
    newArgs: [],
    resumeArgs: (id) => ['--resume', id],
    supportsPrompt: true,
    homeDir: join(homedir(), '.kimi'),
    sessionLayout: { projectsDir: 'sessions', encoding: 'md5', file: 'context.jsonl-subdir' },
  },
  {
    id: 'pi',
    name: 'Pi CLI',
    command: 'pi',
    newArgs: [],
    // Pi file names are `<timestamp>_<uuid>.jsonl`; strip the timestamp prefix for resume.
    resumeArgs: (id) => ['--resume', id.includes('_') ? id.slice(id.indexOf('_') + 1) : id],
    homeDir: join(homedir(), '.pi'),
    sessionLayout: { projectsDir: 'agent/sessions', encoding: 'double-dash', file: 'timestamp_uuid.jsonl' },
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
    sessionLayout: { projectsDir: 'projects', encoding: 'dash-no-prefix', file: 'uuid.jsonl' },
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
