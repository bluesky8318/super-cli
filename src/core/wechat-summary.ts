/**
 * AI summary generation for WeChat daily reports.
 *
 * Spawns a local coding CLI in one-shot headless mode with the configurable
 * prompt + chat context on stdin (argv for kimi, which has no stdin mode),
 * and caches the result via WechatSummaryStore. In-flight generations are
 * deduped per cache key.
 */

import { spawn, execFile } from 'node:child_process';
import { ConfigManager } from './config.js';
import { cleanName, type WechatTimelineItem } from './wechat.js';
import { WechatSummaryStore, summaryKey, type WechatSummaryEntry } from './wechat-summary-store.js';

export type SummaryRuntime = 'pi' | 'kimi' | 'mcode' | 'qoder';

export const SUMMARY_RUNTIMES: { id: SummaryRuntime; name: string; command: string }[] = [
  { id: 'pi', name: 'Pi', command: 'pi' },
  { id: 'kimi', name: 'Kimi', command: 'kimi' },
  { id: 'mcode', name: 'MiniMax Code', command: 'mcode' },
  { id: 'qoder', name: 'Qoder', command: 'qodercli' },
];

export const DEFAULT_SUMMARY_PROMPT = `你是聊天记录分析助手。请根据以下聊天记录，为「{chatName}」在 {date} 的对话写一段中文摘要（200 字以内），提炼主要话题、关键结论和值得关注的事项。只输出摘要正文，不要标题、不要前缀、不要解释。

聊天记录（共 {messageCount} 条）：
{messages}`;

/** Headless invocation per runtime. stdin piped prompt avoids argv length limits. */
const RUNNER_SPECS: Record<SummaryRuntime, { command: string; args: string[]; viaStdin: boolean }> = {
  pi: { command: 'pi', args: ['-p', '--no-session', '--no-tools'], viaStdin: true },
  mcode: { command: 'mcode', args: ['exec', '--input', '-'], viaStdin: true },
  qoder: { command: 'qodercli', args: ['-p'], viaStdin: true },
  kimi: { command: 'kimi', args: ['-p'], viaStdin: false },
};

const MAX_CONTEXT_MESSAGES = 400;
const MAX_CONTEXT_CHARS = 48_000;
const GENERATE_TIMEOUT_MS = 150_000;

export async function getSummaryConfig(): Promise<{ prompt: string; runtime: SummaryRuntime; model: string }> {
  const config = await new ConfigManager().load();
  const s = (config.settings ?? {}) as Record<string, unknown>;
  const prompt = typeof s.wechatSummaryPrompt === 'string' && s.wechatSummaryPrompt.trim()
    ? s.wechatSummaryPrompt
    : DEFAULT_SUMMARY_PROMPT;
  const runtime = SUMMARY_RUNTIMES.some(r => r.id === s.wechatSummaryRuntime)
    ? (s.wechatSummaryRuntime as SummaryRuntime)
    : 'pi';
  // Optional model override passed as --model; empty = the CLI's global default.
  const model = typeof s.wechatSummaryModel === 'string' ? s.wechatSummaryModel.trim() : '';
  return { prompt, runtime, model };
}

/** Check which runtime CLIs are resolvable in PATH. */
export async function checkRuntimes(): Promise<{ id: SummaryRuntime; name: string; command: string; installed: boolean }[]> {
  const probe = (command: string) => new Promise<boolean>(resolve => {
    execFile('which', [command], { timeout: 5000 }, err => resolve(!err));
  });
  return Promise.all(
    SUMMARY_RUNTIMES.map(async r => ({ ...r, installed: await probe(r.command) })),
  );
}

/** Render the chat context as `[HH:MM] sender: snippet` lines, capped in size. */
export function buildMessagesContext(items: WechatTimelineItem[]): string {
  const lines: string[] = [];
  let chars = 0;
  for (const msg of items.slice(-MAX_CONTEXT_MESSAGES)) {
    const snippet = (msg.snippet ?? '').trim();
    if (!snippet) continue;
    const d = new Date(msg.create_time * 1000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const line = `[${hh}:${mm}] ${cleanName(msg.sender_display_name, msg.sender)}: ${snippet}`;
    if (chars + line.length > MAX_CONTEXT_CHARS) break;
    lines.push(line);
    chars += line.length;
  }
  return lines.join('\n');
}

export function buildSummaryPrompt(
  template: string,
  vars: { chatName: string; date: string; messageCount: number; messages: string },
): string {
  return template
    .replaceAll('{chatName}', vars.chatName)
    .replaceAll('{date}', vars.date)
    .replaceAll('{messageCount}', String(vars.messageCount))
    .replaceAll('{messages}', vars.messages);
}

function execCli(command: string, args: string[], stdinText: string | undefined, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} 执行超时（${Math.round(timeoutMs / 1000)}s）`));
    }, timeoutMs);
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => {
      clearTimeout(timer);
      const notFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
      reject(new Error(notFound ? `${command} 未安装（PATH 中找不到该命令）` : err.message));
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} 退出码 ${code}，无输出`));
    });
    if (stdinText !== undefined) {
      child.stdin.write(stdinText);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

/** Strip CLI-specific noise from the printed response. */
function cleanOutput(runtime: SummaryRuntime, raw: string): string {
  let text = raw.trim();
  if (runtime === 'kimi') {
    // kimi prints "• <answer>" plus a "To resume this session: ..." trailer.
    text = text
      .replace(/\n?To resume this session:[\s\S]*$/i, '')
      .replace(/^•\s+/, '')
      .trim();
  }
  return text;
}

export async function runSummaryPrompt(
  runtime: SummaryRuntime,
  prompt: string,
  opts?: { model?: string; timeoutMs?: number },
): Promise<string> {
  const spec = RUNNER_SPECS[runtime];
  if (!spec) throw new Error(`未知运行时: ${runtime}`);
  // All four CLIs accept --model; only appended when explicitly configured.
  const modelArgs = opts?.model ? ['--model', opts.model] : [];
  const args = spec.viaStdin ? [...spec.args, ...modelArgs] : [...spec.args, ...modelArgs, prompt];
  const raw = await execCli(spec.command, args, spec.viaStdin ? prompt : undefined, opts?.timeoutMs ?? GENERATE_TIMEOUT_MS);
  const text = cleanOutput(runtime, raw);
  if (!text) throw new Error(`${spec.command} 返回了空内容`);
  return text;
}

/** Cache-aware generator with per-key in-flight dedupe. */
export class SummaryGenerator {
  private store: WechatSummaryStore;
  private inflight = new Map<string, Promise<WechatSummaryEntry>>();

  constructor(store?: WechatSummaryStore) {
    this.store = store ?? new WechatSummaryStore();
  }

  get(key: string): Promise<WechatSummaryEntry | null> {
    return this.store.get(key);
  }

  list(): Promise<WechatSummaryEntry[]> {
    return this.store.list();
  }

  remove(key: string): Promise<void> {
    return this.store.remove(key);
  }

  clear(): Promise<void> {
    return this.store.clear();
  }

  /**
   * Generate the summary for a chat+date. Returns the cached entry when done,
   * the shared in-flight promise when already generating, or starts a new one
   * (force=true always starts a fresh generation).
   */
  generate(
    talker: string,
    chatName: string,
    date: string,
    items: WechatTimelineItem[],
    opts?: { force?: boolean },
  ): Promise<WechatSummaryEntry> {
    const key = summaryKey(talker, date);
    if (!opts?.force) {
      const pending = this.inflight.get(key);
      if (pending) return pending;
    }
    const task = this.doGenerate(key, talker, chatName, date, items, opts);
    this.inflight.set(key, task);
    void task.finally(() => {
      if (this.inflight.get(key) === task) this.inflight.delete(key);
    });
    return task;
  }

  private async doGenerate(
    key: string,
    talker: string,
    chatName: string,
    date: string,
    items: WechatTimelineItem[],
    opts?: { force?: boolean },
  ): Promise<WechatSummaryEntry> {
    if (!opts?.force) {
      const cached = await this.store.get(key);
      if (cached?.status === 'done') return cached;
    }
    await this.store.upsert({ key, talker, chatName, date, status: 'pending', messageCount: items.length });
    try {
      const { prompt: template, runtime, model } = await getSummaryConfig();
      const prompt = buildSummaryPrompt(template, {
        chatName,
        date,
        messageCount: items.length,
        messages: buildMessagesContext(items),
      });
      const summary = await runSummaryPrompt(runtime, prompt, { model: model || undefined });
      return await this.store.upsert({ key, talker, chatName, date, status: 'done', summary, runtime, messageCount: items.length });
    } catch (err) {
      return await this.store.upsert({
        key, talker, chatName, date,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
