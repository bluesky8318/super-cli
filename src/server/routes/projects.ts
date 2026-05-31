import { execSync } from 'node:child_process';
import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { CliProvider } from '../../core/types.js';
import { SessionIndex } from '../../core/session-index.js';
import { ProjectArchive } from '../../core/project-archive.js';
import { getProjectDetail } from '../../core/project-info.js';
import { getAvailableProviders } from '../../core/providers.js';
import { TerminalLauncher } from '../../core/terminal-launcher.js';

const IGNORED_ENTRIES = new Set([
  '.git', 'node_modules', 'dist', '.DS_Store', '__pycache__',
  '.next', '.nuxt', '.cache', '.turbo', '.gradle', 'target',
]);

const BINARY_EXTENSIONS = new Set([
  'png','jpg','jpeg','gif','ico','webp','bmp','mp3','mp4','wav','zip','tar','gz',
  'rar','7z','dmg','iso','exe','dll','so','dylib','woff','woff2','ttf','otf','pdf',
  'doc','xls','ppt','docx','xlsx','pptx','sqlite','db','class','jar','pyc','node',
]);

const MAX_PREVIEW_SIZE = 100 * 1024;
const SKIP_THRESHOLD = 5 * 1024 * 1024;

export function registerProjectRoutes(app: FastifyInstance, index: SessionIndex): void {
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

  app.post('/api/projects/:encoded/open-finder', async (req, reply) => {
    const { encoded } = req.params as { encoded: string };
    const projects = await index.getProjects();
    const project = projects.find(p => p.encoded === encoded);
    if (!project) {
      reply.code(404);
      return { error: 'Project not found' };
    }
    try {
      execSync(`open ${JSON.stringify(project.decoded)}`);
      return { success: true };
    } catch (err: any) {
      reply.code(500);
      return { error: err.message ?? String(err) };
    }
  });

  app.post('/api/projects/:encoded/open-terminal', async (req, reply) => {
    const { encoded } = req.params as { encoded: string };
    const projects = await index.getProjects();
    const project = projects.find(p => p.encoded === encoded);
    if (!project) {
      reply.code(404);
      return { error: 'Project not found' };
    }
    const launcher = new TerminalLauncher();
    try {
      await launcher.openDirectory(project.decoded);
      return { success: true };
    } catch (err: any) {
      reply.code(500);
      return { error: err.message ?? String(err) };
    }
  });

  app.get('/api/projects/:encoded/files', async (req, reply) => {
    const { encoded } = req.params as { encoded: string };
    const { path: relativePath = '' } = req.query as { path?: string };
    const projects = await index.getProjects();
    const project = projects.find(p => p.encoded === encoded);
    if (!project) {
      reply.code(404);
      return { error: 'Project not found' };
    }

    const rootDir = project.decoded;
    const resolvedPath = resolve(rootDir, relativePath);
    if (!resolvedPath.startsWith(rootDir)) {
      reply.code(403);
      return { error: 'Forbidden' };
    }

    try {
      const entries = await readdir(resolvedPath, { withFileTypes: true });
      const result = [];
      for (const entry of entries) {
        if (IGNORED_ENTRIES.has(entry.name)) continue;
        const item: { name: string; type: 'dir' | 'file'; size?: number; extension?: string } = {
          name: entry.name,
          type: entry.isDirectory() ? 'dir' : 'file',
        };
        if (entry.isFile()) {
          try {
            const s = await stat(join(resolvedPath, entry.name));
            item.size = s.size;
            const ext = extname(entry.name).slice(1).toLowerCase();
            if (ext) item.extension = ext;
          } catch { /* skip */ }
        }
        result.push(item);
      }
      result.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return { path: relativePath, entries: result };
    } catch {
      reply.code(404);
      return { error: 'Directory not found' };
    }
  });

  app.get('/api/projects/:encoded/files/content', async (req, reply) => {
    const { encoded } = req.params as { encoded: string };
    const { path: relativePath = '' } = req.query as { path?: string };
    if (!relativePath) {
      reply.code(400);
      return { error: 'path is required' };
    }
    const projects = await index.getProjects();
    const project = projects.find(p => p.encoded === encoded);
    if (!project) {
      reply.code(404);
      return { error: 'Project not found' };
    }

    const rootDir = project.decoded;
    const fullPath = resolve(rootDir, relativePath);
    if (!fullPath.startsWith(rootDir)) {
      reply.code(403);
      return { error: 'Forbidden' };
    }

    try {
      const fileStat = await stat(fullPath);
      if (fileStat.isDirectory()) {
        reply.code(400);
        return { error: 'Path is a directory' };
      }

      if (fileStat.size > SKIP_THRESHOLD) {
        return { path: relativePath, content: null, binary: false, truncated: true, size: fileStat.size };
      }

      const ext = extname(fullPath).slice(1).toLowerCase();
      const buffer = await readFile(fullPath);
      const isBinaryByExt = BINARY_EXTENSIONS.has(ext);
      const isBinaryByContent = buffer.slice(0, 8192).includes(0);
      const isBinary = isBinaryByExt || isBinaryByContent;

      if (isBinary) {
        return { path: relativePath, content: null, binary: true, truncated: false, size: fileStat.size };
      }

      const fullContent = buffer.toString('utf-8');
      const truncated = buffer.length > MAX_PREVIEW_SIZE;
      const content = truncated ? fullContent.slice(0, MAX_PREVIEW_SIZE) : fullContent;

      return { path: relativePath, content, binary: false, truncated, size: fileStat.size };
    } catch {
      reply.code(404);
      return { error: 'File not found' };
    }
  });
}
