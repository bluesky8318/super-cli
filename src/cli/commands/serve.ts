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

      try {
        const { startServer } = await import('../../server/index.js');
        await startServer({ port, host });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          console.error(chalk.red(`端口 ${port} 已被占用 — 可能有一个旧的 super-cli serve 进程仍在运行。`));
          console.error(chalk.yellow(`停止旧进程后重试：lsof -ti :${port} | xargs kill`));
          process.exit(1);
        }
        throw err;
      }
      const url = `http://localhost:${port}`;
      console.log(chalk.green(`Server running at ${url}`));

      if (opts.open) {
        const { default: open } = await import('open');
        await open(url);
      }
    });
}
