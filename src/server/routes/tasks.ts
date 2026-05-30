import type { FastifyInstance } from 'fastify';
import { TaskStore } from '../../core/task-store.js';
import { SessionIndex } from '../../core/session-index.js';

export function registerTaskRoutes(app: FastifyInstance): void {
  const taskStore = new TaskStore();
  const index = new SessionIndex();

  app.get('/api/tasks', async (req) => {
    const query = req.query as Record<string, string>;
    const labels = await taskStore.getAll();
    await index.buildIndex();

    const tasks = [];
    for (const [sessionId, taskLabel] of Object.entries(labels)) {
      if (query.tag && !taskLabel.tags?.includes(query.tag)) continue;
      const meta = await index.getSession(sessionId);
      if (meta) {
        meta.label = taskLabel.label;
        meta.tags = taskLabel.tags;
        tasks.push(meta);
      }
    }

    tasks.sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
    return { tasks, total: tasks.length };
  });

  app.put('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { label?: string; tags?: string[] };

    const session = await index.findSessionByPrefix(id);
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    if (body.label) {
      await taskStore.setLabel(session.sessionId, body.label);
    }
    if (body.tags) {
      for (const tag of body.tags) {
        await taskStore.addTag(session.sessionId, tag);
      }
    }

    return { success: true, sessionId: session.sessionId };
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await index.findSessionByPrefix(id);
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    await taskStore.removeLabel(session.sessionId);
    return { success: true };
  });
}
