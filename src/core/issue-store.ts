import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type {
  Issue,
  IssueActivity,
  IssueBoardData,
  IssueComment,
  IssuePriority,
  IssueRelation,
  IssueRelationType,
  IssueStatus,
} from './types.js';
import { getSuperCliHome, getSuperCliIssuesPath, decodeAnyProjectPath } from './paths.js';

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Version conflict: expected ${expected}, actual ${actual}`);
    this.name = 'VersionConflictError';
  }
}

export class IssueNotFoundError extends Error {
  readonly code = 'ISSUE_NOT_FOUND';
  constructor(id: string) {
    super(`Issue not found: ${id}`);
    this.name = 'IssueNotFoundError';
  }
}

export class IssueStateError extends Error {
  readonly code = 'ISSUE_STATE';
  constructor(message: string) {
    super(message);
    this.name = 'IssueStateError';
  }
}

const DEFAULT_DATA: IssueBoardData = {
  version: 1,
  nextIssueNumber: 1,
  issues: {},
  relations: [],
  comments: {},
  activities: [],
};

const MAX_ACTIVITIES = 5000;

const ISSUE_STATUSES: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'canceled'];
const ISSUE_PRIORITIES: IssuePriority[] = ['none', 'urgent', 'high', 'medium', 'low'];

/** Issue project identity is the decoded absolute path; legacy dash-encoded values are normalized for comparison. */
function normalizeProjectIdentity(p?: string): string | undefined {
  if (!p) return p;
  return p.startsWith('/') ? p : decodeAnyProjectPath(p);
}

export interface IssueFilter {
  projectEncoded?: string;
  status?: IssueStatus;
  includeArchived?: boolean;
}

export interface CreateIssueInput {
  title: string;
  projectEncoded?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  labels?: string[];
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  priority?: IssuePriority;
  labels?: string[];
  projectEncoded?: string;
}

export class IssueStore {
  private dataPath: string;
  private data: IssueBoardData | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(dataPath?: string) {
    this.dataPath = dataPath ?? getSuperCliIssuesPath();
  }

  private async load(): Promise<IssueBoardData> {
    if (this.data) return this.data;
    try {
      const content = await readFile(this.dataPath, 'utf-8');
      this.data = { ...DEFAULT_DATA, ...JSON.parse(content) };
      return this.data!;
    } catch {
      this.data = { ...DEFAULT_DATA };
      return this.data;
    }
  }

  private save(): Promise<void> {
    // Serialize writes so concurrent mutations cannot interleave a stale snapshot.
    const data = this.data;
    const task = this.writeQueue.then(async () => {
      if (!data) return;
      await mkdir(getSuperCliHome(), { recursive: true });
      await writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
    });
    this.writeQueue = task.catch(() => {});
    return task;
  }

  async resolveIssue(idOrIdentifier: string): Promise<Issue | null> {
    const data = await this.load();
    if (data.issues[idOrIdentifier]) return data.issues[idOrIdentifier];
    const upper = idOrIdentifier.toUpperCase();
    const byIdentifier = Object.values(data.issues).find(i => i.identifier.toUpperCase() === upper);
    if (byIdentifier) return byIdentifier;
    const matches = Object.values(data.issues).filter(i => i.id.startsWith(idOrIdentifier));
    return matches.length === 1 ? matches[0] : null;
  }

  async getIssue(idOrIdentifier: string): Promise<Issue> {
    const issue = await this.resolveIssue(idOrIdentifier);
    if (!issue) throw new IssueNotFoundError(idOrIdentifier);
    return issue;
  }

  async listIssues(filter: IssueFilter = {}): Promise<Issue[]> {
    const data = await this.load();
    let issues = Object.values(data.issues);
    if (!filter.includeArchived) issues = issues.filter(i => !i.archivedAt);
    if (filter.projectEncoded !== undefined) {
      // Tolerate legacy dash-encoded identities: compare after normalization.
      const target = normalizeProjectIdentity(filter.projectEncoded);
      issues = issues.filter(i => normalizeProjectIdentity(i.projectEncoded) === target);
    }
    if (filter.status) issues = issues.filter(i => i.status === filter.status);
    return issues.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  async createIssue(input: CreateIssueInput, actorType: IssueActivity['actorType'] = 'user'): Promise<Issue> {
    const data = await this.load();
    if (!input.title?.trim()) throw new IssueStateError('Issue title is required');
    if (input.status && !ISSUE_STATUSES.includes(input.status)) throw new IssueStateError(`Invalid status: ${input.status}`);
    if (input.priority && !ISSUE_PRIORITIES.includes(input.priority)) throw new IssueStateError(`Invalid priority: ${input.priority}`);

    const now = new Date().toISOString();
    const status = input.status ?? 'todo';
    const issue: Issue = {
      id: randomUUID(),
      identifier: `ISSUE-${data.nextIssueNumber++}`,
      projectEncoded: input.projectEncoded,
      title: input.title.trim(),
      description: input.description ?? '',
      status,
      priority: input.priority ?? 'none',
      labels: input.labels ?? [],
      sortOrder: this.nextSortOrder(data, status),
      version: 1,
      sessionIds: [],
      createdAt: now,
      updatedAt: now,
    };
    data.issues[issue.id] = issue;
    this.recordActivity(data, issue.id, actorType, { status: { from: null, to: status }, title: { from: null, to: issue.title } });
    await this.save();
    return issue;
  }

  private nextSortOrder(data: IssueBoardData, status: IssueStatus): number {
    const inColumn = Object.values(data.issues).filter(i => i.status === status && !i.archivedAt);
    if (inColumn.length === 0) return 0;
    return Math.min(...inColumn.map(i => i.sortOrder)) - 1000;
  }

  private applyUpdate(issue: Issue, patch: UpdateIssueInput): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of ['title', 'description', 'priority', 'labels', 'projectEncoded'] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (key === 'priority' && !ISSUE_PRIORITIES.includes(value as IssuePriority)) {
        throw new IssueStateError(`Invalid priority: ${value}`);
      }
      if (JSON.stringify(issue[key]) !== JSON.stringify(value)) {
        changes[key] = { from: issue[key], to: value };
        (issue as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return changes;
  }

  async updateIssue(idOrIdentifier: string, patch: UpdateIssueInput, expectedVersion: number, actorType: IssueActivity['actorType'] = 'user'): Promise<Issue> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    this.assertVersion(issue, expectedVersion);
    if (patch.title !== undefined && !patch.title.trim()) throw new IssueStateError('Issue title cannot be empty');

    const changes = this.applyUpdate(issue, patch);
    this.touch(data, issue, actorType, changes);
    await this.save();
    return issue;
  }

  async moveIssue(idOrIdentifier: string, status: IssueStatus, sortOrder: number | undefined, expectedVersion: number, actorType: IssueActivity['actorType'] = 'user'): Promise<Issue> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    this.assertVersion(issue, expectedVersion);
    if (!ISSUE_STATUSES.includes(status)) throw new IssueStateError(`Invalid status: ${status}`);

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (issue.status !== status) {
      const newSortOrder = sortOrder ?? this.nextSortOrder(data, status);
      changes.status = { from: issue.status, to: status };
      changes.sortOrder = { from: issue.sortOrder, to: newSortOrder };
      issue.status = status;
      issue.sortOrder = newSortOrder;
    } else if (sortOrder !== undefined && issue.sortOrder !== sortOrder) {
      changes.sortOrder = { from: issue.sortOrder, to: sortOrder };
      issue.sortOrder = sortOrder;
    }
    this.touch(data, issue, actorType, changes);
    await this.save();
    return issue;
  }

  /**
   * Atomically claim an issue: move todo -> in_progress and optionally bind the
   * claiming session in a single write. Refuses issues that are archived, not in
   * a claimable status, or already bound to a different session.
   */
  async claimIssue(idOrIdentifier: string, opts: { sessionId?: string } = {}, actorType: IssueActivity['actorType'] = 'agent'): Promise<Issue> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    if (issue.archivedAt) throw new IssueStateError(`Issue ${issue.identifier} is archived`);
    if (issue.status !== 'todo' && issue.status !== 'in_progress') {
      throw new IssueStateError(`Issue ${issue.identifier} is ${issue.status}; only todo issues can be claimed`);
    }
    if (issue.sessionIds.length > 0 && (!opts.sessionId || !issue.sessionIds.includes(opts.sessionId))) {
      throw new IssueStateError(`Issue ${issue.identifier} is already claimed by another session`);
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (issue.status !== 'in_progress') {
      const newSortOrder = this.nextSortOrder(data, 'in_progress');
      changes.status = { from: issue.status, to: 'in_progress' };
      changes.sortOrder = { from: issue.sortOrder, to: newSortOrder };
      issue.status = 'in_progress';
      issue.sortOrder = newSortOrder;
    }
    if (opts.sessionId && !issue.sessionIds.includes(opts.sessionId)) {
      changes.sessionIds = { from: [...issue.sessionIds], to: [...issue.sessionIds, opts.sessionId] };
      issue.sessionIds.push(opts.sessionId);
    }
    if (Object.keys(changes).length === 0) return issue; // idempotent re-claim
    this.touch(data, issue, actorType, changes);
    await this.save();
    return issue;
  }

  async archiveIssue(idOrIdentifier: string, expectedVersion: number, actorType: IssueActivity['actorType'] = 'user'): Promise<Issue> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    this.assertVersion(issue, expectedVersion);
    if (!issue.archivedAt) {
      issue.archivedAt = new Date().toISOString();
      this.touch(data, issue, actorType, { archivedAt: { from: null, to: issue.archivedAt } });
      await this.save();
    }
    return issue;
  }

  async restoreIssue(idOrIdentifier: string, expectedVersion: number, actorType: IssueActivity['actorType'] = 'user'): Promise<Issue> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    this.assertVersion(issue, expectedVersion);
    if (issue.archivedAt) {
      const from = issue.archivedAt;
      issue.archivedAt = undefined;
      this.touch(data, issue, actorType, { archivedAt: { from, to: null } });
      await this.save();
    }
    return issue;
  }

  async deleteIssue(idOrIdentifier: string, expectedVersion: number): Promise<void> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    this.assertVersion(issue, expectedVersion);
    if (!issue.archivedAt) throw new IssueStateError('Only archived issues can be deleted');

    delete data.issues[issue.id];
    data.relations = data.relations.filter(r => r.sourceId !== issue.id && r.targetId !== issue.id);
    for (const [cid, comment] of Object.entries(data.comments)) {
      if (comment.issueId === issue.id) delete data.comments[cid];
    }
    data.activities = data.activities.filter(a => a.issueId !== issue.id);
    await this.save();
  }

  async bindSession(idOrIdentifier: string, sessionId: string, expectedVersion: number, actorType: IssueActivity['actorType'] = 'user'): Promise<Issue> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    this.assertVersion(issue, expectedVersion);
    if (issue.sessionIds.includes(sessionId)) return issue;
    // A session belongs to at most one issue: detach it from any other issue first.
    for (const other of Object.values(data.issues)) {
      if (other.id !== issue.id && other.sessionIds.includes(sessionId)) {
        const from = [...other.sessionIds];
        other.sessionIds = other.sessionIds.filter(s => s !== sessionId);
        this.touch(data, other, actorType, { sessionIds: { from, to: [...other.sessionIds] } });
      }
    }
    const changes = { sessionIds: { from: [...issue.sessionIds], to: [...issue.sessionIds, sessionId] } };
    issue.sessionIds.push(sessionId);
    this.touch(data, issue, actorType, changes);
    await this.save();
    return issue;
  }

  async unbindSession(idOrIdentifier: string, sessionId: string, expectedVersion: number, actorType: IssueActivity['actorType'] = 'user'): Promise<Issue> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    this.assertVersion(issue, expectedVersion);
    if (!issue.sessionIds.includes(sessionId)) return issue;
    const changes = { sessionIds: { from: [...issue.sessionIds], to: issue.sessionIds.filter(s => s !== sessionId) } };
    issue.sessionIds = issue.sessionIds.filter(s => s !== sessionId);
    this.touch(data, issue, actorType, changes);
    await this.save();
    return issue;
  }

  /** Record a finished/started headless run on the issue (no version gate; internal use). */
  async recordRun(idOrIdentifier: string, run: { sessionId?: string }): Promise<Issue> {
    const data = await this.load();
    const issue = await this.getIssue(idOrIdentifier);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    issue.lastRunAt = new Date().toISOString();
    issue.runCount = (issue.runCount ?? 0) + 1;
    changes.lastRunAt = { from: null, to: issue.lastRunAt };
    changes.runCount = { from: (issue.runCount) - 1, to: issue.runCount };
    if (run.sessionId && !issue.sessionIds.includes(run.sessionId)) {
      changes.sessionIds = { from: [...issue.sessionIds], to: [...issue.sessionIds, run.sessionId] };
      issue.sessionIds.push(run.sessionId);
    }
    this.touch(data, issue, 'agent', changes);
    await this.save();
    return issue;
  }

  // --- Relations ---

  async getRelations(issueId: string): Promise<IssueRelation[]> {
    const data = await this.load();
    return data.relations.filter(r => r.sourceId === issueId || r.targetId === issueId);
  }

  async addRelation(sourceIdOrIdentifier: string, type: IssueRelationType, targetIdOrIdentifier: string, actorType: IssueActivity['actorType'] = 'user'): Promise<IssueRelation> {
    const data = await this.load();
    const source = await this.getIssue(sourceIdOrIdentifier);
    const target = await this.getIssue(targetIdOrIdentifier);
    if (source.id === target.id) throw new IssueStateError('Cannot relate an issue to itself');

    if (type === 'parent') {
      const existing = data.relations.find(r => r.type === 'parent' && r.sourceId === source.id);
      if (existing) throw new IssueStateError(`Issue ${source.identifier} already has a parent`);
      if (this.wouldCreateCycle(data, source.id, target.id)) {
        throw new IssueStateError('Parent relation would create a cycle');
      }
    }
    if (type === 'related') {
      const dup = data.relations.find(r =>
        r.type === 'related' &&
        ((r.sourceId === source.id && r.targetId === target.id) || (r.sourceId === target.id && r.targetId === source.id)),
      );
      if (dup) throw new IssueStateError('Relation already exists');
    }
    const dup = data.relations.find(r => r.type === type && r.sourceId === source.id && r.targetId === target.id);
    if (dup) throw new IssueStateError('Relation already exists');

    const relation: IssueRelation = { type, sourceId: source.id, targetId: target.id };
    data.relations.push(relation);
    this.recordActivity(data, source.id, actorType, { [`relation:${type}`] : { from: null, to: target.identifier } });
    await this.save();
    return relation;
  }

  async removeRelation(sourceIdOrIdentifier: string, type: IssueRelationType, targetIdOrIdentifier: string, actorType: IssueActivity['actorType'] = 'user'): Promise<void> {
    const data = await this.load();
    const source = await this.getIssue(sourceIdOrIdentifier);
    const target = await this.getIssue(targetIdOrIdentifier);
    const before = data.relations.length;
    data.relations = data.relations.filter(r => !(r.type === type && r.sourceId === source.id && r.targetId === target.id));
    if (data.relations.length === before) throw new IssueStateError('Relation not found');
    this.recordActivity(data, source.id, actorType, { [`relation:${type}`]: { from: target.identifier, to: null } });
    await this.save();
  }

  private wouldCreateCycle(data: IssueBoardData, childId: string, parentId: string): boolean {
    // Walking ancestors of parentId: if we reach childId, adding child->parent closes a cycle.
    const visited = new Set<string>();
    let current: string | undefined = parentId;
    while (current) {
      if (current === childId) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      current = data.relations.find(r => r.type === 'parent' && r.sourceId === current)?.targetId;
    }
    return false;
  }

  // --- Comments ---

  async getCommentCounts(): Promise<Record<string, number>> {
    const data = await this.load();
    const counts: Record<string, number> = {};
    for (const comment of Object.values(data.comments)) {
      counts[comment.issueId] = (counts[comment.issueId] ?? 0) + 1;
    }
    return counts;
  }

  async getComments(issueIdOrIdentifier: string, after?: string): Promise<{ comments: IssueComment[]; nextCursor: string | null }> {    const issue = await this.getIssue(issueIdOrIdentifier);
    const data = await this.load();
    const forIssue = Object.values(data.comments)
      .filter(c => c.issueId === issue.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const comments = after ? forIssue.filter(c => c.createdAt > after) : forIssue;
    const nextCursor = comments.length > 0 ? comments[comments.length - 1].createdAt : after ?? null;
    return { comments, nextCursor };
  }

  async addComment(issueIdOrIdentifier: string, body: string, opts: { authorType?: 'user' | 'agent'; sessionId?: string } = {}): Promise<IssueComment> {
    const data = await this.load();
    const issue = await this.getIssue(issueIdOrIdentifier);
    if (!body?.trim()) throw new IssueStateError('Comment body is required');
    const now = new Date().toISOString();
    const comment: IssueComment = {
      id: randomUUID(),
      issueId: issue.id,
      body: body.trim(),
      authorType: opts.authorType ?? 'user',
      sessionId: opts.sessionId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    data.comments[comment.id] = comment;
    this.recordActivity(data, issue.id, opts.authorType === 'agent' ? 'agent' : 'user', { comment: { from: null, to: comment.id } });
    await this.save();
    return comment;
  }

  async updateComment(commentId: string, body: string, expectedVersion: number): Promise<IssueComment> {
    const data = await this.load();
    const comment = data.comments[commentId];
    if (!comment) throw new IssueNotFoundError(`comment:${commentId}`);
    if (comment.version !== expectedVersion) throw new VersionConflictError(expectedVersion, comment.version);
    if (!body?.trim()) throw new IssueStateError('Comment body is required');
    comment.body = body.trim();
    comment.version += 1;
    comment.updatedAt = new Date().toISOString();
    await this.save();
    return comment;
  }

  async removeComment(commentId: string): Promise<void> {
    const data = await this.load();
    if (!data.comments[commentId]) throw new IssueNotFoundError(`comment:${commentId}`);
    delete data.comments[commentId];
    await this.save();
  }

  // --- Activities ---

  async getActivities(issueIdOrIdentifier: string): Promise<IssueActivity[]> {
    const issue = await this.getIssue(issueIdOrIdentifier);
    const data = await this.load();
    return data.activities.filter(a => a.issueId === issue.id);
  }

  private recordActivity(data: IssueBoardData, issueId: string, actorType: IssueActivity['actorType'], changes: IssueActivity['changes']): void {
    if (Object.keys(changes).length === 0) return;
    data.activities.push({ id: randomUUID(), issueId, at: new Date().toISOString(), actorType, changes });
    if (data.activities.length > MAX_ACTIVITIES) {
      data.activities = data.activities.slice(-MAX_ACTIVITIES);
    }
  }

  private touch(data: IssueBoardData, issue: Issue, actorType: IssueActivity['actorType'], changes: IssueActivity['changes']): void {
    issue.version += 1;
    issue.updatedAt = new Date().toISOString();
    this.recordActivity(data, issue.id, actorType, changes);
  }

  private assertVersion(issue: Issue, expectedVersion: number): void {
    if (issue.version !== expectedVersion) throw new VersionConflictError(expectedVersion, issue.version);
  }
}
