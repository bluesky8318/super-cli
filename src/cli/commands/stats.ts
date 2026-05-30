import { Command } from 'commander';
import { SessionIndex } from '../../core/session-index.js';
import { formatJson } from '../output.js';
import chalk from 'chalk';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Show usage statistics')
    .option('-p, --project <path>', 'Filter by project')
    .option('--daily', 'Show daily breakdown')
    .option('--model', 'Show model usage')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const index = new SessionIndex();
      const sessions = await index.getAllSessions({ project: opts.project });

      const stats = {
        totalSessions: sessions.length,
        totalUserMessages: sessions.reduce((s, m) => s + m.userMessageCount, 0),
        totalAssistantMessages: sessions.reduce((s, m) => s + m.assistantMessageCount, 0),
        totalInputTokens: sessions.reduce((s, m) => s + m.totalInputTokens, 0),
        totalOutputTokens: sessions.reduce((s, m) => s + m.totalOutputTokens, 0),
        models: countBy(sessions.flatMap(s => s.models)),
        projects: countBy(sessions.map(s => s.project)),
      };

      if (opts.json) {
        console.log(formatJson(stats));
        return;
      }

      console.log(chalk.bold('Statistics'));
      console.log(`  ${chalk.cyan('Sessions:')}          ${stats.totalSessions}`);
      console.log(`  ${chalk.cyan('User messages:')}     ${stats.totalUserMessages}`);
      console.log(`  ${chalk.cyan('Assistant messages:')} ${stats.totalAssistantMessages}`);
      console.log(`  ${chalk.cyan('Input tokens:')}      ${stats.totalInputTokens.toLocaleString()}`);
      console.log(`  ${chalk.cyan('Output tokens:')}     ${stats.totalOutputTokens.toLocaleString()}`);

      if (opts.model) {
        console.log(chalk.bold('\nModel Usage:'));
        for (const [model, count] of Object.entries(stats.models).sort((a, b) => b[1] - a[1])) {
          console.log(`  ${chalk.cyan(model)}: ${count} sessions`);
        }
      }

      if (opts.daily) {
        console.log(chalk.bold('\nRecent Activity (last 7 days):'));
        const daily = getDailyBreakdown(sessions);
        for (const [date, count] of daily.slice(-7)) {
          console.log(`  ${chalk.dim(date)}: ${count} sessions`);
        }
      }
    });
}

function countBy(items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
}

function getDailyBreakdown(sessions: { lastTimestamp?: string }[]): [string, number][] {
  const daily = new Map<string, number>();
  for (const s of sessions) {
    if (!s.lastTimestamp) continue;
    const date = s.lastTimestamp.slice(0, 10);
    daily.set(date, (daily.get(date) ?? 0) + 1);
  }
  return [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
