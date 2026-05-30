import { Command } from 'commander';
import chalk from 'chalk';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start web server')
    .option('-p, --port <n>', 'Port number', '3000')
    .option('--host <host>', 'Host to bind', '0.0.0.0')
    .option('--open', 'Open browser after start')
    .action(async (opts) => {
      const port = parseInt(opts.port);
      const host = opts.host;

      const { startServer } = await import('../../server/index.js');
      await startServer({ port, host });
      const url = `http://localhost:${port}`;
      console.log(chalk.green(`Server running at ${url}`));

      if (opts.open) {
        const { default: open } = await import('open');
        await open(url);
      }
    });
}
