import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CliProvider } from './types.js';
import { getProvider, getProviderHome } from './providers.js';

export function getClaudeHome(): string {
  return join(homedir(), '.claude');
}

export function getCliHome(provider: CliProvider): string {
  return getProviderHome(provider);
}

export function getProjectsDir(provider: CliProvider = 'claude-code'): string {
  const layout = getProvider(provider).sessionLayout;
  return join(getCliHome(provider), layout?.projectsDir ?? 'projects');
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

export function getSuperCliIssuesPath(): string {
  return join(getSuperCliHome(), 'issues.json');
}

export function getSuperCliIdeasPath(): string {
  return join(getSuperCliHome(), 'ideas.json');
}

export function getSuperCliAgentsPath(): string {
  return join(getSuperCliHome(), 'agents.json');
}

export function getSuperCliRunsDir(): string {
  return join(getSuperCliHome(), 'runs');
}

export function decodeProjectPath(encoded: string, provider: CliProvider = 'claude-code'): string {
  const encoding = getProvider(provider).sessionLayout?.encoding ?? 'dash';
  switch (encoding) {
    case 'dash':
      if (!encoded.startsWith('-')) return encoded;
      return encoded.replace(/-/g, '/').replace(/^\//, '/');
    case 'dash-no-prefix':
      return '/' + encoded.replace(/-/g, '/');
    case 'double-dash': {
      const inner = encoded.replace(/^--/, '').replace(/--$/, '');
      return '/' + inner.replace(/-/g, '/');
    }
    case 'md5':
      // One-way hash; the caller must resolve via the provider's mapping file.
      return encoded;
  }
}

/** Best-effort decode when the encoding provider is unknown (e.g. issue.projectEncoded). */
export function decodeAnyProjectPath(encoded: string): string {
  if (encoded.startsWith('--')) return decodeProjectPath(encoded, 'pi');
  if (/^[0-9a-f]{32}$/.test(encoded)) return encoded; // kimi md5: undecodable
  if (encoded.startsWith('-')) return decodeProjectPath(encoded, 'claude-code');
  if (encoded.includes('/')) return encoded; // already decoded
  return decodeProjectPath(encoded, 'workbuddy');
}

/**
 * Resolve an issue's stored project identity to an existing absolute path.
 * Dash encoding is lossy for dirs containing '-' (e.g. super-cli → super/cli),
 * so we verify candidates on disk and fall back to the session index's
 * alias map (encoded/aliases → verified decoded path).
 */
export function resolveIssueProjectPath(
  encoded: string,
  aliasMap?: Map<string, string>,
): string | null {
  const candidates: string[] = [];
  if (encoded.startsWith('/')) candidates.push(encoded);
  const decoded = decodeAnyProjectPath(encoded);
  if (decoded !== encoded) candidates.push(decoded);
  for (const c of candidates) {
    if (c.startsWith('/') && existsSync(c)) return c;
  }
  if (aliasMap) {
    const hit = aliasMap.get(encoded);
    if (hit && existsSync(hit)) return hit;
  }
  return null;
}

export function encodeProjectPath(path: string, provider: CliProvider = 'claude-code'): string {
  const encoding = getProvider(provider).sessionLayout?.encoding ?? 'dash';
  switch (encoding) {
    case 'dash':
      return path.replace(/\//g, '-');
    case 'dash-no-prefix':
      return path.replace(/\//g, '-').replace(/^-/, '');
    case 'double-dash':
      return '--' + path.split('/').filter(Boolean).join('-') + '--';
    case 'md5':
      return createHash('md5').update(path).digest('hex');
  }
}

export function getSessionFilePath(projectEncoded: string, sessionId: string, provider: CliProvider = 'claude-code'): string {
  const layout = getProvider(provider).sessionLayout;
  const dir = join(getProjectsDir(provider), projectEncoded);
  if (layout?.file === 'context.jsonl-subdir') {
    return join(dir, sessionId, 'context.jsonl');
  }
  return join(dir, `${sessionId}.jsonl`);
}

export function getCodexSessionsDir(): string {
  return join(getCliHome('codex'), 'sessions');
}
