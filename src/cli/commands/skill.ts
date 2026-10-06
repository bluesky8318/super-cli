import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import type { CliProvider } from '../../core/types.js';
import { getAllProviders, getProvider } from '../../core/providers.js';
import {
  installSkill,
  listBundledSkills,
  skillStatus,
  uninstallSkill,
  type InstallResult,
  type SkillScope,
} from '../../core/skill-installer.js';
import { ISSUE_SKILL_NAME } from '../../core/issue-skill.js';
import { formatJson } from '../output.js';

interface SkillOpts {
  agent?: string;
  global?: boolean;
  project?: boolean;
  yes?: boolean;
  json?: boolean;
}

function parseAgents(value?: string): CliProvider[] | null {
  if (!value) return null;
  return value.split(',').map(s => getProvider(s.trim() as CliProvider).id);
}

function resolveScope(opts: SkillOpts): SkillScope {
  return opts.project ? 'project' : 'global';
}

// Interactive multi-select, modeled on `npx skills add`: numbered agent list,
// comma-separated indexes, empty input = all detected agents.
async function promptAgents(candidates: { id: CliProvider; name: string }[]): Promise<CliProvider[]> {
  console.log('检测到以下 agent：');
  candidates.forEach((c, i) => console.log(`  ${chalk.cyan(String(i + 1))}. ${c.name} (${c.id})`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => rl.question('选择要安装的 agent（逗号分隔序号，回车 = 全部）: ', resolve));
  rl.close();
  const picked = answer.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < candidates.length);
  return picked.length > 0 ? picked.map(i => candidates[i].id) : candidates.map(c => c.id);
}

async function resolveTargetAgents(opts: SkillOpts): Promise<CliProvider[]> {
  const explicit = parseAgents(opts.agent);
  if (explicit) return explicit;
  const statuses = skillStatus(getAllProviders().map(p => p.id));
  const detected = statuses.filter(s => s.detected).map(s => ({ id: s.provider, name: s.name }));
  // Non-interactive contexts (agents, pipes, -y) install to every detected agent.
  if (opts.yes || !process.stdin.isTTY || opts.json) {
    return detected.map(d => d.id);
  }
  return promptAgents(detected);
}

function printResults(results: InstallResult[], json?: boolean): void {
  if (json) {
    console.log(formatJson({ skill: ISSUE_SKILL_NAME, results }));
    return;
  }
  for (const r of results) {
    const mark = r.status === 'skipped' ? chalk.dim('-') : chalk.green('✓');
    const suffix = r.status === 'skipped' ? chalk.dim(` (${r.reason})`) : '';
    console.log(`${mark} ${r.provider}: ${r.path}${suffix}`);
  }
}

export function registerSkillCommand(program: Command): void {
  const skill = program
    .command('skill')
    .description('Manage bundled agent skills (install into AI agent skills directories)');

  skill
    .command('list')
    .alias('ls')
    .description('List bundled skills and their install status per detected agent')
    .option('--json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      const skills = listBundledSkills();
      const statuses = skillStatus(getAllProviders().map(p => p.id));
      if (opts.json) {
        console.log(formatJson({ skills: skills.map(s => s.name), agents: statuses }));
        return;
      }
      for (const s of skills) {
        console.log(chalk.bold(s.name));
        console.log(chalk.dim('  Issue 看板认领工作流（见 skills/' + s.name + '/SKILL.md）'));
        for (const st of statuses) {
          const marks = [
            st.globalInstalled ? chalk.green('global') : chalk.dim('global ✗'),
            st.projectInstalled ? chalk.green('project') : chalk.dim('project ✗'),
          ].join('  ');
          console.log(`  ${st.detected ? '●' : chalk.dim('○')} ${st.name.padEnd(14)} ${marks}`);
        }
      }
      console.log(chalk.dim('\n● = 检测到 home 目录    global/project = 该范围已安装'));
    });

  skill
    .command('install')
    .description('Install bundled skills into agent skills directories')
    .option('--agent <agents>', 'Comma-separated agent ids (claude-code,codex,...)')
    .option('-g, --global', 'Install globally (default)')
    .option('--project', 'Install into the current project (.<provider>/skills/)')
    .option('-y, --yes', 'Skip interactive selection, install to all detected agents')
    .option('--json', 'Output as JSON')
    .action(async (opts: SkillOpts) => {
      const agents = await resolveTargetAgents(opts);
      const scope = resolveScope(opts);
      const results = await installSkill(ISSUE_SKILL_NAME, agents, scope);
      printResults(results, opts.json);
    });

  skill
    .command('uninstall')
    .description('Remove bundled skills from agent skills directories')
    .option('--agent <agents>', 'Comma-separated agent ids')
    .option('-g, --global', 'Remove from global scope (default)')
    .option('--project', 'Remove from the current project')
    .option('-y, --yes', 'Skip interactive selection')
    .option('--json', 'Output as JSON')
    .action(async (opts: SkillOpts) => {
      const agents = await resolveTargetAgents(opts);
      const scope = resolveScope(opts);
      const results = await uninstallSkill(ISSUE_SKILL_NAME, agents, scope);
      printResults(results, opts.json);
    });

  skill
    .command('path')
    .description('Print skill install target paths per agent')
    .option('--json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      const targets = skillStatus(getAllProviders().map(p => p.id)).map(s => ({
        provider: s.provider,
        global: s.globalPath,
        project: s.projectPath,
      }));
      if (opts.json) {
        console.log(formatJson({ skill: ISSUE_SKILL_NAME, targets }));
        return;
      }
      for (const t of targets) {
        console.log(`${t.provider}:`);
        console.log(`  global  ${t.global}`);
        console.log(`  project ${t.project}`);
      }
    });
}
