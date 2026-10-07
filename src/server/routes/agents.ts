import type { FastifyInstance, FastifyReply } from 'fastify';
import { AgentStore, AgentNotFoundError, AgentStateError, isHeadlessProvider } from '../../core/agent-store.js';
import type { CliProvider } from '../../core/types.js';
import type { EventHub } from '../events.js';

function sendError(reply: FastifyReply, err: unknown): { error: { code: string; message: string } } {
  if (err instanceof AgentNotFoundError) {
    reply.code(404);
    return { error: { code: err.code, message: err.message } };
  }
  if (err instanceof AgentStateError) {
    reply.code(400);
    return { error: { code: err.code, message: err.message } };
  }
  throw err;
}

/** Strip env values from API responses: keys are shown, values never leave the store. */
function redact(agent: { env?: Record<string, string> }): Record<string, unknown> {
  const { env, ...rest } = agent;
  return { ...rest, envKeys: env ? Object.keys(env) : [] };
}

export function registerAgentRoutes(app: FastifyInstance, agentStore: AgentStore, hub: EventHub): void {
  app.get('/api/agents', async () => {
    const agents = await agentStore.listAgents();
    return {
      agents: agents.map(a => ({ ...redact(a), headless: isHeadlessProvider(a.provider) })),
      total: agents.length,
    };
  });

  app.post('/api/agents', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    try {
      const agent = await agentStore.createAgent({
        name: body.name as string,
        provider: body.provider as CliProvider,
        model: body.model as string | undefined,
        workingDir: body.workingDir as string | undefined,
        extraArgs: body.extraArgs as string[] | undefined,
        env: body.env as Record<string, string> | undefined,
      });
      hub.emit('agent.created', { agentId: agent.id });
      reply.code(201);
      return { agent: { ...redact(agent), headless: isHeadlessProvider(agent.provider) } };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    try {
      const agent = await agentStore.updateAgent(id, {
        name: body.name as string | undefined,
        model: body.model as string | null | undefined,
        workingDir: body.workingDir as string | null | undefined,
        extraArgs: body.extraArgs as string[] | null | undefined,
        env: body.env as Record<string, string> | null | undefined,
      });
      hub.emit('agent.updated', { agentId: agent.id });
      return { agent: { ...redact(agent), headless: isHeadlessProvider(agent.provider) } };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const agent = await agentStore.getAgent(id);
      await agentStore.removeAgent(id);
      hub.emit('agent.removed', { agentId: agent.id });
      return { success: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
