import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import type { Idea, IdeaCategory, IdeaStatus, IdeaStoreData, IssuePriority } from './types.js';
import { getSuperCliHome, getSuperCliIdeasPath } from './paths.js';
import { IssueStore } from './issue-store.js';
import { ConfigManager } from './config.js';
import {
  ideaDocAbsPath,
  newIdeaId,
  parseIdeaDoc,
  readIdeaDoc,
  scanIdeaDocs,
  serializeIdeaDoc,
  writeIdeaDoc,
  ideaTimestamp,
  type IdeaDoc,
} from './idea-doc.js';

export class IdeaNotFoundError extends Error {
  readonly code = 'IDEA_NOT_FOUND';
  constructor(id: string) {
    super(`Idea not found: ${id}`);
    this.name = 'IdeaNotFoundError';
  }
}

export class IdeaStateError extends Error {
  readonly code = 'IDEA_STATE';
  constructor(message: string) {
    super(message);
    this.name = 'IdeaStateError';
  }
}

const DEFAULT_DATA: IdeaStoreData = {
  version: 1,
  nextIdeaNumber: 1,
  ideas: {},
};

/**
 * Fallback idea categories, used only when settings.ideaCategories is not
 * configured. Empty by default: category project paths are user-specific
 * absolute paths, so ship none and require configuration first.
 */
export const DEFAULT_IDEA_CATEGORIES: IdeaCategory[] = [];

export interface IdeaFilter {
  status?: IdeaStatus;
  category?: string;
  project?: string;
  since?: string; // ISO date
  until?: string;
}

/** Extract `#tag` tokens from free-form content. */
export function parseHashTags(content: string): string[] {
  const matches = content.match(/#([^\s#]+)/g) ?? [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

function titleFromContent(content: string): string {
  return content.trim().split('\n')[0].slice(0, 60);
}

export class IdeaStore {
  private dataPath: string;
  private data: IdeaStoreData | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private issueStore: IssueStore;

  constructor(dataPath?: string, issueStore?: IssueStore) {
    this.dataPath = dataPath ?? getSuperCliIdeasPath();
    this.issueStore = issueStore ?? new IssueStore();
  }

  private async load(): Promise<IdeaStoreData> {
    if (this.data) return this.data;
    try {
      const content = await readFile(this.dataPath, 'utf-8');
      this.data = { ...DEFAULT_DATA, ...JSON.parse(content) };
    } catch {
      this.data = { ...DEFAULT_DATA };
    }
    return this.data!;
  }

  private async save(): Promise<void> {
    if (!this.data) return;
    await mkdir(getSuperCliHome(), { recursive: true });
    await writeFile(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(op);
    this.writeQueue = run.catch(() => {});
    return run;
  }

  /** Configured idea categories (settings.ideaCategories) with built-in defaults. */
  async categories(): Promise<IdeaCategory[]> {
    const config = await new ConfigManager().load();
    const raw = (config.settings as Record<string, unknown>)?.ideaCategories;
    if (Array.isArray(raw)) {
      const valid = raw.filter(
        (c): c is IdeaCategory =>
          !!c && typeof c === 'object'
          && typeof (c as IdeaCategory).key === 'string'
          && typeof (c as IdeaCategory).label === 'string'
          && typeof (c as IdeaCategory).project === 'string'
          && (c as IdeaCategory).project.startsWith('/'),
      );
      if (valid.length) return valid;
    }
    return DEFAULT_IDEA_CATEGORIES;
  }

  // ---- read ----

  /** All doc-backed ideas, scanned from category project dirs. */
  private async scanDocs(): Promise<Idea[]> {
    const cats = await this.categories();
    const ideas: Idea[] = [];
    for (const cat of cats) {
      const files = await scanIdeaDocs(cat.project);
      for (const file of files) {
        const doc = await readIdeaDoc(file);
        if (!doc) continue;
        ideas.push(this.docToIdea(doc, file, cat));
      }
    }
    return ideas;
  }

  private docToIdea(doc: IdeaDoc, docPath: string, cat: IdeaCategory): Idea {
    return {
      id: doc.id,
      identifier: `IDEA-${doc.id}`,
      title: doc.title,
      content: doc.content,
      status: doc.status,
      category: doc.category || cat.key,
      project: doc.project || cat.project,
      docPath,
      comments: doc.comments,
      promotedIssueId: doc.promotedIssue,
      tags: parseHashTags(doc.content),
      createdAt: doc.created,
      updatedAt: doc.comments.length ? doc.comments[doc.comments.length - 1].at : doc.created,
    };
  }

  private async joinIssueStatus(ideas: Idea[]): Promise<Idea[]> {
    for (const idea of ideas) {
      if (idea.promotedIssueId) {
        try {
          const issue = await this.issueStore.getIssue(idea.promotedIssueId);
          idea.issueStatus = issue.status;
          idea.promotedIssueIdentifier = issue.identifier;
          idea.issueTitle = issue.title;
          idea.issueProject = issue.projectEncoded;
        } catch {
          // issue deleted or unreadable
        }
      }
    }
    return ideas;
  }

  async list(filter: IdeaFilter = {}): Promise<Idea[]> {
    const data = await this.load();
    // Legacy entries: map old shape (archivedAt / promotedIssueId / no status).
    const drafts = Object.values(data.ideas).map(raw => {
      const legacy = raw as Idea & { archivedAt?: string; projectEncoded?: string };
      const status: IdeaStatus = legacy.status
        ?? (legacy.promotedIssueId ? 'promoted' : legacy.archivedAt ? 'abandoned' : 'draft');
      return {
        ...legacy,
        title: legacy.title || titleFromContent(legacy.content),
        comments: legacy.comments ?? [],
        status,
      };
    });

    let ideas = [...drafts, ...(await this.scanDocs())];

    if (filter.status) ideas = ideas.filter(i => i.status === filter.status);
    if (filter.category) ideas = ideas.filter(i => i.category === filter.category);
    if (filter.project) ideas = ideas.filter(i => i.project === filter.project);
    if (filter.since) ideas = ideas.filter(i => i.createdAt >= filter.since!);
    if (filter.until) ideas = ideas.filter(i => i.createdAt <= filter.until! + 'T23:59:59');

    ideas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.joinIssueStatus(ideas);
  }

  async get(idOrIdentifier: string): Promise<Idea> {
    const all = await this.list();
    const idea = all.find(
      i => i.id === idOrIdentifier
        || i.identifier.toLowerCase() === idOrIdentifier.toLowerCase()
        || i.id.startsWith(idOrIdentifier),
    );
    if (!idea) throw new IdeaNotFoundError(idOrIdentifier);
    return idea;
  }

  // ---- write ----

  /** One-line capture. Always creates a draft; categorization is a separate step. */
  async create(content: string): Promise<Idea> {
    const trimmed = content.trim();
    if (!trimmed) throw new IdeaStateError('Idea content is required');
    return this.enqueue(async () => {
      const data = await this.load();
      const now = new Date().toISOString();
      const idea: Idea = {
        id: randomUUID(),
        identifier: `IDEA-${data.nextIdeaNumber++}`,
        title: titleFromContent(trimmed),
        content: trimmed,
        status: 'draft',
        comments: [],
        tags: parseHashTags(trimmed),
        createdAt: now,
        updatedAt: now,
      };
      data.ideas[idea.id] = idea;
      await this.save();
      return idea;
    });
  }

  /** draft → incubating: write the md doc into the category's project and drop the draft. */
  async categorize(id: string, categoryKey: string): Promise<Idea> {
    const cats = await this.categories();
    const cat = cats.find(c => c.key === categoryKey);
    if (!cat) throw new IdeaStateError(`Unknown category: ${categoryKey}`);
    return this.enqueue(async () => {
      const data = await this.load();
      const entry = Object.values(data.ideas).find(
        i => i.id === id || i.identifier.toLowerCase() === id.toLowerCase() || i.id.startsWith(id),
      );
      if (!entry) throw new IdeaNotFoundError(id);
      if (entry.status && entry.status !== 'draft') throw new IdeaStateError('只有待分类的想法可以选择分类');

      const docId = newIdeaId();
      const now = new Date();
      const doc: IdeaDoc = {
        id: docId,
        title: entry.title || titleFromContent(entry.content),
        category: cat.key,
        project: cat.project,
        status: 'incubating',
        created: entry.createdAt,
        content: entry.content,
        comments: [],
      };
      const absPath = ideaDocAbsPath(cat, docId, now);
      await writeIdeaDoc(absPath, doc);
      delete data.ideas[entry.id];
      await this.save();
      return this.docToIdea(doc, absPath, cat);
    });
  }

  /** Append a comment to a categorized idea's md doc. Drafts cannot be commented. */
  async addComment(id: string, body: string): Promise<Idea> {
    const trimmed = body.trim();
    if (!trimmed) throw new IdeaStateError('Comment body is required');
    const idea = await this.get(id);
    if (idea.status === 'draft' || idea.status === 'abandoned' || idea.status === 'archived') {
      throw new IdeaStateError('只有孵化中的想法可以评论（先分类；已放弃/归档的需先恢复）');
    }
    if (!idea.docPath) throw new IdeaStateError('Idea doc missing');
    return this.enqueue(async () => {
      const doc = await readIdeaDoc(idea.docPath!);
      if (!doc) throw new IdeaNotFoundError(id);
      doc.comments.push({ at: ideaTimestamp(), body: trimmed });
      await writeIdeaDoc(idea.docPath!, doc);
      return this.get(id);
    });
  }

  async setStatus(id: string, status: IdeaStatus): Promise<Idea> {
    const idea = await this.get(id);
    if (idea.status === 'promoted' && status !== 'archived') throw new IdeaStateError('已转任务的想法只能归档');
    return this.enqueue(async () => {
      if (idea.docPath) {
        const doc = await readIdeaDoc(idea.docPath!);
        if (!doc) throw new IdeaNotFoundError(id);
        doc.status = status;
        await writeIdeaDoc(idea.docPath!, doc);
      } else {
        // draft in json: only abandoned is meaningful pre-categorization
        const data = await this.load();
        const entry = data.ideas[idea.id];
        if (entry) {
          entry.status = status;
          entry.updatedAt = new Date().toISOString();
          await this.save();
        }
      }
      return this.get(id);
    });
  }

  /** incubating → promoted: create an Issue whose requirement doc is the idea md. */
  async promote(id: string, options: { title?: string; project?: string; priority?: IssuePriority } = {}): Promise<{ idea: Idea; issueId: string; issueIdentifier: string }> {
    const idea = await this.get(id);
    if (idea.status === 'draft') throw new IdeaStateError('请先为想法选择分类，再转为任务');
    if (idea.status === 'promoted') throw new IdeaStateError('该想法已转为任务');
    if (!idea.docPath) throw new IdeaStateError('Idea doc missing');

    const project = options.project?.trim() || idea.project;
    if (!project) throw new IdeaStateError('任务必须有归属项目');

    const title = (options.title ?? idea.title).trim() || idea.title;
    const description = [
      `> 来源：想法 ${idea.identifier}（${idea.createdAt.slice(0, 10)}）`,
      `> 原始需求文档：${idea.docPath}`,
      '',
      idea.content,
      ...(idea.comments.length ? ['', '## 评论与修正', ...idea.comments.map(c => `- ${c.at}：${c.body}`)] : []),
    ].join('\n');

    const issue = await this.issueStore.createIssue({
      title,
      description,
      projectEncoded: project,
      priority: options.priority,
      labels: ['idea'],
    });

    return this.enqueue(async () => {
      const doc = await readIdeaDoc(idea.docPath!);
      if (!doc) throw new IdeaNotFoundError(id);
      doc.status = 'promoted';
      doc.promotedIssue = issue.id;
      await writeIdeaDoc(idea.docPath!, doc);
      const updated = await this.get(id);
      return { idea: updated, issueId: issue.id, issueIdentifier: issue.identifier };
    });
  }

  /** Serialized doc content (for debugging / CLI show). */
  serializeDoc(doc: IdeaDoc): string {
    return serializeIdeaDoc(doc);
  }

  parseDoc(raw: string): IdeaDoc | null {
    return parseIdeaDoc(raw);
  }

  /** Remove a doc file directly (used by tests). */
  async removeDocFile(absPath: string): Promise<void> {
    await unlink(absPath);
  }
}
