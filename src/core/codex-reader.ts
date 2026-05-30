import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { SessionMessage, SessionMetadata, ActiveSession, HistoryEntry } from './types.js';
import { getCodexSessionsDir, encodeProjectPath, decodeProjectPath } from './paths.js';

interface CodexSessionMeta {
  id: string;
  cwd: string;
  cli_version?: string;
  model_provider?: string;
  git?: { branch?: string; commit_hash?: string; repository_url?: string };
}

interface CodexLine {
  timestamp: string;
  type: string;
  payload: any;
}

export class CodexReader {
  readonly provider = 'codex' as const;

  private async findAllSessionFiles(): Promise<string[]> {
    const baseDir = getCodexSessionsDir();
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.name.endsWith('.jsonl')) {
            files.push(fullPath);
          }
        }
      } catch {
        // skip inaccessible dirs
      }
    }

    await walk(baseDir);
    return files;
  }

  private parseSessionIdFromFilename(filename: string): string {
    const match = filename.match(/rollout-[\dT-]+-(.+)\.jsonl$/);
    return match ? match[1] : filename.replace('.jsonl', '');
  }

  private async readFirstLine(filePath: string): Promise<CodexLine | null> {
    try {
      const stream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as CodexLine;
          rl.close();
          stream.destroy();
          return parsed;
        } catch {
          break;
        }
      }
    } catch {
      // skip
    }
    return null;
  }

  async listProjects(): Promise<{ encoded: string; decoded: string }[]> {
    const files = await this.findAllSessionFiles();
    const projects = new Map<string, string>();

    for (const file of files) {
      const first = await this.readFirstLine(file);
      if (first?.type === 'session_meta' && first.payload?.cwd) {
        const cwd = first.payload.cwd as string;
        const encoded = encodeProjectPath(cwd);
        if (!projects.has(encoded)) {
          projects.set(encoded, cwd);
        }
      }
    }

    return [...projects.entries()].map(([encoded, decoded]) => ({ encoded, decoded }));
  }

  async listProjectSessions(projectEncoded: string): Promise<string[]> {
    const targetCwd = decodeProjectPath(projectEncoded);
    const files = await this.findAllSessionFiles();
    const sessionIds: string[] = [];

    for (const file of files) {
      const first = await this.readFirstLine(file);
      if (first?.type === 'session_meta' && first.payload?.cwd === targetCwd) {
        const filename = file.split('/').pop()!;
        sessionIds.push(this.parseSessionIdFromFilename(filename));
      }
    }

    return sessionIds;
  }

  private async getSessionFilePath(sessionId: string): Promise<string | null> {
    const files = await this.findAllSessionFiles();
    for (const file of files) {
      if (file.includes(sessionId)) return file;
    }
    return null;
  }

  async *streamSession(projectEncoded: string, sessionId: string): AsyncGenerator<SessionMessage> {
    const filePath = await this.getSessionFilePath(sessionId);
    if (!filePath) return;

    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let currentModel: string | undefined;

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as CodexLine;
        const msg = this.translateMessage(parsed, currentModel);
        if (parsed.type === 'turn_context' && parsed.payload?.model) {
          currentModel = parsed.payload.model;
        }
        if (msg) yield msg;
      } catch {
        // skip malformed
      }
    }
  }

  private translateMessage(line: CodexLine, currentModel?: string): SessionMessage | null {
    if (line.type === 'response_item' && line.payload?.role) {
      const role = line.payload.role as string;
      if (role === 'user' || role === 'assistant') {
        const content = this.translateContent(line.payload.content);
        return {
          type: role,
          timestamp: line.timestamp,
          message: {
            role,
            model: role === 'assistant' ? currentModel : undefined,
            content,
          },
        };
      }
    }
    return null;
  }

  private translateContent(content: any): string | import('./types.js').ContentBlock[] {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';

    return content
      .filter((b: any) => b.type === 'input_text' || b.type === 'output_text' || b.type === 'text')
      .map((b: any) => ({
        type: 'text' as const,
        text: b.text || '',
      }));
  }

  async readSession(projectEncoded: string, sessionId: string): Promise<SessionMessage[]> {
    const messages: SessionMessage[] = [];
    for await (const msg of this.streamSession(projectEncoded, sessionId)) {
      messages.push(msg);
    }
    return messages;
  }

  async readSessionMetadata(projectEncoded: string, sessionId: string): Promise<SessionMetadata> {
    const filePath = await this.getSessionFilePath(sessionId);
    const metadata: SessionMetadata = {
      sessionId,
      provider: 'codex',
      project: decodeProjectPath(projectEncoded),
      projectEncoded,
      filePath: filePath ?? '',
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      models: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    if (!filePath) return metadata;

    const models = new Set<string>();
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as CodexLine;

        if (parsed.type === 'session_meta') {
          const meta = parsed.payload as CodexSessionMeta;
          if (meta.cwd && !metadata.cwd) metadata.cwd = meta.cwd;
          if (meta.git?.branch) metadata.gitBranch = meta.git.branch;
          if (meta.cli_version) metadata.version = meta.cli_version;
          metadata.entrypoint = 'cli';
          if (!metadata.firstTimestamp) metadata.firstTimestamp = parsed.timestamp;
        }

        if (parsed.type === 'turn_context' && parsed.payload?.model) {
          models.add(parsed.payload.model);
        }

        if (parsed.type === 'response_item' && parsed.payload?.role) {
          metadata.messageCount++;
          metadata.lastTimestamp = parsed.timestamp;

          if (parsed.payload.role === 'user') {
            metadata.userMessageCount++;
            if (!metadata.firstUserMessage) {
              const text = this.extractFirstText(parsed.payload.content);
              if (text) metadata.firstUserMessage = text.slice(0, 200);
            }
          } else if (parsed.payload.role === 'assistant') {
            metadata.assistantMessageCount++;
          }
        }
      } catch {
        // skip
      }
    }

    metadata.models = [...models];
    return metadata;
  }

  private extractFirstText(content: any): string | null {
    if (!content) return null;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return null;
    for (const block of content) {
      if ((block.type === 'input_text' || block.type === 'output_text' || block.type === 'text') && block.text) {
        const text = block.text as string;
        if (!text.startsWith('<environment_context>') && !text.startsWith('<skills_instructions>')) {
          return text;
        }
      }
    }
    return null;
  }

  async readActiveSessions(): Promise<ActiveSession[]> {
    return [];
  }

  async readHistory(_limit?: number): Promise<HistoryEntry[]> {
    return [];
  }

  async getSessionFileStats(projectEncoded: string, sessionId: string): Promise<{ size: number; mtime: Date } | null> {
    const filePath = await this.getSessionFilePath(sessionId);
    if (!filePath) return null;
    try {
      const s = await stat(filePath);
      return { size: s.size, mtime: s.mtime };
    } catch {
      return null;
    }
  }
}
