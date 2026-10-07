import type { FastifyInstance } from 'fastify';
import type { CliProvider, TerminalType } from '../../core/types.js';
import { execSync } from 'node:child_process';
import { stat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSkills, getSkillContent, deleteSkill, copySkill } from '../../core/skill-reader.js';
import { getMcpServers, addMcpServer, updateMcpServer, deleteMcpServer, copyMcpServer } from '../../core/mcp-reader.js';
import { getRuleFiles, getRuleContent, saveRuleContent } from '../../core/rules-reader.js';
import { getHooks } from '../../core/hooks-reader.js';
import { getPermissions } from '../../core/permissions-reader.js';
import { ConfigManager } from '../../core/config.js';
import { getSuperCliConfigPath, getSuperCliHome } from '../../core/paths.js';

const TERMINALS: TerminalType[] = ['ghostty', 'iterm2', 'terminal', 'kitty', 'warp'];

/** Replace env values with a placeholder so secrets never leave the store via the viewer. */
function redactAgentEnv(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const store = data as { agents?: Record<string, { env?: Record<string, string> }> };
  if (!store.agents) return data;
  const clone = JSON.parse(JSON.stringify(data)) as typeof store;
  for (const agent of Object.values(clone.agents ?? {})) {
    if (agent.env) {
      agent.env = Object.fromEntries(Object.keys(agent.env).map(k => [k, '***']));
    }
  }
  return clone;
}

async function pathSize(p: string): Promise<number> {
  try {
    const s = await stat(p);
    if (s.isFile()) return s.size;
    let total = 0;
    for (const entry of await readdir(p)) {
      total += await pathSize(join(p, entry));
    }
    return total;
  } catch {
    return 0;
  }
}

export function registerConfigRoutes(app: FastifyInstance): void {
  const configManager = new ConfigManager();

  // System settings (super-cli itself): settings + data files + labels + project prefs
  app.get('/api/config/system', async () => {
    const config = await configManager.load();
    const home = getSuperCliHome();
    const dataFiles = [];
    for (const name of ['config.json', 'issues.json', 'ideas.json', 'agents.json', 'runs']) {
      const p = join(home, name);
      let exists = true;
      let bytes = 0;
      try {
        await stat(p);
        bytes = await pathSize(p);
      } catch {
        exists = false;
      }
      dataFiles.push({ name, path: p, bytes, exists });
    }
    const sessionLabels = Object.entries(config.sessions ?? {}).map(([sessionId, l]) => ({
      sessionId,
      label: l.label,
      tags: l.tags ?? [],
      createdAt: l.createdAt,
    }));
    return {
      settings: config.settings ?? {},
      configPath: getSuperCliConfigPath(),
      homePath: home,
      dataFiles,
      sessionLabels,
      archivedProjects: config.archivedProjects ?? [],
      pinnedProjects: config.pinnedProjects ?? [],
      platform: process.platform,
    };
  });

  app.post('/api/config/system/reveal', async (_req, reply) => {
    try {
      execSync(`open ${JSON.stringify(getSuperCliHome())}`);
      return { success: true };
    } catch (err: any) {
      reply.code(500);
      return { error: err.message ?? String(err) };
    }
  });

  // View a data file in the browser. Whitelisted names only; runs/ files are
  // resolved with containment checks. agents.json env values are redacted.
  app.get('/api/config/system/files/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const home = getSuperCliHome();
    if (name === 'runs') {
      try {
        const entries = await readdir(join(home, 'runs'));
        const files = [];
        for (const f of entries.filter(e => e.endsWith('.json')).sort()) {
          files.push({ name: f, bytes: await pathSize(join(home, 'runs', f)) });
        }
        return { name, files };
      } catch {
        return { name, files: [] };
      }
    }
    if (!['config.json', 'issues.json', 'ideas.json', 'agents.json'].includes(name)) {
      reply.code(404);
      return { error: { code: 'FILE_NOT_FOUND', message: `Unknown data file: ${name}` } };
    }
    try {
      const raw = await readFile(join(home, name), 'utf-8');
      let data: unknown = JSON.parse(raw);
      if (name === 'agents.json') data = redactAgentEnv(data);
      return { name, data };
    } catch (err: any) {
      reply.code(err?.code === 'ENOENT' ? 404 : 400);
      return { error: { code: 'FILE_UNREADABLE', message: err.message ?? String(err) } };
    }
  });

  app.get('/api/config/system/files/runs/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!/^[\w-]+\.json$/.test(file)) {
      reply.code(400);
      return { error: { code: 'INVALID_NAME', message: 'Invalid run file name' } };
    }
    try {
      const raw = await readFile(join(getSuperCliHome(), 'runs', file), 'utf-8');
      return { name: file, data: JSON.parse(raw) };
    } catch (err: any) {
      reply.code(err?.code === 'ENOENT' ? 404 : 400);
      return { error: { code: 'FILE_UNREADABLE', message: err.message ?? String(err) } };
    }
  });

  app.put('/api/config/system', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const allowed: Record<string, (v: unknown) => boolean> = {
      defaultPort: (v) => typeof v === 'number' && v > 0 && v < 65536,
      terminal: (v) => typeof v === 'string' && TERMINALS.includes(v as TerminalType),
      fileManager: (v) => typeof v === 'string' && v.length <= 100,
      wechatUrl: (v) => typeof v === 'string' && v.length <= 200,
      wechatToken: (v) => typeof v === 'string' && v.length <= 200,
      wechatNames: (v) => typeof v === 'string' && v.length <= 500,
      ideaCategories: (v) =>
        Array.isArray(v) && v.length <= 20 && v.every(
          (c) => c && typeof c === 'object'
            && typeof (c as Record<string, unknown>).key === 'string'
            && typeof (c as Record<string, unknown>).label === 'string'
            && typeof (c as Record<string, unknown>).project === 'string'
            && ((c as Record<string, unknown>).project as string).startsWith('/'),
        ),
    };
    for (const [key, value] of Object.entries(body)) {
      const validate = allowed[key];
      if (!validate) {
        reply.code(400);
        return { error: { code: 'UNKNOWN_SETTING', message: `Unknown setting: ${key}` } };
      }
      if (!validate(value)) {
        reply.code(400);
        return { error: { code: 'INVALID_SETTING', message: `Invalid value for ${key}` } };
      }
      await configManager.set(key, value);
    }
    const config = await configManager.load();
    return { settings: config.settings ?? {} };
  });

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
