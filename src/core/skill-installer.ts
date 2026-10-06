import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { CliProvider } from './types.js';
import { getProviderHome, getProvider } from './providers.js';
import { ISSUE_SKILL_MD, ISSUE_SKILL_NAME } from './issue-skill.js';

export type SkillScope = 'global' | 'project';

export interface BundledSkill {
  name: string;
  files: Record<string, string>;
}

export interface AgentSkillStatus {
  provider: CliProvider;
  name: string;
  detected: boolean;
  globalPath: string;
  globalInstalled: boolean;
  projectPath: string;
  projectInstalled: boolean;
}

// Bundled skills shipped with super-cli. Source of truth lives in skills/<name>/.
export function listBundledSkills(): BundledSkill[] {
  return [{ name: ISSUE_SKILL_NAME, files: { 'SKILL.md': ISSUE_SKILL_MD } }];
}

export function getProjectSkillsRoot(provider: CliProvider, cwd: string): string {
  // Project-local skills dir mirrors the provider's home dir name (~/.<x> -> .<x>).
  const dirName = basename(getProviderHome(provider));
  return join(cwd, dirName, 'skills');
}

export function skillTargetPath(provider: CliProvider, skillName: string, scope: SkillScope, cwd: string = process.cwd()): string {
  return scope === 'global'
    ? join(getProviderHome(provider), 'skills', skillName)
    : join(getProjectSkillsRoot(provider, cwd), skillName);
}

export function skillStatus(providers: CliProvider[], cwd: string = process.cwd()): AgentSkillStatus[] {
  const skill = listBundledSkills()[0];
  return providers.map(id => {
    const globalPath = skillTargetPath(id, skill.name, 'global', cwd);
    const projectPath = skillTargetPath(id, skill.name, 'project', cwd);
    return {
      provider: id,
      name: getProvider(id).name,
      detected: existsSync(getProviderHome(id)),
      globalPath,
      globalInstalled: existsSync(join(globalPath, 'SKILL.md')),
      projectPath,
      projectInstalled: existsSync(join(projectPath, 'SKILL.md')),
    };
  });
}

export interface InstallResult {
  provider: CliProvider;
  path: string;
  status: 'installed' | 'uninstalled' | 'skipped';
  reason?: string;
}

export async function installSkill(skillName: string, providers: CliProvider[], scope: SkillScope, cwd: string = process.cwd()): Promise<InstallResult[]> {
  const skill = listBundledSkills().find(s => s.name === skillName);
  if (!skill) throw new Error(`Unknown bundled skill: ${skillName}`);

  const results: InstallResult[] = [];
  for (const id of providers) {
    if (scope === 'global' && !existsSync(getProviderHome(id))) {
      results.push({ provider: id, path: skillTargetPath(id, skillName, scope, cwd), status: 'skipped', reason: 'home dir not found' });
      continue;
    }
    const dir = skillTargetPath(id, skillName, scope, cwd);
    await mkdir(dir, { recursive: true });
    for (const [file, content] of Object.entries(skill.files)) {
      await writeFile(join(dir, file), content, 'utf-8');
    }
    results.push({ provider: id, path: dir, status: 'installed' });
  }
  return results;
}

export async function uninstallSkill(skillName: string, providers: CliProvider[], scope: SkillScope, cwd: string = process.cwd()): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const id of providers) {
    const dir = skillTargetPath(id, skillName, scope, cwd);
    if (!existsSync(dir)) {
      results.push({ provider: id, path: dir, status: 'skipped', reason: 'not installed' });
      continue;
    }
    await rm(dir, { recursive: true, force: true });
    results.push({ provider: id, path: dir, status: 'uninstalled' });
  }
  return results;
}
