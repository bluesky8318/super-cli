import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { SessionIndex } from '../core/session-index.js';
import { TaskStore } from '../core/task-store.js';
import { IssueStore } from '../core/issue-store.js';
import { EventHub } from './events.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerIssueRoutes } from './routes/issues.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerRefreshRoute } from './routes/refresh.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startServer(options: { port: number; host: string }): Promise<string> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  const index = new SessionIndex();
  const taskStore = new TaskStore();
  const issueStore = new IssueStore();
  const eventHub = new EventHub();

  registerSessionRoutes(app, index);
  registerTaskRoutes(app, index, taskStore);
  registerIssueRoutes(app, issueStore, eventHub);
  registerStatsRoutes(app, index);
  registerProjectRoutes(app, index);
  registerConfigRoutes(app);
  registerRefreshRoute(app, index);

  const webDir = join(__dirname, '..', 'web');
  if (existsSync(webDir)) {
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      wildcard: true,
    });

    app.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html');
    });
  }

  const address = await app.listen({ port: options.port, host: options.host });
  return address;
}
