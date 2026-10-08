import { execSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { CliProvider } from '../../core/types.js';
import { SessionIndex } from '../../core/session-index.js';
import { ProjectArchive } from '../../core/project-archive.js';
import { TaskStore } from '../../core/task-store.js';
import { getProjectDetail } from '../../core/project-info.js';
import { getAvailableProviders } from '../../core/providers.js';
import { ConfigManager } from '../../core/config.js';
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

/** Content-Types that browsers render inline for the "open in new tab" raw endpoint. */
const RAW_CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  json: 'application/json; charset=utf-8',
};

export function registerProjectRoutes(app: FastifyInstance, index: SessionIndex): void {
  const archive = new ProjectArchive();
  const taskStore = new TaskStore();

  /** Find a project by any of its identities (decoded path, short id, or legacy provider encodings). */
  async function findProject(encoded: string) {
    const projects = await index.getProjects();
    const hit = projects.find(p => p.encoded === encoded || p.decoded === encoded || p.aliases.includes(encoded));
    if (hit) return hit;
    if (/^p\d+$/.test(encoded)) {
      const shortIds = await taskStore.getProjectShortIds();
      const decoded = Object.entries(shortIds).find(([, id]) => id === encoded)?.[0];
      if (decoded) return projects.find(p => p.decoded === decoded);
    }
    return undefined;
  }

  /** All ids that may reference this project in pinned/archived config lists. */
  function allIdsOf(project: { encoded: string; decoded: string; aliases: string[] } | undefined, fallback: string): string[] {
    if (!project) return [fallback];
    return [...new Set([project.encoded, project.decoded, ...project.aliases])];
  }

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
    // Stable short ids ("p1", "p2", …) for compact, shareable web URLs.
    const shortIds = await taskStore.ensureProjectShortIds(projects.map(p => p.decoded));
    const augmented = projects.map(p => {
      // Match legacy provider-specific dir names as well as the decoded-path identity.
      const ids = [p.encoded, p.decoded, ...p.aliases];
      return {
        ...p,
        shortId: shortIds[p.decoded],
        archived: ids.some(id => archivedIds.includes(id)),
        pinned: ids.some(id => pinnedIds.includes(id)),
      };
    });
    return { projects: augmented, total: augmented.length };
  });

  app.get('/api/projects/:encoded/detail', async (req, reply) => {
    const { encoded } = req.params as { encoded: string };
    const project = await findProject(encoded);
    if (!project) {
      reply.code(404);
      return { error: 'Project not found' };
    }
    const detail = await getProjectDetail(project.decoded);
    return { ...project, ...detail };
  });

  app.post('/api/projects/:encoded/archive', async (req) => {
    const { encoded } = req.params as { encoded: string };
    const project = await findProject(encoded);
    // Clean legacy ids, then store the canonical decoded-path identity.
    for (const id of allIdsOf(project, encoded)) await archive.unarchive(id);
    await archive.archive(project?.decoded ?? encoded);
    return { success: true };
  });

  app.post('/api/projects/:encoded/unarchive', async (req) => {
    const { encoded } = req.params as { encoded: string };
    const project = await findProject(encoded);
    for (const id of allIdsOf(project, encoded)) await archive.unarchive(id);
    return { success: true };
  });

  app.post('/api/projects/:encoded/pin', async (req) => {
    const { encoded } = req.params as { encoded: string };
    const project = await findProject(encoded);
    for (const id of allIdsOf(project, encoded)) await archive.unpin(id);
    await archive.pin(project?.decoded ?? encoded);
    return { success: true };
  });

  app.post('/api/projects/:encoded/unpin', async (req) => {
    const { encoded } = req.params as { encoded: string };
    const project = await findProject(encoded);
    for (const id of allIdsOf(project, encoded)) await archive.unpin(id);
    return { success: true };
  });

  app.post('/api/projects/:encoded/open-finder', async (req, reply) => {
    const { encoded } = req.params as { encoded: string };
    const project = await findProject(encoded);
    if (!project) {
      reply.code(404);
      return { error: 'Project not found' };
    }
    try {
      const config = await new ConfigManager().load();
      const app = (config.settings?.fileManager ?? '').trim();
      const dir = JSON.stringify(project.decoded);
      if (process.platform === 'darwin') {
        execSync(app ? `open -a ${JSON.stringify(app)} ${dir}` : `open ${dir}`);
      } else if (process.platform === 'win32') {
        execSync(app ? `${app} ${dir}` : `explorer ${dir}`);
      } else {
        execSync(app ? `${app} ${dir}` : `xdg-open ${dir}`);
      }
      return { success: true };
    } catch (err: any) {
      reply.code(500);
      return { error: err.message ?? String(err) };
    }
  });

  app.post('/api/projects/:encoded/open-terminal', async (req, reply) => {
    const { encoded } = req.params as { encoded: string };
    const project = await findProject(encoded);
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
    const project = await findProject(encoded);
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
    const project = await findProject(encoded);
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

  // Raw file stream for "open in new browser tab": renders inline where the
  // browser supports it (html/pdf/images/audio/video/json), text otherwise.
  const rawFileHandler = async (req: any, reply: any) => {
    const { encoded } = req.params as { encoded: string };
    // Support both ?path= and path-style (/raw/<file.md>) URLs; the latter keeps
    // the real filename in location.pathname so browser extensions (e.g. the
    // docu.md Markdown Viewer) can detect .md files by their extension.
    const relativePath = ((req.params as Record<string, string>)['*']
      ?? (req.query as Record<string, string>).path
      ?? '').replace(/^\/+/, '');
    if (!relativePath) {
      reply.code(400);
      return { error: 'path is required' };
    }
    const project = await findProject(encoded);
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
      const ext = extname(fullPath).slice(1).toLowerCase();
      const contentType = RAW_CONTENT_TYPES[ext]
        ?? (BINARY_EXTENSIONS.has(ext) ? 'application/octet-stream' : 'text/plain; charset=utf-8');
      reply.header('Content-Type', contentType);
      reply.header('Content-Length', String(fileStat.size));
      return reply.send(createReadStream(fullPath));
    } catch {
      reply.code(404);
      return { error: 'File not found' };
    }
  };

  app.get('/api/projects/:encoded/files/raw', rawFileHandler);
  app.get('/api/projects/:encoded/files/raw/*', rawFileHandler);
}
