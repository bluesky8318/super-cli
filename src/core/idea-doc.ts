/**
 * Idea markdown document convention.
 *
 * Categorized ideas live as md files under `<project>/00-Inbox/Idea/<year>/<year>-mm/`.
 * The file is the source of truth; super-cli and agents both edit it as long as
 * the frontmatter + section layout below is preserved.
 *
 * Layout:
 *   ---
 *   id / title / category / project / status / created / promoted_issue
 *   ---
 *   # <title>
 *   ## 原始记录
 *   > <YYYY-MM-DD HH:mm>
 *   <original content, never modified>
 *   ## 评论与修正
 *   ### <YYYY-MM-DD HH:mm>
 *   <comment body>
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IdeaCategory, IdeaComment, IdeaStatus } from './types.js';

export const IDEA_DOC_ROOT = join('00-Inbox', 'Idea');

export interface IdeaDoc {
  id: string;
  title: string;
  category: string;
  project: string;
  status: IdeaStatus;
  created: string;
  promotedIssue?: string;
  content: string;
  comments: IdeaComment[];
}

const IDEA_STATUSES: IdeaStatus[] = ['draft', 'incubating', 'promoted', 'abandoned', 'archived'];

function fmValue(v: string): string {
  return /^[\w.:/@+-]+$/.test(v) ? v : JSON.stringify(v);
}

function nowMinute(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function newIdeaId(): string {
  return randomUUID().slice(0, 8);
}

/** Relative doc path for a new idea: 00-Inbox/Idea/<yyyy>/<yyyy>-<mm>/<yyyymmdd>-<hhmm>-<id>.md */
export function ideaDocRelPath(id: string, at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const yyyy = String(at.getFullYear());
  const mm = p(at.getMonth() + 1);
  const stamp = `${yyyy}${mm}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`;
  return join(IDEA_DOC_ROOT, yyyy, `${yyyy}-${mm}`, `${stamp}-${id}.md`);
}

export function serializeIdeaDoc(doc: IdeaDoc): string {
  const fm = [
    '---',
    `id: ${doc.id}`,
    `title: ${fmValue(doc.title)}`,
    `category: ${doc.category}`,
    `project: ${fmValue(doc.project)}`,
    `status: ${doc.status}`,
    `created: ${doc.created}`,
    `promoted_issue: ${fmValue(doc.promotedIssue ?? '')}`,
    '---',
  ].join('\n');

  const comments = doc.comments
    .map(c => `### ${c.at}\n${c.body.trim()}`)
    .join('\n\n');

  return [
    fm,
    '',
    `# ${doc.title}`,
    '',
    '## 原始记录',
    '',
    `> ${doc.created.slice(0, 16).replace('T', ' ')}`,
    '',
    doc.content.trim(),
    '',
    '## 评论与修正',
    '',
    comments,
    '',
  ].join('\n');
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try { return JSON.parse(t) as string; } catch { return t.slice(1, -1); }
  }
  return t;
}

export function parseIdeaDoc(raw: string): IdeaDoc | null {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return null;

  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split('\n')) {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (m) fm[m[1]] = unquote(m[2]);
  }
  if (!fm.id || !fm.title) return null;

  const body = raw.slice(fmMatch[0].length);

  // Original record: between "## 原始记录" and the next "## " heading.
  const origMatch = body.match(/## 原始记录\n([\s\S]*?)(?=\n## |\s*$)/);
  let content = '';
  if (origMatch) {
    content = origMatch[1]
      .split('\n')
      .filter(l => !l.startsWith('>'))   // drop the timestamp blockquote
      .join('\n')
      .trim();
  }

  // Comments: "### <timestamp>" sections under "## 评论与修正".
  const comments: IdeaComment[] = [];
  const commentsMatch = body.match(/## 评论与修正\n([\s\S]*)$/);
  if (commentsMatch) {
    const section = commentsMatch[1];
    const parts = section.split(/^### /m).slice(1);
    for (const part of parts) {
      const nl = part.indexOf('\n');
      if (nl === -1) continue;
      const at = part.slice(0, nl).trim();
      const bodyText = part.slice(nl + 1).replace(/\n## [\s\S]*$/, '').trim();
      if (at && bodyText) comments.push({ at, body: bodyText });
    }
  }

  const status = IDEA_STATUSES.includes(fm.status as IdeaStatus) ? fm.status as IdeaStatus : 'incubating';
  return {
    id: fm.id,
    title: fm.title,
    category: fm.category ?? '',
    project: fm.project ?? '',
    status,
    created: fm.created ?? '',
    promotedIssue: fm.promoted_issue || undefined,
    content,
    comments,
  };
}

export async function writeIdeaDoc(absPath: string, doc: IdeaDoc): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, serializeIdeaDoc(doc), 'utf-8');
}

/** Recursively find idea doc files under a category's project dir. */
export async function scanIdeaDocs(projectRoot: string): Promise<string[]> {
  const root = join(projectRoot, IDEA_DOC_ROOT);
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith('.md')) found.push(p);
    }
  }
  await walk(root, 0);
  return found;
}

export async function readIdeaDoc(absPath: string): Promise<IdeaDoc | null> {
  try {
    return parseIdeaDoc(await readFile(absPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function ideaDocAbsPath(category: IdeaCategory, id: string, at = new Date()): string {
  return join(category.project, ideaDocRelPath(id, at));
}

export { nowMinute as ideaTimestamp };
