import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { CliProvider, SessionMessage, SessionMetadata, ActiveSession, HistoryEntry } from './types.js';
import { getProjectsDir, getSessionsDir, getHistoryPath, decodeProjectPath, getSessionFilePath } from './paths.js';

export class SessionReader {
  readonly provider: CliProvider;

  constructor(provider: CliProvider = 'claude-code') {
    this.provider = provider;
  }

  async listProjects(): Promise<{ encoded: string; decoded: string }[]> {
    const projectsDir = getProjectsDir(this.provider);
    try {
      const entries = await readdir(projectsDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => ({ encoded: e.name, decoded: decodeProjectPath(e.name) }));
    } catch {
      return [];
    }
  }

  async listProjectSessions(projectEncoded: string): Promise<string[]> {
    const dir = join(getProjectsDir(this.provider), projectEncoded);
    try {
      const entries = await readdir(dir);
      return entries
        .filter(e => e.endsWith('.jsonl'))
        .map(e => e.replace('.jsonl', ''));
    } catch {
      return [];
    }
  }

  async *streamSession(projectEncoded: string, sessionId: string): AsyncGenerator<SessionMessage> {
    const filePath = getSessionFilePath(projectEncoded, sessionId, this.provider);
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as SessionMessage;
      } catch {
        // skip malformed lines
      }
    }
  }

  async readSession(projectEncoded: string, sessionId: string): Promise<SessionMessage[]> {
    const messages: SessionMessage[] = [];
    for await (const msg of this.streamSession(projectEncoded, sessionId)) {
      messages.push(msg);
    }
    return messages;
  }

  async readSessionMetadata(projectEncoded: string, sessionId: string): Promise<SessionMetadata> {
    const filePath = getSessionFilePath(projectEncoded, sessionId, this.provider);
    const metadata: SessionMetadata = {
      sessionId,
      provider: this.provider,
      project: decodeProjectPath(projectEncoded),
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
        if (!metadata.firstTimestamp) metadata.firstTimestamp = msg.timestamp;
        metadata.lastTimestamp = msg.timestamp;
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
