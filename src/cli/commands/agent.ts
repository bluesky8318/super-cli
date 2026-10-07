import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { AgentStore, AgentNotFoundError, AgentStateError, isHeadlessProvider } from '../../core/agent-store.js';
import { formatJson } from '../output.js';
import type { AgentProfile, CliProvider } from '../../core/types.js';

function fail(err: unknown): never {
  if (err instanceof AgentNotFoundError || err instanceof AgentStateError) {
    console.error(formatJson({ error: { code: err.code, message: err.message } }));
    process.exit(1);
  }
  throw err;
}

function formatAgentTable(agents: AgentProfile[]): string {
  if (agents.length === 0) return chalk.dim('No agents found.');
  const table = new Table({
    head: ['ID', 'Name', 'Provider', 'Headless', 'Model', 'Working Dir'],
    style: { head: ['cyan'] },
    colWidths: [10, 24, 14, 10, 20, 30],
    wordWrap: true,
  });
  for (const a of agents) {
    table.push([
      a.id.slice(0, 8),
      a.builtin ? `${a.name} ${chalk.dim('(内置)')}` : a.name,
      a.provider,
      isHeadlessProvider(a.provider) ? chalk.green('✓') : chalk.dim('✗'),
      a.model ?? chalk.dim('-'),
      a.workingDir ?? chalk.dim('-'),
    ]);
  }
  return table.toString();
}

function formatAgentDetail(agent: AgentProfile): string {
  return [
    chalk.bold(`${agent.name}  ${chalk.dim(agent.id)}`),
    '',
    `  ${chalk.cyan('Provider:')}  ${agent.provider}${isHeadlessProvider(agent.provider) ? ' (headless ✓)' : ''}`,
    `  ${chalk.cyan('Model:')}     ${agent.model ?? '-'}`,
    `  ${chalk.cyan('Work dir:')}  ${agent.workingDir ?? '-'}`,
    `  ${chalk.cyan('Args:')}      ${agent.extraArgs?.length ? agent.extraArgs.join(' ') : '-'}`,
    `  ${chalk.cyan('Env:')}       ${agent.env ? Object.keys(agent.env).join(', ') : '-'}`,
    `  ${chalk.cyan('Builtin:')}   ${agent.builtin ? 'yes' : 'no'}`,
    `  ${chalk.cyan('Created:')}   ${agent.createdAt}`,
    `  ${chalk.cyan('Updated:')}   ${agent.updatedAt}`,
  ].join('\n');
}

function collectArgs(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function collectEnv(value: string, previous: Record<string, string>): Record<string, string> {
  const idx = value.indexOf('=');
  if (idx <= 0) throw new AgentStateError(`Invalid --env entry (expected KEY=VALUE): ${value}`);
  previous[value.slice(0, idx)] = value.slice(idx + 1);
  return previous;
}

export function registerAgentCommand(program: Command): void {
  const agent = program
    .command('agent')
    .description('Manage agent launch profiles (interactive + headless)');

  agent
    .command('list')
    .description('List agent profiles')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const store = new AgentStore();
      const agents = await store.listAgents();
      console.log(opts.json ? formatJson(agents) : formatAgentTable(agents));
    });

  agent
    .command('add')
    .description('Add an agent profile (provider comes from the global --provider option)')
    .requiredOption('--name <name>', 'Profile name')
    .option('--model <model>', 'Model override')
    .option('--dir <path>', 'Default working directory')
    .option('--arg <arg>', 'Extra CLI arg (repeatable)', collectArgs, [] as string[])
    .option('--env <kv>', 'Extra env var KEY=VALUE (repeatable)', collectEnv, {} as Record<string, string>)
    .option('--json', 'Output as JSON')
    .action(async (opts, cmd) => {
      const store = new AgentStore();
      try {
        // The root program owns --provider; a same-named subcommand option would be shadowed.
        const provider = cmd.parent?.parent?.opts()?.provider as CliProvider | undefined;
        if (!provider) throw new AgentStateError('Provider is required: pass --provider <claude-code|codex|pi|...>');
        const created = await store.createAgent({
          name: opts.name,
          provider,
          model: opts.model,
          workingDir: opts.dir,
          extraArgs: opts.arg.length > 0 ? opts.arg : undefined,
          env: Object.keys(opts.env).length > 0 ? opts.env : undefined,
        });
        console.log(opts.json ? formatJson(created) : `Created agent ${chalk.bold(created.name)} ${chalk.dim(created.id.slice(0, 8))}`);
      } catch (err) {
        fail(err);
      }
    });

  agent
    .command('show <idOrName>')
    .description('Show agent profile detail')
    .option('--json', 'Output as JSON')
    .action(async (idOrName: string, opts) => {
      const store = new AgentStore();
      try {
        const found = await store.getAgent(idOrName);
        console.log(opts.json ? formatJson(found) : formatAgentDetail(found));
      } catch (err) {
        fail(err);
      }
    });

  agent
    .command('edit <idOrName>')
    .description('Edit an agent profile')
    .option('--name <name>', 'New name')
    .option('--model <model>', 'Model override (empty string clears)')
    .option('--dir <path>', 'Working directory (empty string clears)')
    .option('--arg <arg>', 'Extra CLI arg, replaces existing (repeatable)', collectArgs, [] as string[])
    .option('--clear-args', 'Clear extra args')
    .option('--json', 'Output as JSON')
    .action(async (idOrName: string, opts) => {
      const store = new AgentStore();
      try {
        const updated = await store.updateAgent(idOrName, {
          name: opts.name,
          model: opts.model === '' ? null : opts.model,
          workingDir: opts.dir === '' ? null : opts.dir,
          extraArgs: opts.clearArgs ? null : opts.arg.length > 0 ? opts.arg : undefined,
        });
        console.log(opts.json ? formatJson(updated) : formatAgentDetail(updated));
      } catch (err) {
        fail(err);
      }
    });

  agent
    .command('remove <idOrName>')
    .description('Remove an agent profile (builtin profiles cannot be removed)')
    .action(async (idOrName: string) => {
      const store = new AgentStore();
      try {
        const found = await store.getAgent(idOrName);
        await store.removeAgent(idOrName);
        console.log(formatJson({ success: true, removed: found.name }));
      } catch (err) {
        fail(err);
      }
    });
}
