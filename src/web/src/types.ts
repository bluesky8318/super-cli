// Shared web-side types. Issue types mirror src/core/types.ts (web cannot import core directly).

export type CliProvider = 'claude-code' | 'qoder' | 'codex' | 'kimi' | 'pi' | 'opencode' | 'workbuddy' | 'traecode';

export type SessionStatus = 'backlog' | 'in_progress' | 'review' | 'done' | 'cancelled';

export interface ProviderInfo {
  id: CliProvider;
  name: string;
  command: string;
}

export interface SessionItem {
  sessionId: string;
  provider: CliProvider;
  project: string;
  projectEncoded: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  userMessageCount: number;
  assistantMessageCount: number;
  models: string[];
  gitBranch?: string;
  firstUserMessage?: string;
  lastAssistantMessage?: string;
  label?: string;
  tags?: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  version?: string;
  cwd?: string;
  status?: SessionStatus;
  active?: boolean;
}

export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'canceled';

export type IssuePriority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

export interface Issue {
  id: string;
  identifier: string;
  projectEncoded?: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  labels: string[];
  sortOrder: number;
  version: number;
  sessionIds: string[];
  lastRunAt?: string;
  runCount?: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface IssueSummary extends Issue {
  commentCount: number;
}

export type IssueRelationType = 'parent' | 'blocks' | 'related';

export interface IssueRelation {
  type: IssueRelationType;
  sourceId: string;
  targetId: string;
}

export interface IssueComment {
  id: string;
  issueId: string;
  body: string;
  authorType: 'user' | 'agent';
  sessionId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type IdeaStatus = 'draft' | 'incubating' | 'promoted' | 'abandoned' | 'archived';

export interface IdeaCategory {
  key: string;
  label: string;
  project: string;
}

export interface IdeaComment {
  at: string;
  body: string;
}

export interface Idea {
  id: string;
  identifier: string;
  title: string;
  content: string;
  status: IdeaStatus;
  category?: string;
  project?: string;
  docPath?: string;
  comments: IdeaComment[];
  promotedIssueId?: string;
  promotedIssueIdentifier?: string;
  issueStatus?: string;
  issueTitle?: string;
  issueProject?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  provider: CliProvider;
  model?: string;
  workingDir?: string;
  extraArgs?: string[];
  envKeys?: string[];
  builtin?: boolean;
  headless?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssueRun {
  id: string;
  issueId: string;
  agentId: string;
  agentName: string;
  provider: CliProvider;
  trigger: 'manual';
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'failed' | 'stopped';
  sessionId?: string;
  exitCode?: number;
  error?: string;
}

export interface IssueActivity {
  id: string;
  issueId: string;
  at: string;
  actorType: 'user' | 'agent' | 'cli';
  changes: Record<string, { from: unknown; to: unknown }>;
}
