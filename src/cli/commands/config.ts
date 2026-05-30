import { Command } from 'commander';
import { ConfigManager } from '../../core/config.js';
import { formatJson } from '../output.js';
import chalk from 'chalk';

export function registerConfigCommand(program: Command): void {
  const cmd = program
    .command('config')
    .description('Manage configuration');

  cmd
    .command('show')
    .description('Show all settings')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const config = new ConfigManager();
      const all = await config.getAll();
      if (opts.json) {
        console.log(formatJson(all));
      } else {
        console.log(chalk.bold('Configuration'));
        console.log(`  ${chalk.cyan('Path:')} ${config.getConfigPath()}`);
        for (const [key, value] of Object.entries(all)) {
          console.log(`  ${chalk.cyan(key + ':')} ${JSON.stringify(value)}`);
        }
      }
    });

  cmd
    .command('set <key> <value>')
    .description('Set a config value')
    .action(async (key: string, value: string) => {
      const config = new ConfigManager();
      let parsed: unknown = value;
      try { parsed = JSON.parse(value); } catch { /* use string */ }
      await config.set(key, parsed);
      console.log(chalk.green(`Set ${key} = ${JSON.stringify(parsed)}`));
    });

  cmd
    .command('get <key>')
    .description('Get a config value')
    .action(async (key: string) => {
      const config = new ConfigManager();
      const value = await config.get(key);
      console.log(value !== undefined ? JSON.stringify(value) : chalk.dim('(not set)'));
    });

  cmd
    .command('path')
    .description('Show config file path')
    .action(() => {
      const config = new ConfigManager();
      console.log(config.getConfigPath());
    });
}
