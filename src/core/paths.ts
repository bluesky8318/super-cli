import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CliProvider } from './types.js';
import { getProviderHome } from './providers.js';

export function getClaudeHome(): string {
  return join(homedir(), '.claude');
}

export function getCliHome(provider: CliProvider): string {
  return getProviderHome(provider);
}

export function getProjectsDir(provider: CliProvider = 'claude-code'): string {
  return join(getCliHome(provider), 'projects');
}

export function getSessionsDir(provider: CliProvider = 'claude-code'): string {
  return join(getCliHome(provider), 'sessions');
}

export function getSessionDataDir(): string {
  return join(getClaudeHome(), 'session-data');
}

export function getHistoryPath(provider: CliProvider = 'claude-code'): string {
  return join(getCliHome(provider), 'history.jsonl');
}

export function getStatsCachePath(): string {
  return join(getClaudeHome(), 'stats-cache.json');
}

export function getSuperCliHome(): string {
  return join(homedir(), '.super-cli');
}

export function getSuperCliConfigPath(): string {
  return join(getSuperCliHome(), 'config.json');
}

export function decodeProjectPath(encoded: string): string {
  if (!encoded.startsWith('-')) return encoded;
  return encoded.replace(/-/g, '/').replace(/^\//, '/');
}

export function encodeProjectPath(path: string): string {
  return path.replace(/\//g, '-');
}

export function getSessionFilePath(projectEncoded: string, sessionId: string, provider: CliProvider = 'claude-code'): string {
  return join(getProjectsDir(provider), projectEncoded, `${sessionId}.jsonl`);
}

export function getCodexSessionsDir(): string {
  return join(getCliHome('codex'), 'sessions');
}
