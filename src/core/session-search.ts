import type { SearchOptions, SearchResult, SearchHit, SessionMessage } from './types.js';
import { SessionReader } from './session-reader.js';
import { CodexReader } from './codex-reader.js';
import { SessionIndex } from './session-index.js';

export class SessionSearch {
  private index: SessionIndex;

  constructor(_reader?: SessionReader, index?: SessionIndex) {
    this.index = index ?? new SessionIndex();
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const sessions = await this.index.getAllSessions({
      project: options?.project,
      since: options?.since,
    });

    const results: SearchResult[] = [];
    const maxResults = options?.maxResults ?? 50;
    let totalFound = 0;

    for (const session of sessions) {
      if (totalFound >= maxResults) break;

      const reader = this.index.getReaderForSession(session);
      if (!reader) continue;

      const hits = await this.searchInSession(
        reader,
        session.projectEncoded,
        session.sessionId,
        query,
        options,
      );

      if (hits.length > 0) {
        results.push({
          sessionId: session.sessionId,
          project: session.project,
          hits: hits.slice(0, 5),
          totalHits: hits.length,
        });
        totalFound += hits.length;
      }
    }

    return results;
  }

  private async searchInSession(
    reader: SessionReader | CodexReader,
    projectEncoded: string,
    sessionId: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchHit[]> {
    const hits: SearchHit[] = [];
    const flags = options?.caseSensitive ? '' : 'i';
    const regex = new RegExp(escapeRegex(query), flags);
    const types = options?.messageTypes ?? ['user', 'assistant'];

    for await (const msg of reader.streamSession(projectEncoded, sessionId)) {
      if (!types.includes(msg.type as 'user' | 'assistant')) continue;
      if (msg.type !== 'user' && msg.type !== 'assistant') continue;

      const text = extractText(msg);
      if (!text) continue;

      if (regex.test(text)) {
        hits.push({
          type: msg.type,
          timestamp: msg.timestamp,
          snippet: createSnippet(text, query, options?.caseSensitive),
        });
      }
    }

    return hits;
  }
}

function extractText(msg: SessionMessage): string | null {
  if (!msg.message?.content) return null;
  if (typeof msg.message.content === 'string') return msg.message.content;
  if (Array.isArray(msg.message.content)) {
    return msg.message.content
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text!)
      .join('\n');
  }
  return null;
}

function createSnippet(text: string, query: string, caseSensitive?: boolean): string {
  const flags = caseSensitive ? '' : 'i';
  const idx = text.search(new RegExp(escapeRegex(query), flags));
  if (idx === -1) return text.slice(0, 150);

  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + query.length + 100);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet.replace(/\n/g, ' ');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
