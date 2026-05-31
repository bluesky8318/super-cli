import type { FastifyInstance } from 'fastify';
import type { CliProvider } from '../../core/types.js';
import { getSkills, getSkillContent, deleteSkill, copySkill } from '../../core/skill-reader.js';
import { getMcpServers, addMcpServer, updateMcpServer, deleteMcpServer, copyMcpServer } from '../../core/mcp-reader.js';
import { getRuleFiles, getRuleContent, saveRuleContent } from '../../core/rules-reader.js';
import { getHooks } from '../../core/hooks-reader.js';
import { getPermissions } from '../../core/permissions-reader.js';

export function registerConfigRoutes(app: FastifyInstance): void {
  // Skills
  app.get('/api/config/skills', async (req) => {
    const query = req.query as Record<string, string>;
    const provider = query.provider as CliProvider | undefined;
    const project = query.project || undefined;
    const skills = await getSkills(provider, project);
    return { skills, total: skills.length };
  });

  app.get('/api/config/skills/:provider/:id/content', async (req, reply) => {
    const { provider, id } = req.params as { provider: CliProvider; id: string };
    const query = req.query as Record<string, string>;
    const scope = (query.scope as 'global' | 'project') || undefined;
    const project = query.project || undefined;
    try {
      const content = await getSkillContent(provider, id, scope, project);
      return { content };
    } catch {
      reply.code(404);
      return { error: 'Skill not found' };
    }
  });

  app.delete('/api/config/skills/:provider/:id', async (req) => {
    const { provider, id } = req.params as { provider: CliProvider; id: string };
    const query = req.query as Record<string, string>;
    const scope = (query.scope as 'global' | 'project') || undefined;
    const project = query.project || undefined;
    await deleteSkill(provider, id, scope, project);
    return { success: true };
  });

  app.post('/api/config/skills/copy', async (req) => {
    const { from, to, id } = req.body as { from: CliProvider; to: CliProvider; id: string };
    await copySkill(from, to, id);
    return { success: true };
  });

  // MCP Servers
  app.get('/api/config/mcp', async (req) => {
    const query = req.query as Record<string, string>;
    const provider = query.provider as CliProvider | undefined;
    const project = query.project || undefined;
    const servers = await getMcpServers(provider, project);
    return { servers, total: servers.length };
  });

  app.post('/api/config/mcp/:provider', async (req) => {
    const { provider } = req.params as { provider: CliProvider };
    const { id, config, project } = req.body as { id: string; config: object; project?: string };
    await addMcpServer(provider, id, config, project);
    return { success: true };
  });

  app.put('/api/config/mcp/:provider/:id', async (req) => {
    const { provider, id } = req.params as { provider: CliProvider; id: string };
    const { config, project } = req.body as { config: object; project?: string };
    await updateMcpServer(provider, id, config, project);
    return { success: true };
  });

  app.delete('/api/config/mcp/:provider/:id', async (req) => {
    const { provider, id } = req.params as { provider: CliProvider; id: string };
    const query = req.query as Record<string, string>;
    const project = query.project || undefined;
    await deleteMcpServer(provider, id, project);
    return { success: true };
  });

  app.post('/api/config/mcp/copy', async (req) => {
    const { from, to, id } = req.body as { from: CliProvider; to: CliProvider; id: string };
    await copyMcpServer(from, to, id);
    return { success: true };
  });

  // Rules
  app.get('/api/config/rules', async (req) => {
    const query = req.query as Record<string, string>;
    const provider = query.provider as CliProvider | undefined;
    const project = query.project || undefined;
    const files = await getRuleFiles(provider, project);
    return { files, total: files.length };
  });

  app.get('/api/config/rules/content', async (req) => {
    const query = req.query as Record<string, string>;
    const path = query.path;
    if (!path) return { error: 'path required' };
    const content = await getRuleContent(path);
    return { content };
  });

  app.put('/api/config/rules/content', async (req) => {
    const { path, content } = req.body as { path: string; content: string };
    await saveRuleContent(path, content);
    return { success: true };
  });

  // Hooks
  app.get('/api/config/hooks', async (req) => {
    const query = req.query as Record<string, string>;
    const provider = query.provider as CliProvider | undefined;
    const project = query.project || undefined;
    const configs = await getHooks(provider, project);
    return { configs };
  });

  // Permissions
  app.get('/api/config/permissions', async (req) => {
    const query = req.query as Record<string, string>;
    const provider = query.provider as CliProvider | undefined;
    const project = query.project || undefined;
    const configs = await getPermissions(provider, project);
    return { configs };
  });
}
