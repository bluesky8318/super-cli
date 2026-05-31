import { Command } from 'commander';
import type { CliProvider } from '../../core/types.js';
import { SessionIndex } from '../../core/session-index.js';
import { formatSessionList } from '../output.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List all sessions')
    .option('-p, --project <path>', 'Filter by project path')
    .option('-s, --since <date>', 'Show sessions since date (YYYY-MM-DD)')
    .option('-u, --until <date>', 'Show sessions until date (YYYY-MM-DD)')
    .option('-b, --branch <name>', 'Filter by git branch')
    .option('-l, --limit <n>', 'Limit results', '20')
    .option('--offset <n>', 'Skip first N results', '0')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const globalOpts = program.opts();
      const index = new SessionIndex();
      const sessions = await index.getAllSessions({
        provider: globalOpts.provider as CliProvider | undefined,
        project: opts.project,
        since: opts.since ? new Date(opts.since) : undefined,
        until: opts.until ? new Date(opts.until) : undefined,
        branch: opts.branch,
        limit: parseInt(opts.limit),
        offset: parseInt(opts.offset),
      });

      console.log(formatSessionList(sessions, { json: opts.json }));
    });
}
