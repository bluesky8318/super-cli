import { Command } from 'commander';
import { SessionIndex } from '../../core/session-index.js';
import { TaskStore } from '../../core/task-store.js';
import chalk from 'chalk';

export function registerNameCommand(program: Command): void {
  program
    .command('name <session-id> [label]')
    .description('Name/label a session')
    .option('--remove', 'Remove label')
    .option('--tag <tag>', 'Add a tag')
    .option('--untag <tag>', 'Remove a tag')
    .option('--json', 'Output as JSON')
    .action(async (sessionId: string, label: string | undefined, opts) => {
      const index = new SessionIndex();
      const taskStore = new TaskStore();

      const meta = await index.findSessionByPrefix(sessionId);
      if (!meta) {
        console.error(chalk.red(`Session not found: ${sessionId}`));
        process.exit(1);
      }

      const fullId = meta.sessionId;

      if (opts.remove) {
        await taskStore.removeLabel(fullId);
        console.log(chalk.green(`Label removed from ${fullId.slice(0, 8)}`));
        return;
      }

      if (opts.tag) {
        await taskStore.addTag(fullId, opts.tag);
        console.log(chalk.green(`Tag "${opts.tag}" added to ${fullId.slice(0, 8)}`));
        return;
      }

      if (opts.untag) {
        await taskStore.removeTag(fullId, opts.untag);
        console.log(chalk.green(`Tag "${opts.untag}" removed from ${fullId.slice(0, 8)}`));
        return;
      }

      if (!label) {
        const existing = await taskStore.getLabel(fullId);
        if (existing) {
          if (opts.json) {
            console.log(JSON.stringify(existing, null, 2));
          } else {
            console.log(`${chalk.cyan('Label:')} ${existing.label}`);
            if (existing.tags?.length) console.log(`${chalk.cyan('Tags:')} ${existing.tags.join(', ')}`);
          }
        } else {
          console.log(chalk.dim('No label set.'));
        }
        return;
      }

      await taskStore.setLabel(fullId, label);
      console.log(chalk.green(`Labeled ${fullId.slice(0, 8)} as "${label}"`));
    });
}
