import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerProjectRoutes } from './routes/projects.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startServer(options: { port: number; host: string }): Promise<string> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  registerSessionRoutes(app);
  registerTaskRoutes(app);
  registerStatsRoutes(app);
  registerProjectRoutes(app);

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
