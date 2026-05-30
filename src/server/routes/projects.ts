import type { FastifyInstance } from 'fastify';
import type { CliProvider } from '../../core/types.js';
import { SessionIndex } from '../../core/session-index.js';
import { ProjectArchive } from '../../core/project-archive.js';
import { getProjectDetail } from '../../core/project-info.js';
import { getAvailableProviders } from '../../core/providers.js';

export function registerProjectRoutes(app: FastifyInstance): void {
  const index = new SessionIndex();
  const archive = new ProjectArchive();

  app.get('/api/providers', async () => {
    const available = getAvailableProviders();
    return {
      providers: available.map(p => ({
        id: p.id,
        name: p.name,
        command: p.command,
      })),
    };
  });

  app.get('/api/projects', async (req) => {
    const query = req.query as Record<string, string>;
    const provider = query.provider as CliProvider | undefined;
    const [projects, archivedIds, pinnedIds] = await Promise.all([
      index.getProjects(provider),
      archive.getArchivedIds(),
      archive.getPinnedIds(),
    ]);
    const augmented = projects.map(p => ({
      ...p,
      archived: archivedIds.includes(p.encoded),
      pinned: pinnedIds.includes(p.encoded),
    }));
    return { projects: augmented, total: augmented.length };
  });

  app.get('/api/projects/:encoded/detail', async (req, reply) => {
    const { encoded } = req.params as { encoded: string };
    const projects = await index.getProjects();
    const project = projects.find(p => p.encoded === encoded);
    if (!project) {
      reply.code(404);
      return { error: 'Project not found' };
    }
    const detail = await getProjectDetail(project.decoded);
    return { ...project, ...detail };
  });

  app.post('/api/projects/:encoded/archive', async (req) => {
    const { encoded } = req.params as { encoded: string };
    await archive.archive(encoded);
    return { success: true };
  });

  app.post('/api/projects/:encoded/unarchive', async (req) => {
    const { encoded } = req.params as { encoded: string };
    await archive.unarchive(encoded);
    return { success: true };
  });

  app.post('/api/projects/:encoded/pin', async (req) => {
    const { encoded } = req.params as { encoded: string };
    await archive.pin(encoded);
    return { success: true };
  });

  app.post('/api/projects/:encoded/unpin', async (req) => {
    const { encoded } = req.params as { encoded: string };
    await archive.unpin(encoded);
    return { success: true };
  });
}
