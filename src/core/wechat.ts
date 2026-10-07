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
  server_id: number;
  msg_type: number;
  sender: string;
  sender_display_name?: string;
  talker: string;
  talker_display_name?: string;
  create_time: number;
  direction?: string;
  snippet?: string;
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
  markdown: string;
  stats: {
    totalMessages: number;
    activeMembers: number;
    links: number;
    mentions: number;
    firstTime?: number;
    lastTime?: number;
  };
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
    if (!res.ok) throw new Error(`wx-cli ${res.status}: ${await res.text().catch(() => '')}`);
    return res.json() as Promise<T>;
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

export function buildDailyReport(
  talker: string,
  chatName: string,
  date: string,
  items: WechatTimelineItem[],
  myNames: string[],
  myWxid: string,
): WechatReport {
  const memberMap = new Map<string, number>();
  const links: { url: string; sender: string; time: number }[] = [];
  const mentions: WechatMention[] = [];

  for (const msg of items) {
    const senderName = cleanName(msg.sender_display_name, msg.sender);
    memberMap.set(senderName, (memberMap.get(senderName) ?? 0) + 1);
    for (const url of extractLinks(msg.snippet ?? '')) {
      links.push({ url, sender: senderName, time: msg.create_time });
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
  }

  const topMembers = [...memberMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const times = items.map(i => i.create_time);
  const firstTime = times.length ? Math.min(...times) : undefined;
  const lastTime = times.length ? Math.max(...times) : undefined;

  const lines: string[] = [
    `# ${chatName} 日报（${date}）`,
    '',
    `- 消息总数：${items.length}`,
    `- 活跃成员：${memberMap.size}`,
    ...(firstTime && lastTime ? [`- 活跃时段：${fmtTime(firstTime)} ~ ${fmtTime(lastTime)}`] : []),
    `- 链接分享：${links.length}`,
    `- @我：${mentions.length}`,
    '',
    '## 活跃成员 TOP10',
    '',
    ...topMembers.map(([name, count], i) => `${i + 1}. ${name}（${count} 条）`),
  ];

  if (links.length) {
    lines.push('', '## 分享链接', '');
    for (const l of links) lines.push(`- [${domainOf(l.url)}] ${l.url}（${l.sender} ${fmtTime(l.time)}）`);
  }

  if (mentions.length) {
    lines.push('', '## @我的消息', '');
    for (const m of mentions) lines.push(`- ${fmtTime(m.time)} **${m.sender}**：${m.snippet}`);
  }

  return {
    talker,
    chatName,
    date,
    markdown: lines.join('\n'),
    stats: {
      totalMessages: items.length,
      activeMembers: memberMap.size,
      links: links.length,
      mentions: mentions.length,
      firstTime,
      lastTime,
    },
  };
}
