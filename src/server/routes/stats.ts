import type { FastifyInstance } from 'fastify';
import { SessionIndex } from '../../core/session-index.js';

export function registerStatsRoutes(app: FastifyInstance): void {
  const index = new SessionIndex();

  app.get('/api/stats', async (req) => {
    const query = req.query as Record<string, string>;
    const sessions = await index.getAllSessions({ project: query.project });

    return {
      totalSessions: sessions.length,
      totalUserMessages: sessions.reduce((s, m) => s + m.userMessageCount, 0),
      totalAssistantMessages: sessions.reduce((s, m) => s + m.assistantMessageCount, 0),
      totalInputTokens: sessions.reduce((s, m) => s + m.totalInputTokens, 0),
      totalOutputTokens: sessions.reduce((s, m) => s + m.totalOutputTokens, 0),
      models: countBy(sessions.flatMap(s => s.models)),
      daily: getDailyBreakdown(sessions),
    };
  });
}

function countBy(items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
}

function getDailyBreakdown(sessions: { lastTimestamp?: string }[]): { date: string; count: number }[] {
  const daily = new Map<string, number>();
  for (const s of sessions) {
    if (!s.lastTimestamp) continue;
    const date = s.lastTimestamp.slice(0, 10);
    daily.set(date, (daily.get(date) ?? 0) + 1);
  }
  return [...daily.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}
