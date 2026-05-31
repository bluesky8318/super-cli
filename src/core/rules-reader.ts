import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { CliProvider, RuleFile } from './types.js';
import { getAvailableProviders, getProviderHome } from './providers.js';

interface RuleFileSpec {
  name: string;
  relativePath: string;
  provider: CliProvider;
  scope: 'global' | 'project';
}

function getGlobalRuleSpecs(): RuleFileSpec[] {
  const specs: RuleFileSpec[] = [];
  const available = getAvailableProviders();
  for (const p of available) {
    if (p.id === 'claude-code') {
      specs.push({ name: 'CLAUDE.md', relativePath: 'CLAUDE.md', provider: 'claude-code', scope: 'global' });
    } else if (p.id === 'qoder') {
      specs.push({ name: 'AGENTS.md', relativePath: 'AGENTS.md', provider: 'qoder', scope: 'global' });
    }
  }
  return specs;
}

const PROJECT_RULE_FILES = ['CLAUDE.md', 'agents.md', '.cursorrules', '.github/copilot-instructions.md'];

export async function getRuleFiles(provider?: CliProvider, projectPath?: string): Promise<RuleFile[]> {
  const results: RuleFile[] = [];

  const globalSpecs = getGlobalRuleSpecs().filter(s => !provider || s.provider === provider);
  for (const spec of globalSpecs) {
    const fullPath = join(getProviderHome(spec.provider), spec.relativePath);
    results.push({
      id: `${spec.provider}:global:${spec.name}`,
      name: spec.name,
      path: fullPath,
      provider: spec.provider,
      scope: 'global',
      exists: existsSync(fullPath),
    });
  }

  if (projectPath) {
    for (const file of PROJECT_RULE_FILES) {
      const fullPath = join(projectPath, file);
      const mainProvider = provider ?? 'claude-code';
      results.push({
        id: `${mainProvider}:project:${file}`,
        name: file,
        path: fullPath,
        provider: mainProvider,
        scope: 'project',
        exists: existsSync(fullPath),
      });
    }
  }

  return results;
}

export async function getRuleContent(filePath: string): Promise<string> {
  if (!existsSync(filePath)) return '';
  return readFile(filePath, 'utf-8');
}

export async function saveRuleContent(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}
