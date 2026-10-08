/**
 * AI summary cache for WeChat daily reports (~/.super-cli/wechat-summaries.json).
 *
 * Unique key: `${talker}|${date}` — one summary per chat per day. Generated
 * once on first view, reused afterwards; users can regenerate or clear entries
 * from the WeChat board settings.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getSuperCliHome } from './paths.js';

export interface WechatSummaryEntry {
  /** `${talker}|${date}` */
  key: string;
  talker: string;
  chatName: string;
  date: string;
  status: 'pending' | 'done' | 'error';
  summary?: string;
  error?: string;
  /** Runtime CLI that produced the summary (pi / kimi / mcode / qoder). */
  runtime?: string;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface SummaryFile {
  version: number;
  summaries: Record<string, WechatSummaryEntry>;
}

export function summaryKey(talker: string, date: string): string {
  return `${talker}|${date}`;
}

export class WechatSummaryStore {
  private filePath: string;
  private data: SummaryFile | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(getSuperCliHome(), 'wechat-summaries.json');
  }

  private async load(): Promise<SummaryFile> {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await readFile(this.filePath, 'utf-8'));
    } catch {
      this.data = { version: 1, summaries: {} };
    }
    return this.data!;
  }

  private async save(): Promise<void> {
    if (!this.data) return;
    await mkdir(getSuperCliHome(), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  async get(key: string): Promise<WechatSummaryEntry | null> {
    const data = await this.load();
    return data.summaries[key] ?? null;
  }

  async list(): Promise<WechatSummaryEntry[]> {
    const data = await this.load();
    return Object.values(data.summaries).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Merge-patch an entry; creates it when missing. */
  async upsert(patch: Partial<WechatSummaryEntry> & { key: string; talker: string; date: string }): Promise<WechatSummaryEntry> {
    const data = await this.load();
    const existing = data.summaries[patch.key];
    const now = new Date().toISOString();
    const entry: WechatSummaryEntry = {
      ...existing,
      ...patch,
      chatName: patch.chatName ?? existing?.chatName ?? patch.talker,
      status: patch.status ?? existing?.status ?? 'pending',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    data.summaries[patch.key] = entry;
    await this.save();
    return entry;
  }

  async remove(key: string): Promise<void> {
    const data = await this.load();
    delete data.summaries[key];
    await this.save();
  }

  async clear(): Promise<void> {
    const data = await this.load();
    data.summaries = {};
    await this.save();
  }
}
