import type { CliProvider, SessionMetadata, ListOptions, ProjectInfo, ActiveSession, SessionStatus } from './types.js';
import { SessionReader } from './session-reader.js';
import { CodexReader } from './codex-reader.js';
import { TaskStore } from './task-store.js';
import { getAvailableProviders } from './providers.js';

const STATUS_TAGS: SessionStatus[] = ['backlog', 'in_progress', 'review', 'done', 'cancelled'];

export interface ISessionReader {
  readonly provider: CliProvider;
  listProjects(): Promise<{ encoded: string; decoded: string }[]>;
  listProjectSessions(projectEncoded: string): Promise<string[]>;
  streamSession(projectEncoded: string, sessionId: string): AsyncGenerator<SessionMessage>;
  readSession(projectEncoded: string, sessionId: string): Promise<SessionMessage[]>;
  readSessionMetadata(projectEncoded: string, sessionId: string): Promise<SessionMetadata>;
  readActiveSessions(): Promise<ActiveSession[]>;
}

import type { SessionMessage } from './types.js';

export function inferSessionStatus(
  meta: SessionMetadata,
  activeSessions: ActiveSession[],
): SessionStatus {
  const tags = meta.tags ?? [];
  for (const t of STATUS_TAGS) {
    if (tags.includes(t)) return t;
  }

  const isActive = activeSessions.some(a => a.sessionId === meta.sessionId);
  if (isActive) return 'in_progress';

  if (!meta.lastTimestamp) return 'backlog';
  const hoursSince = (Date.now() - new Date(meta.lastTimestamp).getTime()) / (1000 * 60 * 60);

  if (hoursSince <= 4) return 'in_progress';
  if (hoursSince <= 72) return 'backlog';
  return meta.messageCount >= 5 ? 'done' : 'backlog';
}

export class SessionIndex {
  private readers: (SessionReader | CodexReader)[];
  private taskStore: TaskStore;
  private cache: Map<string, SessionMetadata> = new Map();
  private built = false;

  constructor(readers?: (SessionReader | CodexReader)[], taskStore?: TaskStore) {
    if (readers) {
      this.readers = readers;
    } else {
      const available = getAvailableProviders();
      this.readers = available.map(p =>
        p.id === 'codex' ? new CodexReader() : new SessionReader(p.id),
      );
    }
    this.taskStore = taskStore ?? new TaskStore();
  }

  async buildIndex(options?: { forceRefresh?: boolean }): Promise<void> {
    if (this.built && !options?.forceRefresh) return;

    this.cache.clear();
    const labels = await this.taskStore.getAll();

    for (const reader of this.readers) {
      const projects = await reader.listProjects();
      for (const project of projects) {
        const sessionIds = await reader.listProjectSessions(project.encoded);
        for (const sessionId of sessionIds) {
          try {
            const metadata = await reader.readSessionMetadata(project.encoded, sessionId);
            const taskLabel = labels[sessionId];
            if (taskLabel) {
              metadata.label = taskLabel.label;
              metadata.tags = taskLabel.tags;
            }
            this.cache.set(sessionId, metadata);
          } catch {
            // skip unreadable sessions
          }
        }
      }
    }

    this.built = true;
  }

  async getAllSessions(options?: ListOptions): Promise<SessionMetadata[]> {
    await this.buildIndex();
    let sessions = [...this.cache.values()];

    if (options?.provider) {
      sessions = sessions.filter(s => s.provider === options.provider);
    }
    if (options?.project) {
      const proj = options.project.toLowerCase();
      sessions = sessions.filter(s => s.project.toLowerCase().includes(proj));
    }
    if (options?.branch) {
      sessions = sessions.filter(s => s.gitBranch === options.branch);
    }
    if (options?.since) {
      const since = options.since.toISOString();
      sessions = sessions.filter(s => s.lastTimestamp && s.lastTimestamp >= since);
    }
    if (options?.until) {
      const until = options.until.toISOString();
      sessions = sessions.filter(s => s.firstTimestamp && s.firstTimestamp <= until);
    }
    if (options?.model) {
      sessions = sessions.filter(s => s.models.some(m => m.includes(options.model!)));
    }

    const sort = options?.sort ?? 'date-desc';
    sessions.sort((a, b) => {
      const ta = a.lastTimestamp ?? '';
      const tb = b.lastTimestamp ?? '';
      return sort === 'date-desc' ? tb.localeCompare(ta) : ta.localeCompare(tb);
    });

    if (options?.offset) sessions = sessions.slice(options.offset);
    if (options?.limit) sessions = sessions.slice(0, options.limit);

    return sessions;
  }

  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    await this.buildIndex();

    if (this.cache.has(sessionId)) return this.cache.get(sessionId)!;

    for (const [id, meta] of this.cache) {
      if (id.startsWith(sessionId)) return meta;
    }
    return null;
  }

  async findSessionByPrefix(prefix: string): Promise<SessionMetadata | null> {
    await this.buildIndex();
    const matches: SessionMetadata[] = [];
    for (const [id, meta] of this.cache) {
      if (id.startsWith(prefix)) matches.push(meta);
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Ambiguous session ID prefix "${prefix}": ${matches.length} matches`);
    return null;
  }

  async getProjects(provider?: CliProvider): Promise<ProjectInfo[]> {
    await this.buildIndex();
    const projectMap = new Map<string, ProjectInfo & { providerSet: Set<CliProvider> }>();
    for (const meta of this.cache.values()) {
      if (provider && meta.provider !== provider) continue;
      const key = meta.projectEncoded;
      const existing = projectMap.get(key);
      if (existing) {
        existing.sessionCount++;
        existing.providerSet.add(meta.provider);
        if (meta.lastTimestamp && (!existing.lastTimestamp || meta.lastTimestamp > existing.lastTimestamp)) {
          existing.lastTimestamp = meta.lastTimestamp;
        }
      } else {
        const providerSet = new Set<CliProvider>([meta.provider]);
        projectMap.set(key, {
          encoded: meta.projectEncoded,
          decoded: meta.project,
          providers: [],
          sessionCount: 1,
          lastTimestamp: meta.lastTimestamp,
          providerSet,
        });
      }
    }
    return [...projectMap.values()]
      .map(({ providerSet, ...rest }) => ({ ...rest, providers: [...providerSet] }))
      .sort((a, b) => b.sessionCount - a.sessionCount);
  }

  getReaderForProvider(provider: CliProvider): SessionReader | CodexReader | undefined {
    return this.readers.find(r => r.provider === provider);
  }

  getReaderForSession(meta: SessionMetadata): SessionReader | CodexReader | undefined {
    return this.getReaderForProvider(meta.provider);
  }
}
