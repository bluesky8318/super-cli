import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { CliProvider, SessionMessage, SessionMetadata, ActiveSession, HistoryEntry } from './types.js';
import { getProjectsDir, getSessionsDir, getHistoryPath, decodeProjectPath, encodeProjectPath, getSessionFilePath, getCliHome } from './paths.js';
import { getProvider } from './providers.js';

export class SessionReader {
  readonly provider: CliProvider;

  constructor(provider: CliProvider = 'claude-code') {
    this.provider = provider;
  }

  async listProjects(): Promise<{ encoded: string; decoded: string }[]> {
    const layout = getProvider(this.provider).sessionLayout;
    if (!layout) return [];
    const projectsDir = getProjectsDir(this.provider);

    // md5 encoding (Kimi): project dirs are md5(project path); the mapping from
    // hash back to path lives in `kimi.json`'s work_dirs list.
    if (layout.encoding === 'md5') {
      try {
        const map = await this.getMd5PathMap();
        const results: { encoded: string; decoded: string }[] = [];
        for (const [encoded, decoded] of map) {
          try {
            const st = await stat(join(projectsDir, encoded));
            if (st.isDirectory()) results.push({ encoded, decoded });
          } catch {
            // no sessions for this work dir
          }
        }
        return results;
      } catch {
        return [];
      }
    }

    try {
      const entries = await readdir(projectsDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => ({ encoded: e.name, decoded: decodeProjectPath(e.name, this.provider) }));
    } catch {
      return [];
    }
  }

  async listProjectSessions(projectEncoded: string): Promise<string[]> {
    const layout = getProvider(this.provider).sessionLayout;
    if (!layout) return [];
    const dir = join(getProjectsDir(this.provider), projectEncoded);
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      if (layout.file === 'context.jsonl-subdir') {
        const sessionIds: string[] = [];
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          try {
            await stat(join(dir, e.name, 'context.jsonl'));
            sessionIds.push(e.name);
          } catch {
            // no context.jsonl in this subdir
          }
        }
        return sessionIds;
      }
      // 'uuid.jsonl' and 'timestamp_uuid.jsonl' both use the full basename as id.
      return entries
        .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
        .map(e => e.name.replace('.jsonl', ''));
    } catch {
      return [];
    }
  }

  async *streamSession(projectEncoded: string, sessionId: string): AsyncGenerator<SessionMessage> {
    const filePath = getSessionFilePath(projectEncoded, sessionId, this.provider);
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    // Pi records cwd only in the leading `session` meta line; attach it to the
    // first real message so metadata.project resolves to the true path (dash-based
    // project dir encoding cannot be decoded unambiguously).
    let pendingCwd: string | undefined;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line) as Record<string, unknown>;
        if (this.provider === 'pi' && raw.type === 'session') {
          pendingCwd = raw.cwd as string | undefined;
          continue;
        }
        const msg = this.normalizeMessage(raw);
        if (msg) {
          if (pendingCwd && !msg.cwd) msg.cwd = pendingCwd;
          yield msg;
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  /** Normalize provider-specific JSONL line formats into the Claude-style SessionMessage shape. */
  private normalizeMessage(raw: Record<string, unknown>): SessionMessage | null {
    type Msg = NonNullable<SessionMessage['message']>;
    if (this.provider === 'pi') {
      if (raw.type !== 'message') return null;
      const message = raw.message as { role?: string; content?: Msg['content']; model?: string } | undefined;
      const role = message?.role;
      if (role !== 'user' && role !== 'assistant') return null;
      return {
        type: role,
        timestamp: raw.timestamp as string | undefined,
        message: { role, content: message?.content, model: message?.model },
      };
    }
    if (this.provider === 'kimi') {
      const role = raw.role as string | undefined;
      if (role !== 'user' && role !== 'assistant') return null;
      return {
        type: role,
        timestamp: raw.timestamp as string | undefined,
        message: { role, content: raw.content as Msg['content'] },
      };
    }
    return raw as unknown as SessionMessage;
  }

  async readSession(projectEncoded: string, sessionId: string): Promise<SessionMessage[]> {
    const messages: SessionMessage[] = [];
    for await (const msg of this.streamSession(projectEncoded, sessionId)) {
      messages.push(msg);
    }
    return messages;
  }

  /** Decode a project dir name; md5-encoded providers (Kimi) resolve via their mapping file. */
  private md5PathMap: Map<string, string> | null = null;

  private async getMd5PathMap(): Promise<Map<string, string>> {
    if (!this.md5PathMap) {
      this.md5PathMap = new Map();
      try {
        const raw = await readFile(join(getCliHome(this.provider), 'kimi.json'), 'utf-8');
        const config = JSON.parse(raw) as { work_dirs?: { path: string }[] };
        for (const dir of config.work_dirs ?? []) {
          if (dir.path) this.md5PathMap.set(encodeProjectPath(dir.path, this.provider), dir.path);
        }
      } catch {
        // mapping unavailable
      }
    }
    return this.md5PathMap;
  }

  private async decodeProject(projectEncoded: string): Promise<string> {
    const layout = getProvider(this.provider).sessionLayout;
    if (layout?.encoding === 'md5') {
      return (await this.getMd5PathMap()).get(projectEncoded) ?? projectEncoded;
    }
    return decodeProjectPath(projectEncoded, this.provider);
  }

  async readSessionMetadata(projectEncoded: string, sessionId: string): Promise<SessionMetadata> {
    const filePath = getSessionFilePath(projectEncoded, sessionId, this.provider);
    const metadata: SessionMetadata = {
      sessionId,
      provider: this.provider,
      project: await this.decodeProject(projectEncoded),
      projectEncoded,
      filePath,
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      models: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    const models = new Set<string>();

    for await (const msg of this.streamSession(projectEncoded, sessionId)) {
      metadata.messageCount++;

      if (msg.timestamp) {
        const tsStr = typeof msg.timestamp === 'number' ? new Date(msg.timestamp).toISOString() : String(msg.timestamp);
        if (!metadata.firstTimestamp) metadata.firstTimestamp = tsStr;
        metadata.lastTimestamp = tsStr;
      }

      if (msg.cwd && !metadata.cwd) metadata.cwd = msg.cwd;
      if (msg.gitBranch && !metadata.gitBranch) metadata.gitBranch = msg.gitBranch;
      if (msg.entrypoint && !metadata.entrypoint) metadata.entrypoint = msg.entrypoint;
      if (msg.version && !metadata.version) metadata.version = msg.version;

      if (msg.type === 'user') {
        metadata.userMessageCount++;
        if (!metadata.firstUserMessage && msg.message?.content) {
          const content = msg.message.content;
          if (typeof content === 'string') {
            metadata.firstUserMessage = content.slice(0, 200);
          } else if (Array.isArray(content)) {
            const textBlock = content.find(b => b.type === 'text');
            if (textBlock?.text) {
              metadata.firstUserMessage = textBlock.text.slice(0, 200);
            }
          }
        }
      } else if (msg.type === 'assistant') {
        metadata.assistantMessageCount++;
        if (msg.message?.model) models.add(msg.message.model);
        if (msg.message?.usage) {
          metadata.totalInputTokens += msg.message.usage.input_tokens || 0;
          metadata.totalOutputTokens += msg.message.usage.output_tokens || 0;
        }
      }
    }

    metadata.models = [...models];
    if (metadata.cwd) metadata.project = metadata.cwd;
    return metadata;
  }

  async readActiveSessions(): Promise<ActiveSession[]> {
    const dir = getSessionsDir(this.provider);
    try {
      const entries = await readdir(dir);
      const sessions: ActiveSession[] = [];
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        try {
          const content = await readFile(join(dir, entry), 'utf-8');
          sessions.push(JSON.parse(content));
        } catch {
          // skip unreadable files
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }

  async readHistory(limit?: number): Promise<HistoryEntry[]> {
    const historyPath = getHistoryPath(this.provider);
    const entries: HistoryEntry[] = [];

    try {
      const stream = createReadStream(historyPath, { encoding: 'utf-8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // skip
        }
      }
    } catch {
      return [];
    }

    if (limit) return entries.slice(-limit);
    return entries;
  }

  async getSessionFileStats(projectEncoded: string, sessionId: string): Promise<{ size: number; mtime: Date } | null> {
    try {
      const filePath = getSessionFilePath(projectEncoded, sessionId, this.provider);
      const s = await stat(filePath);
      return { size: s.size, mtime: s.mtime };
    } catch {
      return null;
    }
  }
}
