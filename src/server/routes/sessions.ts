import type { FastifyInstance } from 'fastify';
import type { CliProvider } from '../../core/types.js';
import { SessionIndex, inferSessionStatus } from '../../core/session-index.js';
import { SessionSearch } from '../../core/session-search.js';
import { TerminalLauncher } from '../../core/terminal-launcher.js';

export function registerSessionRoutes(app: FastifyInstance): void {
  const index = new SessionIndex();
  const search = new SessionSearch(undefined, index);

  app.get('/api/sessions', async (req) => {
    const query = req.query as Record<string, string>;
    const provider = query.provider as CliProvider | undefined;
    const [sessions, activeSessions] = await Promise.all([
      index.getAllSessions({
        provider,
        project: query.project,
        since: query.since ? new Date(query.since) : undefined,
        until: query.until ? new Date(query.until) : undefined,
        branch: query.branch,
        limit: query.limit ? parseInt(query.limit) : 50,
        offset: query.offset ? parseInt(query.offset) : 0,
        sort: (query.sort as 'date-asc' | 'date-desc') ?? 'date-desc',
      }),
      Promise.resolve([]),
    ]);

    const enriched = sessions.map(s => ({
      ...s,
      status: inferSessionStatus(s, activeSessions),
    }));

    return { sessions: enriched, total: enriched.length };
  });

  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await index.findSessionByPrefix(id);
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }
    return session;
  });

  app.get('/api/sessions/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as Record<string, string>;
    const session = await index.findSessionByPrefix(id);
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }

    const reader = index.getReaderForSession(session);
    if (!reader) {
      reply.code(500);
      return { error: 'No reader for provider' };
    }

    const messages = await reader.readSession(session.projectEncoded, session.sessionId);
    const conversationMessages = messages
      .filter(m => m.type === 'user' || m.type === 'assistant')
      .map(m => ({
        type: m.type,
        timestamp: m.timestamp,
        uuid: m.uuid,
        content: m.message?.content,
        model: m.message?.model,
        usage: m.message?.usage,
      }));

    const offset = query.offset ? parseInt(query.offset) : 0;
    const limit = query.limit ? parseInt(query.limit) : 100;

    return {
      messages: conversationMessages.slice(offset, offset + limit),
      total: conversationMessages.length,
    };
  });

  app.get('/api/search', async (req) => {
    const query = req.query as Record<string, string>;
    if (!query.q) return { results: [], total: 0 };

    const results = await search.search(query.q, {
      project: query.project,
      since: query.since ? new Date(query.since) : undefined,
      maxResults: query.max ? parseInt(query.max) : 50,
    });

    return { results, total: results.length };
  });

  const launcher = new TerminalLauncher();

  app.post('/api/sessions/:id/resume', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await index.findSessionByPrefix(id);
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
    }
    const cwd = session.cwd || session.project;
    const result = await launcher.resume(session.sessionId, cwd, session.provider);
    if (result.action === 'error') {
      reply.code(500);
    }
    return result;
  });

  app.post('/api/sessions/new', async (req, reply) => {
    const { project, provider } = req.body as { project?: string; provider?: CliProvider };
    if (!project) {
      reply.code(400);
      return { error: 'project path is required' };
    }
    const result = await launcher.launchNew(project, provider || 'claude-code');
    if (result.action === 'error') {
      reply.code(500);
    }
    return result;
  });
}
