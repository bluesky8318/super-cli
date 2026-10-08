import type { FastifyInstance, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { ConfigManager } from '../../core/config.js';
import { renderDailyReportHtml } from '../../core/wechat-report-html.js';
import {
  WechatClient,
  aggregateDashboard,
  buildDailyReport,
  cleanName,
  dayRange,
  getWxServerStatus,
  startWxServer,
  stopWxServer,
} from '../../core/wechat.js';
import {
  SummaryGenerator,
  DEFAULT_SUMMARY_PROMPT,
  checkRuntimes,
  getSummaryConfig,
  type SummaryRuntime,
} from '../../core/wechat-summary.js';
import { summaryKey } from '../../core/wechat-summary-store.js';

/** How long a report request waits for a fresh AI summary before falling back to a "generating" placeholder. */
const SUMMARY_WAIT_MS = 90_000;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Self-contained progress page served at /report-progress (see route below). */
const REPORT_PROGRESS_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>正在生成日报摘要…</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
    background: #f7f4ef; color: #3d362e;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
  }
  .card {
    background: #fff; border: 1px solid #e8e2d8; border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,.06);
    padding: 36px 40px; width: 420px; max-width: 90vw; text-align: center;
  }
  .spinner {
    width: 36px; height: 36px; margin: 0 auto 18px;
    border: 3px solid #eee4d4; border-top-color: #b8860b; border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  h2 { font-size: 16px; font-weight: 600; margin-bottom: 6px; word-break: break-all; }
  .sub { font-size: 12px; color: #a39a8b; margin-bottom: 20px; }
  .bar { height: 6px; border-radius: 999px; background: #f0ebe3; overflow: hidden; }
  .fill {
    height: 100%; width: 40%; border-radius: 999px; background: #b8860b;
    animation: slide 1.4s ease-in-out infinite;
  }
  @keyframes slide {
    0% { margin-left: -40%; } 100% { margin-left: 100%; }
  }
  .elapsed { font-size: 12px; color: #a39a8b; margin-top: 12px; }
  .skip { margin-top: 18px; font-size: 12px; }
  .skip a { color: #b8860b; text-decoration: none; }
  .skip a:hover { text-decoration: underline; }
  .error-box { display: none; margin-top: 16px; font-size: 12px; color: #c2402f; word-break: break-all; }
  .error-box.show { display: block; }
</style>
</head>
<body>
<div class="card">
  <div class="spinner" id="spinner"></div>
  <h2 id="title">正在生成 AI 摘要…</h2>
  <div class="sub">首次生成需要调用本地模型，之后将使用缓存</div>
  <div class="bar"><div class="fill" id="fill"></div></div>
  <div class="elapsed" id="elapsed">已用时 0s · 完成后自动打开日报</div>
  <div class="error-box" id="errorBox"></div>
  <div class="skip"><a id="skipLink" href="#">不等了，直接查看日报（摘要生成后会出现在日报里）</a></div>
</div>
<script>
(function () {
  var p = new URLSearchParams(location.search);
  var talker = p.get('talker') || '';
  var date = p.get('date') || '';
  var name = p.get('name') || talker;
  var reportUrl = '/api/wechat/report/view?talker=' + encodeURIComponent(talker)
    + '&date=' + encodeURIComponent(date) + '&name=' + encodeURIComponent(name);
  document.getElementById('title').textContent = '正在为「' + name + '」生成 AI 摘要…';
  document.getElementById('skipLink').href = reportUrl;

  var secs = 0;
  var elapsedEl = document.getElementById('elapsed');
  var timer = setInterval(function () {
    secs++;
    elapsedEl.textContent = '已用时 ' + secs + 's · 完成后自动打开日报';
    if (secs >= 180) showError('生成超时（3 分钟）。可稍后在看板设置中重新生成，或直接查看日报。');
  }, 1000);

  function showError(msg) {
    clearInterval(timer);
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('fill').style.animation = 'none';
    document.getElementById('fill').style.width = '100%';
    document.getElementById('fill').style.background = '#c2402f';
    elapsedEl.textContent = '生成失败';
    var box = document.getElementById('errorBox');
    box.textContent = msg;
    box.className = 'error-box show';
  }

  function done() { location.replace(reportUrl); }

  function poll() {
    fetch('/api/wechat/summaries/' + encodeURIComponent(talker + '|' + date))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var entry = data && data.entry;
        if (entry && entry.status === 'done') { done(); return; }
        if (entry && entry.status === 'error') { showError(entry.error || '摘要生成失败'); return; }
        setTimeout(poll, 2500);
      })
      .catch(function () { setTimeout(poll, 3000); });
  }

  fetch('/api/wechat/summaries/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ talker: talker, date: date, name: name, wait: false }),
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (data && data.entry && data.entry.status === 'done') { done(); return; }
      poll();
    })
    .catch(function () { poll(); });
})();
</script>
</body>
</html>`;

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
  const summaries = new SummaryGenerator();

  // Managed wx-cli server lifecycle (status / start / stop).
  app.get('/api/wechat/server', async () => getWxServerStatus());
  app.post('/api/wechat/server/start', async () => startWxServer());
  app.post('/api/wechat/server/stop', async () => stopWxServer());

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

  /** Shared report builder for the JSON API and the raw .md endpoint. */
  async function buildReport(query: Record<string, string>, reply: FastifyReply) {
    const talker = query.talker ?? '';
    if (!talker) {
      reply.code(400);
      return { error: 'talker is required' } as const;
    }
    const date = DATE_RE.test(query.date ?? '') ? query.date : new Date().toLocaleDateString('sv-SE');
    const client = await WechatClient.fromConfig();
    const status = await client.getStatus();
    if (!status.reachable) {
      reply.code(502);
      return { error: { code: 'WX_UNAVAILABLE', message: status.error ?? 'wx-cli server 不可达' } } as const;
    }
    const { since, until } = dayRange(date);
    const items = await client.chatMessages(talker, since, until);
    const { myNames, myWxid } = await resolveMyNames(status.account);
    const chatName = query.name || items[0]?.talker_display_name || talker;

    // AI summary: cached by chat+date; generate on first view and wait a
    // bounded time, otherwise render a "generating" placeholder.
    const key = summaryKey(talker, date);
    let entry = await summaries.get(key);
    if (entry?.status !== 'done') {
      const task = summaries.generate(talker, chatName, date, items);
      entry = (await Promise.race([task, sleep(SUMMARY_WAIT_MS).then(() => null)]))
        ?? (await summaries.get(key));
    }
    return buildDailyReport(talker, chatName, date, items, myNames, myWxid, {
      text: entry?.status === 'done' ? entry.summary : null,
      status: entry?.status,
      note: entry?.status === 'error' ? entry.error : undefined,
    });
  }

  app.get('/api/wechat/report', async (req, reply) => {
    return buildReport(req.query as Record<string, string>, reply);
  });

  // Raw markdown endpoint for "view report in a new tab". The pathname ends
  // with .md so browser extensions (e.g. the docu.md Markdown Viewer) detect
  // and render it; otherwise it displays as inline plain text.
  app.get('/api/wechat/report/daily-report.md', async (req, reply) => {
    const report = await buildReport(req.query as Record<string, string>, reply);
    if ('error' in report) return report;
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    return reply.send(report.markdown);
  });

  // HTML report viewer: full-width image table + click-to-zoom lightbox.
  app.get('/api/wechat/report/view', async (req, reply) => {
    const report = await buildReport(req.query as Record<string, string>, reply);
    if ('error' in report) return report;
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(renderDailyReportHtml(report));
  });

  // Media proxy: streams decrypted images/files from wx-cli. Keeps the wx-cli
  // token server-side so reports can embed same-origin media URLs.
  app.get('/api/wechat/media', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const serverId = query.server_id ?? '';
    const talker = query.talker ?? '';
    if (!serverId || !talker) {
      reply.code(400);
      return { error: 'server_id and talker are required' };
    }
    const client = await WechatClient.fromConfig();
    try {
      const res = await client.fetchMedia(serverId, talker);
      if (!res.ok || !res.body) {
        reply.code(res.ok ? 502 : res.status);
        return { error: `wx-cli media ${res.status}` };
      }
      reply.header('Content-Type', res.headers.get('content-type') ?? 'application/octet-stream');
      const len = res.headers.get('content-length');
      if (len) reply.header('Content-Length', len);
      const disposition = res.headers.get('content-disposition');
      if (disposition) reply.header('Content-Disposition', disposition);
      return reply.send(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream));
    } catch (err) {
      reply.code(502);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  /* ====== AI summary: prompt/runtime config + cache management ====== */

  app.get('/api/wechat/summary-config', async () => {
    const { prompt, runtime, model } = await getSummaryConfig();
    return {
      prompt,
      defaultPrompt: DEFAULT_SUMMARY_PROMPT,
      runtime,
      model,
      runtimes: await checkRuntimes(),
    };
  });

  app.put('/api/wechat/summary-config', async (req) => {
    const body = (req.body ?? {}) as { prompt?: string; runtime?: string; model?: string };
    const config = new ConfigManager();
    if (typeof body.prompt === 'string') await config.set('wechatSummaryPrompt', body.prompt);
    if (typeof body.runtime === 'string' && ['pi', 'kimi', 'mcode', 'qoder'].includes(body.runtime)) {
      await config.set('wechatSummaryRuntime', body.runtime as SummaryRuntime);
    }
    if (typeof body.model === 'string') await config.set('wechatSummaryModel', body.model.trim());
    const { prompt, runtime, model } = await getSummaryConfig();
    return { prompt, defaultPrompt: DEFAULT_SUMMARY_PROMPT, runtime, model, runtimes: await checkRuntimes() };
  });

  app.get('/api/wechat/summaries', async () => {
    return { summaries: await summaries.list() };
  });

  app.get('/api/wechat/summaries/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const entry = await summaries.get(key);
    if (!entry) {
      reply.code(404);
      return { error: 'summary not found' };
    }
    return { entry };
  });

  // Generate (or regenerate with force) a summary on demand. By default waits
  // for the result; wait:false kicks off background generation and returns the
  // current entry immediately (used by the report progress page).
  app.post('/api/wechat/summaries/generate', async (req, reply) => {
    const body = (req.body ?? {}) as { talker?: string; date?: string; name?: string; force?: boolean; wait?: boolean };
    const talker = body.talker ?? '';
    if (!talker) {
      reply.code(400);
      return { error: 'talker is required' };
    }
    const date = DATE_RE.test(body.date ?? '') ? body.date! : new Date().toLocaleDateString('sv-SE');
    const client = await WechatClient.fromConfig();
    const status = await client.getStatus();
    if (!status.reachable) {
      reply.code(502);
      return { error: { code: 'WX_UNAVAILABLE', message: status.error ?? 'wx-cli server 不可达' } };
    }
    const { since, until } = dayRange(date);
    const items = await client.chatMessages(talker, since, until);
    const chatName = body.name || items[0]?.talker_display_name || talker;
    const task = summaries.generate(talker, chatName, date, items, { force: body.force === true });
    if (body.wait === false) {
      // Background mode: return the current entry if visible, else a pending
      // stub — the progress page polls until the entry settles.
      void task;
      const key = summaryKey(talker, date);
      const entry = (await summaries.get(key)) ?? {
        key, talker, chatName, date, status: 'pending' as const,
        createdAt: '', updatedAt: '',
      };
      return { entry };
    }
    return { entry: await task };
  });

  app.delete('/api/wechat/summaries/:key', async (req) => {
    const { key } = req.params as { key: string };
    await summaries.remove(key);
    return { success: true };
  });

  app.post('/api/wechat/summaries/clear', async () => {
    await summaries.clear();
    return { success: true };
  });

  // Progress page for "查看日报": opens instantly in the new tab, kicks off
  // background summary generation, polls, then redirects to the report URL.
  // Fully self-contained (reads params from location.search) — no templating.
  app.get('/report-progress', async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(REPORT_PROGRESS_HTML);
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
