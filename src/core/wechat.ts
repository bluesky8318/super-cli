/**
 * WeChat board data layer.
 *
 * Thin aggregation layer over the local wx-cli HTTP server (default
 * http://127.0.0.1:9100). No data is stored: every dashboard request pages
 * through wx-cli's timeline API and computes stats on the fly.
 *
 * Settings (via ~/.super-cli/config.json):
 * - wechatUrl:   wx-cli server base URL (default http://127.0.0.1:9100)
 * - wechatToken: Bearer token when wx-cli server is started with --token
 * - wechatNames: comma-separated names of "me" for @-mention detection
 */

import { execFile } from 'node:child_process';
import { ConfigManager } from './config.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:9100';
const PAGE_LIMIT = 1000;
const MAX_PAGES = 30;

export interface WechatAccount {
  wxid: string;
  name: string;
}

export interface WechatStatus {
  reachable: boolean;
  ready?: boolean;
  version?: string;
  account?: WechatAccount;
  error?: string;
}

export interface WechatTimelineItem {
  sort_seq: number;
  /** wx-cli message id. Big-int: kept as string after sanitizing (see WechatClient.get). */
  server_id: number | string;
  msg_type: number;
  /** app-message subtype (msg_type 49): 3/4/5 link, 6 file, 33/36 mini-program, 51 channels video, 57 quote, 62 pat. */
  sub_type?: number;
  sender: string;
  sender_display_name?: string;
  talker: string;
  talker_display_name?: string;
  create_time: number;
  direction?: string;
  snippet?: string;
  /** Structured payload for non-text messages (image/file/link/...). */
  content?: WechatMediaContent | null;
}

/** Shapes seen in wx-cli `content` for rich message types. */
export interface WechatMediaContent {
  Image?: { md5?: string };
  File?: { title?: string; file_ext?: string; file_size?: number; md5?: string };
  Link?: { sub_type?: number; title?: string; des?: string; url?: string };
  AppGeneric?: { sub_type?: number; title?: string | null; des?: string | null; url?: string | null };
}

export interface WechatActiveChat {
  talker: string;
  name: string;
  isGroup: boolean;
  messageCount: number;
  lastTime: number;
  senders: string[];
}

export interface WechatMention {
  time: number;
  chatName: string;
  talker: string;
  sender: string;
  snippet: string;
}

export interface WechatLink {
  url: string;
  domain: string;
  title: string;
  chatName: string;
  sender: string;
  time: number;
  count: number;
}

export interface WechatPerson {
  sender: string;
  messageCount: number;
  chatCount: number;
  lastTime: number;
}

export interface WechatDashboard {
  date: string;
  cards: {
    totalMessages: number;
    activeChats: number;
    groupChats: number;
    totalGroups: number;
    silentGroups: number;
    mentions: number;
    links: number;
    myMessages: number;
  };
  hourly: number[];
  activeChats: WechatActiveChat[];
  mentions: WechatMention[];
  links: WechatLink[];
  people: WechatPerson[];
}

export interface WechatReport {
  talker: string;
  chatName: string;
  date: string;
  /** AI-generated chat summary; null/absent when not generated. */
  summary?: string | null;
  summaryStatus?: 'pending' | 'done' | 'error' | 'none';
  summaryNote?: string;
  markdown: string;
  images: WechatReportImage[];
  files: WechatReportFile[];
  miniApps: WechatReportMiniApp[];
  links: { url: string; title?: string; sender: string; time: number }[];
  topMembers: { name: string; count: number }[];
  stats: {
    totalMessages: number;
    activeMembers: number;
    links: number;
    mentions: number;
    images: number;
    files: number;
    miniApps: number;
    firstTime?: number;
    lastTime?: number;
  };
}

export interface WechatReportImage {
  serverId: number | string;
  sender: string;
  time: number;
  /** Neighboring text messages (前一句 / 后一句), already cell-safe truncated. */
  context?: { prev?: WechatReportImageContext; next?: WechatReportImageContext };
}

/** A neighboring text message around an image (前一条 / 后一条). */
export interface WechatReportImageContext {
  sender: string;
  time: number;
  text: string;
}

export interface WechatReportFile {
  serverId: number | string;
  title: string;
  ext: string;
  size: number;
  sender: string;
  time: number;
}

export interface WechatReportMiniApp {
  title: string;
  sender: string;
  time: number;
}

const URL_RE = /https?:\/\/[^\s<>"'）)】\]」]+\??[^\s<>"'）)】\]」]*/g;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function cleanName(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  // wx-cli display names look like "AI 神思会-3 群-JKL（57203631147@chatroom）".
  return raw.replace(/（[^（）]*@chatroom）$/, '').replace(/（[^（）]*）$/, '').trim() || fallback;
}

function extractLinks(snippet: string): string[] {
  return snippet.match(URL_RE) ?? [];
}

export class WechatClient {
  private baseUrl: string;
  private token: string;

  private constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  static async fromConfig(): Promise<WechatClient> {
    const config = await new ConfigManager().load();
    const s = (config.settings ?? {}) as Record<string, unknown>;
    return new WechatClient(
      typeof s.wechatUrl === 'string' && s.wechatUrl.trim() ? s.wechatUrl.trim() : DEFAULT_BASE_URL,
      typeof s.wechatToken === 'string' ? s.wechatToken.trim() : '',
    );
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      // wx-cli error bodies can be huge (e.g. a full contact dump); keep the message usable.
      const body = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`wx-cli ${res.status}: ${body}`);
    }
    // server_id values are 19-digit big-ints; JSON.parse would silently lose
    // precision (e.g. ...407 -> ...400) and break media lookups. Quote them first.
    const text = await res.text();
    const safe = text.replace(/"server_id"\s*:\s*(\d{15,})/g, '"server_id":"$1"');
    return JSON.parse(safe) as T;
  }

  async getStatus(): Promise<WechatStatus> {
    try {
      const health = await this.get<{
        ready?: boolean;
        cli_version?: string;
        current_account?: WechatAccount;
      }>('/api/v1/health');
      return {
        reachable: true,
        ready: health.ready,
        version: health.cli_version,
        account: health.current_account,
      };
    } catch (err) {
      return { reachable: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async timelinePage(since: number, until: number, offset: number): Promise<{
    items: WechatTimelineItem[];
    hasMore: boolean;
  }> {
    const data = await this.get<{
      items?: WechatTimelineItem[];
      paging?: { has_more?: boolean };
    }>('/api/v1/timeline', { since, until, limit: PAGE_LIMIT, offset, order: 'asc' });
    return { items: data.items ?? [], hasMore: data.paging?.has_more ?? false };
  }

  /** Page through the full timeline for a time range. */
  async timeline(since: number, until: number): Promise<WechatTimelineItem[]> {
    const all: WechatTimelineItem[] = [];
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { items, hasMore } = await this.timelinePage(since, until, offset);
      all.push(...items);
      if (!hasMore || items.length === 0) break;
      offset += items.length;
    }
    return all;
  }

  /** Messages of a single chat for a time range. */
  async chatMessages(contact: string, since: number, until: number): Promise<WechatTimelineItem[]> {
    const all: WechatTimelineItem[] = [];
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.get<{
        items?: WechatTimelineItem[];
        paging?: { has_more?: boolean };
      }>('/api/v1/messages', { contact, since, until, limit: PAGE_LIMIT, offset, order: 'asc' });
      const items = data.items ?? [];
      all.push(...items);
      if (!(data.paging?.has_more ?? false) || items.length === 0) break;
      offset += items.length;
    }
    return all;
  }

  async search(q: string, limit = 50): Promise<WechatSearchHit[]> {
    const data = await this.get<{ items?: WechatSearchHit[] }>('/api/v1/search', { q, limit });
    return data.items ?? [];
  }

  async sessions(limit = 1000): Promise<WechatSession[]> {
    const data = await this.get<{ items?: WechatSession[] }>('/api/v1/sessions', { limit });
    return data.items ?? [];
  }

  async contacts(search: string, limit = 20): Promise<WechatContact[]> {
    const data = await this.get<{ items?: WechatContact[] }>('/api/v1/contacts', { search, limit });
    return data.items ?? [];
  }

  /** Raw media download (image/file binary) by message server_id + talker. */
  async fetchMedia(serverId: number | string, talker: string): Promise<Response> {
    const url = new URL(`${this.baseUrl}/api/v1/media`);
    url.searchParams.set('server_id', String(serverId));
    url.searchParams.set('talker', talker);
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  }
}

export interface WechatSession {
  username: string;
  display_name?: string;
  summary?: string;
  sort_timestamp?: number;
  direction?: string;
}

export interface WechatContact {
  user_name: string;
  alias?: string;
  remark?: string;
  nick_name?: string;
  labels?: string[];
}

export interface WechatSearchHit {
  server_id?: number;
  talker?: string;
  talker_display_name?: string;
  sender?: string;
  sender_display_name?: string;
  snippet?: string;
  create_time?: number;
  hit_type?: string;
}

export { cleanName };

/* ====== Managed wx-cli server lifecycle (start/stop/status) ====== */

export interface WxServerStatus {
  /** wx-cli binary found in PATH. */
  installed: boolean;
  running: boolean;
  pid?: number | null;
  baseUrl?: string;
  ready?: boolean;
  health?: string;
  version?: string | null;
  account?: WechatAccount | null;
  stdoutLog?: string;
  stderrLog?: string;
  error?: string;
}

const WX_CLI_BIN = 'wx-cli';

function execWx(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(WX_CLI_BIN, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const notFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
        reject(new Error(notFound ? 'wx-cli 未安装（PATH 中找不到 wx-cli）' : (String(stderr).trim() || err.message)));
        return;
      }
      resolve(stdout);
    });
  });
}

/** Managed server status via `wx-cli server status --format json`. */
export async function getWxServerStatus(): Promise<WxServerStatus> {
  try {
    const out = await execWx(['server', 'status', '--format', 'json'], 15_000);
    const d = JSON.parse(out);
    return {
      installed: true,
      running: d.status === 'running',
      pid: d.pid ?? null,
      baseUrl: d.base_url,
      ready: !!d.ready,
      health: d.health,
      version: d.cli_version ?? null,
      account: d.current_account ?? null,
      stdoutLog: d.stdout_log,
      stderrLog: d.stderr_log,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { installed: !msg.includes('未安装'), running: false, error: msg };
  }
}

/** Start the managed server and wait until it reports ready (or the timeout hits). */
export async function startWxServer(timeoutMs = 15_000): Promise<WxServerStatus> {
  await execWx(['server', 'run'], 30_000);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await getWxServerStatus();
    if ((status.running && status.ready) || Date.now() > deadline) return status;
    await new Promise(r => setTimeout(r, 500));
  }
}

/** Stop the managed server, then return the refreshed status. */
export async function stopWxServer(): Promise<WxServerStatus> {
  await execWx(['server', 'stop'], 30_000);
  return getWxServerStatus();
}

/** [start, end) epoch seconds of a local date (YYYY-MM-DD). */
export function dayRange(date: string): { since: number; until: number } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { since: Math.floor(start.getTime() / 1000), until: Math.floor(end.getTime() / 1000) };
}

function isMine(msg: WechatTimelineItem, myWxid: string): boolean {
  return msg.direction === 'outgoing' || (!!myWxid && msg.sender === myWxid);
}

function isMentionOfMe(msg: WechatTimelineItem, myNames: string[], myWxid: string): boolean {
  if (!msg.snippet || isMine(msg, myWxid)) return false;
  return myNames.some(n => n && msg.snippet!.includes(`@${n}`));
}

export function aggregateDashboard(
  date: string,
  items: WechatTimelineItem[],
  myNames: string[],
  myWxid: string,
  totalGroups = 0,
): WechatDashboard {
  const hourly = new Array<number>(24).fill(0);
  const chatMap = new Map<string, WechatActiveChat & { senderSet: Set<string> }>();
  const linkMap = new Map<string, WechatLink>();
  const peopleMap = new Map<string, WechatPerson & { chatSet: Set<string> }>();
  const mentions: WechatMention[] = [];
  let myMessages = 0;

  for (const msg of items) {
    const hour = new Date(msg.create_time * 1000).getHours();
    hourly[hour]++;

    if (isMine(msg, myWxid)) myMessages++;

    const isGroup = msg.talker.includes('@chatroom');
    const chatName = cleanName(msg.talker_display_name, msg.talker);
    let chat = chatMap.get(msg.talker);
    if (!chat) {
      chat = {
        talker: msg.talker,
        name: chatName,
        isGroup,
        messageCount: 0,
        lastTime: 0,
        senders: [],
        senderSet: new Set(),
      };
      chatMap.set(msg.talker, chat);
    }
    chat.messageCount++;
    chat.lastTime = Math.max(chat.lastTime, msg.create_time);
    if (msg.sender) chat.senderSet.add(msg.sender);

    // People: incoming senders only
    if (!isMine(msg, myWxid) && msg.sender) {
      const senderName = cleanName(msg.sender_display_name, msg.sender);
      let person = peopleMap.get(msg.sender);
      if (!person) {
        person = { sender: senderName, messageCount: 0, chatCount: 0, lastTime: 0, chatSet: new Set() };
        peopleMap.set(msg.sender, person);
      }
      person.messageCount++;
      person.lastTime = Math.max(person.lastTime, msg.create_time);
      person.chatSet.add(msg.talker);
    }

    // Mentions of me
    if (isMentionOfMe(msg, myNames, myWxid)) {
      mentions.push({
        time: msg.create_time,
        chatName,
        talker: msg.talker,
        sender: cleanName(msg.sender_display_name, msg.sender),
        snippet: (msg.snippet ?? '').slice(0, 200),
      });
    }

    // Links
    for (const url of extractLinks(msg.snippet ?? '')) {
      const existing = linkMap.get(url);
      if (existing) {
        existing.count++;
        existing.time = Math.max(existing.time, msg.create_time);
      } else {
        const title = (msg.snippet ?? '').replace(URL_RE, '').trim().slice(0, 80);
        linkMap.set(url, {
          url,
          domain: domainOf(url),
          title,
          chatName,
          sender: cleanName(msg.sender_display_name, msg.sender),
          time: msg.create_time,
          count: 1,
        });
      }
    }
  }

  const activeChats = [...chatMap.values()]
    .map(({ senderSet, ...rest }) => ({ ...rest, senders: [...senderSet] }))
    .sort((a, b) => b.messageCount - a.messageCount);

  const people = [...peopleMap.values()]
    .map(({ chatSet, ...rest }) => ({ ...rest, chatCount: chatSet.size }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 20);

  const links = [...linkMap.values()].sort((a, b) => b.time - a.time);

  const groupChats = [...chatMap.values()].filter(c => c.isGroup).length;
  return {
    date,
    cards: {
      totalMessages: items.length,
      activeChats: chatMap.size,
      groupChats,
      totalGroups,
      silentGroups: Math.max(0, totalGroups - groupChats),
      mentions: mentions.length,
      links: links.length,
      myMessages,
    },
    hourly,
    activeChats,
    mentions: mentions.sort((a, b) => b.time - a.time),
    links,
    people,
  };
}

function fmtTime(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** super-cli media proxy URL embedded in reports (same-origin, keeps wx-cli token server-side). */
export function mediaUrl(serverId: number | string, talker: string): string {
  return `/api/wechat/media?server_id=${serverId}&talker=${encodeURIComponent(talker)}`;
}

/** Cap long report sections; the remainder is summarized as a count line. */
const MAX_SECTION_ITEMS = 50;

export function buildDailyReport(
  talker: string,
  chatName: string,
  date: string,
  items: WechatTimelineItem[],
  myNames: string[],
  myWxid: string,
  summary?: { text?: string | null; status?: 'pending' | 'done' | 'error'; note?: string } | null,
): WechatReport {
  const memberMap = new Map<string, number>();
  const links: { url: string; title?: string; sender: string; time: number }[] = [];
  const mentions: WechatMention[] = [];
  const images: (WechatReportImage & { idx: number })[] = [];
  const files: WechatReportFile[] = [];
  const miniApps: WechatReportMiniApp[] = [];

  // wx-cli returns URLs from XML payloads still &-escaped ("&amp;"); decode or
  // links break when re-escaped in HTML. WeChat media CDN download links
  // (stodownload) expire quickly and are noise in the links section.
  const normUrl = (u: string) => u.replace(/&amp;/g, '&');
  const isMediaCdnUrl = (u: string) => u.includes('tc.qq.com') && u.includes('stodownload');

  for (let idx = 0; idx < items.length; idx++) {
    const msg = items[idx];
    const senderName = cleanName(msg.sender_display_name, msg.sender);
    memberMap.set(senderName, (memberMap.get(senderName) ?? 0) + 1);
    for (const url of extractLinks(msg.snippet ?? '')) {
      const u = normUrl(url);
      if (!isMediaCdnUrl(u)) links.push({ url: u, sender: senderName, time: msg.create_time });
    }
    if (isMentionOfMe(msg, myNames, myWxid)) {
      mentions.push({
        time: msg.create_time,
        chatName,
        talker,
        sender: senderName,
        snippet: (msg.snippet ?? '').slice(0, 200),
      });
    }

    // Images (msg_type 3)
    if (msg.msg_type === 3) {
      images.push({ serverId: msg.server_id, sender: senderName, time: msg.create_time, idx });
      continue;
    }
    if (msg.msg_type !== 49) continue;

    // Files (app subtype 6)
    if (msg.sub_type === 6) {
      const f = msg.content?.File;
      files.push({
        serverId: msg.server_id,
        title: f?.title?.trim() || (msg.snippet ?? '').replace(/^\[文件\]\s*/, '').trim() || '未命名文件',
        ext: f?.file_ext ?? '',
        size: f?.file_size ?? 0,
        sender: senderName,
        time: msg.create_time,
      });
      continue;
    }
    // Mini-programs (app subtype 33/36); content is null, title lives in the snippet
    if (msg.sub_type === 33 || msg.sub_type === 36) {
      miniApps.push({
        title: (msg.snippet ?? '').replace(/^\[小程序\]\s*/, '').trim() || '小程序',
        sender: senderName,
        time: msg.create_time,
      });
      continue;
    }
    // Rich link shares (article/music/video, subtypes 3/4/5) carry title+url in content.
    if (msg.sub_type === 3 || msg.sub_type === 4 || msg.sub_type === 5) {
      const link = msg.content?.Link ?? msg.content?.AppGeneric;
      if (link?.url && !isMediaCdnUrl(link.url)) {
        links.push({ url: normUrl(link.url), title: link.title?.trim() || undefined, sender: senderName, time: msg.create_time });
      }
    }
  }

  const topMembers = [...memberMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const times = items.map(i => i.create_time);
  const firstTime = times.length ? Math.min(...times) : undefined;
  const lastTime = times.length ? Math.max(...times) : undefined;

  // Neighboring text messages as image context (前一条 / 后一条, with sender+time).
  const cellText = (s: string, max = 50) => s.replace(/\s+/g, ' ').trim().slice(0, max);
  const nearestText = (idx: number, dir: 1 | -1): WechatReportImageContext | undefined => {
    for (let i = idx + dir; i >= 0 && i < items.length; i += dir) {
      const s = (items[i].snippet ?? '').trim();
      if (items[i].msg_type === 1 && s) {
        return {
          sender: cleanName(items[i].sender_display_name, items[i].sender),
          time: items[i].create_time,
          text: cellText(s),
        };
      }
    }
    return undefined;
  };
  for (const img of images) {
    img.context = { prev: nearestText(img.idx, -1), next: nearestText(img.idx, 1) };
  }

  // Report structure: 标题 / 摘要 / 数据统计 / 活跃成员 / 分享链接 / 图片 / 文件 / 小程序
  const summaryBody = summary?.text
    ?? (summary?.status === 'pending'
      ? `> AI 摘要生成中…稍后刷新本页查看${summary?.note ? `（${summary.note}）` : ''}`
      : summary?.note ?? `> 未生成 AI 摘要`);

  const lines: string[] = [
    `# ${chatName} 日报（${date}）`,
    '',
    '## 摘要（AI 总结）',
    '',
    summaryBody,
    '',
    '## 数据统计',
    '',
    `- 消息总数：${items.length}`,
    `- 活跃成员：${memberMap.size}`,
    ...(firstTime && lastTime ? [`- 活跃时段：${fmtTime(firstTime)} ~ ${fmtTime(lastTime)}`] : []),
    `- 链接分享：${links.length}`,
    `- @我：${mentions.length}`,
    `- 图片：${images.length}`,
    `- 文件：${files.length}`,
    `- 小程序：${miniApps.length}`,
    '',
    '## 活跃成员 TOP10',
    '',
    ...topMembers.map(([name, count], i) => `${i + 1}. ${name}（${count} 条）`),
  ];

  if (links.length) {
    lines.push('', `## 分享链接（${links.length}）`, '');
    for (const l of links.slice(0, MAX_SECTION_ITEMS)) {
      lines.push(`- [${l.title || domainOf(l.url)}](${l.url})（${l.sender} ${fmtTime(l.time)}）`);
    }
    if (links.length > MAX_SECTION_ITEMS) lines.push(`- …其余 ${links.length - MAX_SECTION_ITEMS} 条略`);
  }

  if (images.length) {
    lines.push('', `## 图片（${images.length}）`, '');
    // Pure markdown pipe table (docu.md strips raw HTML blocks). `:---` gives
    // left alignment; column widths are renderer-controlled, thumbnails keep
    // uniform size via the supported inline <img width>.
    const escCell = (s: string) => s.replace(/\|/g, '\\|');
    const fmtCtx = (c?: WechatReportImageContext) => c ? `${escCell(c.sender)} ${fmtTime(c.time)}：${escCell(c.text)}` : '';
    lines.push('| 发送者 | 时间 | 图片 | 上下文 |', '| :--- | :--- | :--- | :--- |');
    for (const img of images.slice(0, MAX_SECTION_ITEMS)) {
      const ctx = [
        img.context?.prev ? `↑ ${fmtCtx(img.context.prev)}` : '',
        img.context?.next ? `↓ ${fmtCtx(img.context.next)}` : '',
      ].filter(Boolean).join('<br>') || '—';
      lines.push(`| ${escCell(cellText(img.sender, 20))} | ${fmtTime(img.time)} | <img src="${mediaUrl(img.serverId, talker)}" width="120"> | ${ctx} |`);
    }
    if (images.length > MAX_SECTION_ITEMS) lines.push('', `…其余 ${images.length - MAX_SECTION_ITEMS} 张略`);
  }

  if (files.length) {
    lines.push('', `## 文件（${files.length}）`, '');
    for (const f of files.slice(0, MAX_SECTION_ITEMS)) {
      lines.push(`- [${f.title}](${mediaUrl(f.serverId, talker)})（${fmtSize(f.size)} · ${f.sender} ${fmtTime(f.time)}）`);
    }
    if (files.length > MAX_SECTION_ITEMS) lines.push(`- …其余 ${files.length - MAX_SECTION_ITEMS} 个略`);
  }

  if (miniApps.length) {
    lines.push('', `## 小程序（${miniApps.length}）`, '');
    for (const m of miniApps.slice(0, MAX_SECTION_ITEMS)) {
      lines.push(`- ${m.title}（${m.sender} ${fmtTime(m.time)}）`);
    }
    if (miniApps.length > MAX_SECTION_ITEMS) lines.push(`- …其余 ${miniApps.length - MAX_SECTION_ITEMS} 个略`);
  }

  const reportImages: WechatReportImage[] = images.map(img => ({
    serverId: img.serverId,
    sender: img.sender,
    time: img.time,
    context: img.context,
  }));

  return {
    talker,
    chatName,
    date,
    summary: summary?.text ?? null,
    summaryStatus: summary?.text ? 'done' : (summary?.status ?? 'none'),
    summaryNote: summary?.note,
    markdown: lines.join('\n'),
    images: reportImages,
    files,
    miniApps,
    links,
    topMembers: topMembers.map(([name, count]) => ({ name, count })),
    stats: {
      totalMessages: items.length,
      activeMembers: memberMap.size,
      links: links.length,
      mentions: mentions.length,
      images: images.length,
      files: files.length,
      miniApps: miniApps.length,
      firstTime,
      lastTime,
    },
  };
}
