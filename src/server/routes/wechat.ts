import type { FastifyInstance } from 'fastify';
import { ConfigManager } from '../../core/config.js';
import {
  WechatClient,
  aggregateDashboard,
  buildDailyReport,
  cleanName,
  dayRange,
} from '../../core/wechat.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "My" WeChat names for @-mention detection: config list + account name/wxid. */
async function resolveMyNames(account?: { wxid: string; name: string }): Promise<{ myNames: string[]; myWxid: string }> {
  const config = await new ConfigManager().load();
  const s = (config.settings ?? {}) as Record<string, unknown>;
  const configured = typeof s.wechatNames === 'string'
    ? s.wechatNames.split(',').map(n => n.trim()).filter(Boolean)
    : [];
  const names = new Set(configured);
  if (account?.name) names.add(account.name);
  return { myNames: [...names], myWxid: account?.wxid ?? '' };
}

export function registerWechatRoutes(app: FastifyInstance): void {
  app.get('/api/wechat/status', async () => {
    const client = await WechatClient.fromConfig();
    return client.getStatus();
  });

  app.get('/api/wechat/dashboard', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const date = DATE_RE.test(query.date ?? '') ? query.date : new Date().toLocaleDateString('sv-SE');
    const client = await WechatClient.fromConfig();
    const status = await client.getStatus();
    if (!status.reachable) {
      reply.code(502);
      return { error: { code: 'WX_UNAVAILABLE', message: status.error ?? 'wx-cli server 不可达' } };
    }
    const { since, until } = dayRange(date);
    // Sessions universe (recent ~1000) gives total group count for silent-group stats.
    const [items, sessions] = await Promise.all([
      client.timeline(since, until),
      client.sessions(1000).catch(() => []),
    ]);
    const totalGroups = sessions.filter(s => s.username.includes('@chatroom')).length;
    const { myNames, myWxid } = await resolveMyNames(status.account);
    return aggregateDashboard(date, items, myNames, myWxid, totalGroups);
  });

  app.get('/api/wechat/report', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const talker = query.talker ?? '';
    if (!talker) {
      reply.code(400);
      return { error: 'talker is required' };
    }
    const date = DATE_RE.test(query.date ?? '') ? query.date : new Date().toLocaleDateString('sv-SE');
    const client = await WechatClient.fromConfig();
    const status = await client.getStatus();
    if (!status.reachable) {
      reply.code(502);
      return { error: { code: 'WX_UNAVAILABLE', message: status.error ?? 'wx-cli server 不可达' } };
    }
    const { since, until } = dayRange(date);
    const items = await client.chatMessages(talker, since, until);
    const { myNames, myWxid } = await resolveMyNames(status.account);
    const chatName = query.name || items[0]?.talker_display_name || talker;
    return buildDailyReport(talker, chatName, date, items, myNames, myWxid);
  });

  // Grouped global search: sessions (name match), contacts (server-side), messages (FTS).
  app.get('/api/wechat/search', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const q = (query.q ?? '').trim();
    if (!q) {
      reply.code(400);
      return { error: 'q is required' };
    }
    const client = await WechatClient.fromConfig();
    const [sessions, contacts, messages] = await Promise.all([
      client.sessions(1000).catch(() => []),
      client.contacts(q, 10).catch(() => []),
      client.search(q, 15).catch(() => []),
    ]);
    const lower = q.toLowerCase();
    const groups = sessions
      .filter(s =>
        (s.display_name ?? '').toLowerCase().includes(lower)
        || s.username.toLowerCase().includes(lower))
      .slice(0, 6)
      .map(s => ({
        talker: s.username,
        name: cleanName(s.display_name, s.username),
        isGroup: s.username.includes('@chatroom'),
        summary: (s.summary ?? '').slice(0, 80),
        lastTime: s.sort_timestamp,
      }));
    const people = contacts.slice(0, 8).map(c => ({
      userName: c.user_name,
      name: cleanName(c.remark || c.nick_name || c.alias, c.user_name),
      alias: c.alias ?? '',
      nickName: c.nick_name ?? '',
    }));
    return {
      groups,
      people,
      messages: messages.slice(0, 15).map(m => ({
        serverId: m.server_id,
        talker: m.talker ?? '',
        chatName: cleanName(m.talker_display_name, m.talker ?? ''),
        sender: cleanName(m.sender_display_name, m.sender ?? ''),
        snippet: (m.snippet ?? '').slice(0, 120),
        time: m.create_time,
      })),
    };
  });
}
