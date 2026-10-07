import type { FastifyInstance, FastifyReply } from 'fastify';
import { IdeaStore, IdeaNotFoundError, IdeaStateError } from '../../core/idea-store.js';
import type { IdeaStatus, IssuePriority } from '../../core/types.js';
import type { EventHub } from '../events.js';

function sendError(reply: FastifyReply, err: unknown): { error: { code: string; message: string } } {
  if (err instanceof IdeaNotFoundError) {
    reply.code(404);
    return { error: { code: err.code, message: err.message } };
  }
  if (err instanceof IdeaStateError) {
    reply.code(400);
    return { error: { code: err.code, message: err.message } };
  }
  throw err;
}

const IDEA_STATUSES: IdeaStatus[] = ['draft', 'incubating', 'promoted', 'abandoned', 'archived'];

export function registerIdeaRoutes(
  app: FastifyInstance,
  ideaStore: IdeaStore,
  hub: EventHub,
): void {
  app.get('/api/ideas', async (req) => {
    const query = req.query as Record<string, string>;
    const ideas = await ideaStore.list({
      status: IDEA_STATUSES.includes(query.status as IdeaStatus) ? query.status as IdeaStatus : undefined,
      category: query.category,
      project: query.project,
      since: query.since,
      until: query.until,
    });
    return { ideas, total: ideas.length };
  });

  app.get('/api/ideas/categories', async () => {
    return { categories: await ideaStore.categories() };
  });

  app.post('/api/ideas', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    try {
      const idea = await ideaStore.create(String(body.content ?? ''));
      hub.emit('idea.created', { ideaId: idea.id, identifier: idea.identifier });
      reply.code(201);
      return { idea };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/ideas/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return { idea: await ideaStore.get(id) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/ideas/:id/categorize', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    try {
      const idea = await ideaStore.categorize(id, String(body.category ?? ''));
      hub.emit('idea.updated', { ideaId: idea.id, identifier: idea.identifier });
      return { idea };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/ideas/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    try {
      const idea = await ideaStore.addComment(id, String(body.body ?? ''));
      hub.emit('idea.updated', { ideaId: idea.id, identifier: idea.identifier });
      reply.code(201);
      return { idea };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/ideas/:id/abandon', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const idea = await ideaStore.setStatus(id, 'abandoned');
      hub.emit('idea.updated', { ideaId: idea.id, identifier: idea.identifier });
      return { idea };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/ideas/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      // Restore goes back to incubating when doc-backed, draft otherwise.
      const current = await ideaStore.get(id);
      const idea = await ideaStore.setStatus(id, current.docPath ? 'incubating' : 'draft');
      hub.emit('idea.updated', { ideaId: idea.id, identifier: idea.identifier });
      return { idea };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/ideas/:id/archive', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const idea = await ideaStore.setStatus(id, 'archived');
      hub.emit('idea.updated', { ideaId: idea.id, identifier: idea.identifier });
      return { idea };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/ideas/:id/promote', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    try {
      const result = await ideaStore.promote(id, {
        title: body.title as string | undefined,
        project: body.project as string | undefined,
        priority: body.priority as IssuePriority | undefined,
      });
      hub.emit('idea.promoted', {
        ideaId: id,
        issueId: result.issueId,
        issueIdentifier: result.issueIdentifier,
      });
      reply.code(201);
      return result;
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
