import { Command } from 'commander';
import { SessionSearch } from '../../core/session-search.js';
import { formatSearchResults } from '../output.js';


export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search across sessions')
    .option('-p, --project <path>', 'Filter by project path')
    .option('-s, --since <date>', 'Search sessions since date')
    .option('-m, --max <n>', 'Maximum results', '50')
    .option('--case-sensitive', 'Case-sensitive search')
    .option('--json', 'Output as JSON')
    .action(async (query: string, opts) => {
      const search = new SessionSearch();
      const results = await search.search(query, {
        project: opts.project,
        since: opts.since ? new Date(opts.since) : undefined,
        maxResults: parseInt(opts.max),
        caseSensitive: opts.caseSensitive,
      });

      console.log(formatSearchResults(results, { json: opts.json }));
    });
}
