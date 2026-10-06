import type { FastifyInstance, FastifyReply } from 'fastify';
import { IssueStore, VersionConflictError, IssueNotFoundError, IssueStateError } from '../../core/issue-store.js';
import type { IssueStatus } from '../../core/types.js';
import type { EventHub } from '../events.js';

function sendError(reply: FastifyReply, err: unknown): { error: { code: string; message: string } } {
  if (err instanceof VersionConflictError) {
    reply.code(409);
    return { error: { code: err.code, message: err.message } };
  }
  if (err instanceof IssueNotFoundError) {
    reply.code(404);
    return { error: { code: err.code, message: err.message } };
  }
  if (err instanceof IssueStateError) {
    reply.code(400);
    return { error: { code: err.code, message: err.message } };
  }
  throw err;
}

function actorFrom(req: { headers: Record<string, unknown> }): 'user' | 'agent' | 'cli' {
  const h = req.headers['x-super-cli-actor'];
  return h === 'agent' || h === 'cli' ? h : 'user';
}

export function registerIssueRoutes(app: FastifyInstance, issueStore: IssueStore, hub: EventHub): void {

  app.get('/api/issues', async (req) => {
    const query = req.query as Record<string, string>;
    const issues = await issueStore.listIssues({
      projectEncoded: query.project,
      status: query.status as IssueStatus | undefined,
      includeArchived: query.archived === 'true',
    });
    const commentCounts = await issueStore.getCommentCounts();
    return { issues: issues.map(i => ({ ...i, commentCount: commentCounts[i.id] ?? 0 })), total: issues.length };
  });

  app.post('/api/issues', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    try {
      const issue = await issueStore.createIssue({
        title: body.title as string,
        projectEncoded: body.projectEncoded as string | undefined,
        description: body.description as string | undefined,
        status: body.status as never,
        priority: body.priority as never,
        labels: body.labels as string[] | undefined,
      }, actorFrom(req));
      hub.emit('issue.created', { issueId: issue.id, identifier: issue.identifier });
      reply.code(201);
      return { issue };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const issue = await issueStore.getIssue(id);
      const relations = await issueStore.getRelations(issue.id);
      const { comments } = await issueStore.getComments(issue.id);
      return { issue, relations, commentCount: comments.length };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    if (typeof body.version !== 'number') {
      reply.code(400);
      return { error: { code: 'VERSION_REQUIRED', message: 'PATCH requires the current issue version' } };
    }
    try {
      const issue = await issueStore.updateIssue(id, {
        title: body.title as string | undefined,
        description: body.description as string | undefined,
        priority: body.priority as never,
        labels: body.labels as string[] | undefined,
        projectEncoded: body.projectEncoded as string | undefined,
      }, body.version, actorFrom(req));
      hub.emit('issue.updated', { issueId: issue.id, identifier: issue.identifier });
      return { issue };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as Record<string, string>;
    const version = Number(query.version);
    if (!Number.isFinite(version)) {
      reply.code(400);
      return { error: { code: 'VERSION_REQUIRED', message: 'DELETE requires ?version=' } };
    }
    try {
      const issue = await issueStore.getIssue(id);
      await issueStore.deleteIssue(id, version);
      hub.emit('issue.deleted', { issueId: issue.id, identifier: issue.identifier });
      return { success: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/issues/:id/move', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { status?: IssueStatus; sortOrder?: number; version?: number };
    if (typeof body.version !== 'number' || !body.status) {
      reply.code(400);
      return { error: { code: 'BAD_REQUEST', message: 'move requires { status, version }' } };
    }
    try {
      const issue = await issueStore.moveIssue(id, body.status, body.sortOrder, body.version, actorFrom(req));
      hub.emit('issue.moved', { issueId: issue.id, identifier: issue.identifier, status: issue.status });
      return { issue };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/issues/:id/archive', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { version?: number };
    if (typeof body.version !== 'number') {
      reply.code(400);
      return { error: { code: 'VERSION_REQUIRED', message: 'archive requires { version }' } };
    }
    try {
      const issue = await issueStore.archiveIssue(id, body.version, actorFrom(req));
      hub.emit('issue.archived', { issueId: issue.id, identifier: issue.identifier });
      return { issue };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/issues/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { version?: number };
    if (typeof body.version !== 'number') {
      reply.code(400);
      return { error: { code: 'VERSION_REQUIRED', message: 'restore requires { version }' } };
    }
    try {
      const issue = await issueStore.restoreIssue(id, body.version, actorFrom(req));
      hub.emit('issue.restored', { issueId: issue.id, identifier: issue.identifier });
      return { issue };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/issues/:id/relations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { type?: 'parent' | 'blocks' | 'related'; targetId?: string };
    if (!body.type || !body.targetId) {
      reply.code(400);
      return { error: { code: 'BAD_REQUEST', message: 'relation requires { type, targetId }' } };
    }
    try {
      const relation = await issueStore.addRelation(id, body.type, body.targetId, actorFrom(req));
      hub.emit('issue.relation.updated', { issueId: relation.sourceId });
      reply.code(201);
      return { relation };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/issues/:id/relations/:type/:targetId', async (req, reply) => {
    const { id, type, targetId } = req.params as { id: string; type: 'parent' | 'blocks' | 'related'; targetId: string };
    try {
      await issueStore.removeRelation(id, type, targetId, actorFrom(req));
      hub.emit('issue.relation.updated', { issueId: id });
      return { success: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/issues/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as Record<string, string>;
    try {
      const result = await issueStore.getComments(id, query.after);
      return result;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/issues/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { body?: string; authorType?: 'user' | 'agent'; sessionId?: string };
    try {
      const comment = await issueStore.addComment(id, body.body ?? '', {
        authorType: body.authorType,
        sessionId: body.sessionId,
      });
      hub.emit('comment.created', { issueId: comment.issueId, commentId: comment.id });
      reply.code(201);
      return { comment };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/api/comments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { body?: string; version?: number };
    if (typeof body.version !== 'number') {
      reply.code(400);
      return { error: { code: 'VERSION_REQUIRED', message: 'PATCH requires { version }' } };
    }
    try {
      const comment = await issueStore.updateComment(id, body.body ?? '', body.version);
      hub.emit('comment.updated', { issueId: comment.issueId, commentId: comment.id });
      return { comment };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/comments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await issueStore.removeComment(id);
      hub.emit('comment.deleted', { commentId: id });
      return { success: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/issues/:id/sessions/:sessionId', async (req, reply) => {
    const { id, sessionId } = req.params as { id: string; sessionId: string };
    const body = (req.body ?? {}) as { version?: number };
    if (typeof body.version !== 'number') {
      reply.code(400);
      return { error: { code: 'VERSION_REQUIRED', message: 'bind requires { version }' } };
    }
    try {
      const issue = await issueStore.bindSession(id, sessionId, body.version, actorFrom(req));
      hub.emit('issue.updated', { issueId: issue.id, identifier: issue.identifier });
      return { issue };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/issues/:id/sessions/:sessionId', async (req, reply) => {
    const { id, sessionId } = req.params as { id: string; sessionId: string };
    const query = req.query as Record<string, string>;
    const version = Number(query.version);
    if (!Number.isFinite(version)) {
      reply.code(400);
      return { error: { code: 'VERSION_REQUIRED', message: 'unbind requires ?version=' } };
    }
    try {
      const issue = await issueStore.unbindSession(id, sessionId, version, actorFrom(req));
      hub.emit('issue.updated', { issueId: issue.id, identifier: issue.identifier });
      return { issue };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/issues/:id/activities', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const activities = await issueStore.getActivities(id);
      return { activities };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/events', (req, reply) => {
    reply.hijack();
    hub.subscribe(reply);
  });
}
