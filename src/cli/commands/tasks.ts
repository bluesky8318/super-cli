import { Command } from 'commander';
import { SessionIndex } from '../../core/session-index.js';
import { TaskStore } from '../../core/task-store.js';
import { formatSessionList, formatJson } from '../output.js';

export function registerTasksCommand(program: Command): void {
  program
    .command('tasks')
    .description('List named tasks')
    .option('--tag <tag>', 'Filter by tag')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const index = new SessionIndex();
      const taskStore = new TaskStore();
      const labels = await taskStore.getAll();

      if (Object.keys(labels).length === 0) {
        console.log(opts.json ? '[]' : 'No named tasks. Use "super-cli name <session-id> <label>" to name one.');
        return;
      }

      await index.buildIndex();
      const sessions = [];

      for (const [sessionId, taskLabel] of Object.entries(labels)) {
        if (opts.tag && !taskLabel.tags?.includes(opts.tag)) continue;
        const meta = await index.getSession(sessionId);
        if (meta) {
          meta.label = taskLabel.label;
          meta.tags = taskLabel.tags;
          sessions.push(meta);
        }
      }

      sessions.sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
      console.log(formatSessionList(sessions, { json: opts.json }));
    });
}
