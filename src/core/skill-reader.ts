import { readdir, readFile, rm, cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CliProvider, SkillInfo } from './types.js';
import { getAvailableProviders, getProviderHome } from './providers.js';

function parseYamlFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && val) result[key] = val;
    }
  }
  return result;
}

function getGlobalSkillsDir(provider: CliProvider): string {
  return join(getProviderHome(provider), 'skills');
}

function getProjectSkillsDir(provider: CliProvider, projectPath: string): string {
  const dirName = provider === 'claude-code' ? '.claude' : provider === 'qoder' ? '.qoder' : '.codex';
  return join(projectPath, dirName, 'skills');
}

async function scanSkillsDir(dir: string, provider: CliProvider, scope: 'global' | 'project'): Promise<SkillInfo[]> {
  if (!existsSync(dir)) return [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const results: SkillInfo[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const skillDir = join(dir, entry);
    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    try {
      const content = await readFile(skillFile, 'utf-8');
      const meta = parseYamlFrontmatter(content);
      results.push({
        id: entry,
        name: meta.name || entry,
        version: meta.version,
        description: meta.description,
        provider,
        scope,
        directory: skillDir,
      });
    } catch {
      results.push({
        id: entry,
        name: entry,
        provider,
        scope,
        directory: skillDir,
      });
    }
  }
  return results;
}

export async function getSkills(provider?: CliProvider, projectPath?: string): Promise<SkillInfo[]> {
  const providers = provider
    ? [{ id: provider, homeDir: getProviderHome(provider) }]
    : getAvailableProviders();

  const results: SkillInfo[] = [];

  for (const p of providers) {
    const globalDir = join(p.homeDir, 'skills');
    const globalSkills = await scanSkillsDir(globalDir, p.id as CliProvider, 'global');
    results.push(...globalSkills);

    if (projectPath) {
      const projDir = getProjectSkillsDir(p.id as CliProvider, projectPath);
      const projSkills = await scanSkillsDir(projDir, p.id as CliProvider, 'project');
      results.push(...projSkills);
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSkillContent(provider: CliProvider, id: string, scope?: 'global' | 'project', projectPath?: string): Promise<string> {
  if (scope === 'project' && projectPath) {
    const projDir = getProjectSkillsDir(provider, projectPath);
    const skillFile = join(projDir, id, 'SKILL.md');
    return readFile(skillFile, 'utf-8');
  }
  const skillFile = join(getGlobalSkillsDir(provider), id, 'SKILL.md');
  return readFile(skillFile, 'utf-8');
}

export async function deleteSkill(provider: CliProvider, id: string, scope?: 'global' | 'project', projectPath?: string): Promise<void> {
  let skillDir: string;
  if (scope === 'project' && projectPath) {
    skillDir = join(getProjectSkillsDir(provider, projectPath), id);
  } else {
    skillDir = join(getGlobalSkillsDir(provider), id);
  }
  await rm(skillDir, { recursive: true, force: true });
}

export async function copySkill(fromProvider: CliProvider, toProvider: CliProvider, id: string): Promise<void> {
  const srcDir = join(getGlobalSkillsDir(fromProvider), id);
  const destDir = join(getGlobalSkillsDir(toProvider), id);
  if (!existsSync(srcDir)) throw new Error(`Skill not found: ${id}`);
  const destParent = getGlobalSkillsDir(toProvider);
  if (!existsSync(destParent)) await mkdir(destParent, { recursive: true });
  await cp(srcDir, destDir, { recursive: true });
}
