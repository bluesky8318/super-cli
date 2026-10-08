#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { registerListCommand } from './commands/list.js';
import { registerShowCommand } from './commands/show.js';
import { registerSearchCommand } from './commands/search.js';
import { registerNameCommand } from './commands/name.js';
import { registerTasksCommand } from './commands/tasks.js';
import { registerIssueCommand } from './commands/issue.js';
import { registerIdeaCommands } from './commands/idea.js';
import { registerAgentCommand } from './commands/agent.js';
import { registerSkillCommand } from './commands/skill.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerConfigCommand } from './commands/config.js';
import { registerServeCommand } from './commands/serve.js';

// Read version from package.json at runtime (dist/cli/index.js -> package root).
const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

const program = new Command();

program
  .name('super-cli')
  .description('Multi-CLI session management tool (Claude Code, Qoder, Codex)')
  .version(pkg.version)
  .option('--provider <name>', 'Filter by CLI provider (claude-code, qoder, codex)');

registerListCommand(program);
registerShowCommand(program);
registerSearchCommand(program);
registerNameCommand(program);
registerTasksCommand(program);
registerIssueCommand(program);
registerIdeaCommands(program);
registerAgentCommand(program);
registerSkillCommand(program);
registerStatsCommand(program);
registerConfigCommand(program);
registerServeCommand(program);

program.parse();
