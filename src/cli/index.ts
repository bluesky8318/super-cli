#!/usr/bin/env node
import { Command } from 'commander';
import { registerListCommand } from './commands/list.js';
import { registerShowCommand } from './commands/show.js';
import { registerSearchCommand } from './commands/search.js';
import { registerNameCommand } from './commands/name.js';
import { registerTasksCommand } from './commands/tasks.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerConfigCommand } from './commands/config.js';
import { registerServeCommand } from './commands/serve.js';

const program = new Command();

program
  .name('super-cli')
  .description('Multi-CLI session management tool (Claude Code, Qoder, Codex)')
  .version('0.1.0')
  .option('--provider <name>', 'Filter by CLI provider (claude-code, qoder, codex)');

registerListCommand(program);
registerShowCommand(program);
registerSearchCommand(program);
registerNameCommand(program);
registerTasksCommand(program);
registerStatsCommand(program);
registerConfigCommand(program);
registerServeCommand(program);

program.parse();
