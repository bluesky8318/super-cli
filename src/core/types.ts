export type CliProvider = 'claude-code' | 'qoder' | 'codex' | 'kimi' | 'pi' | 'opencode' | 'workbuddy' | 'traecode';
export type SessionStatus = 'backlog' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TerminalType = 'ghostty' | 'iterm2' | 'terminal' | 'kitty' | 'warp';

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface SessionMessage {
  type: 'user' | 'assistant' | 'permission-mode' | 'attachment' | 'file-history-snapshot' | 'last-prompt' | 'queue-operation';
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  entrypoint?: string;
  userType?: string;
  permissionMode?: string;
  promptId?: string;
  message?: {
    id?: string;
    type?: string;
    role?: 'user' | 'assistant';
    model?: string;
    content?: string | ContentBlock[];
    stop_reason?: string;
    usage?: TokenUsage;
  };
  attachment?: {
    type: string;
    [key: string]: unknown;
  };
  operation?: string;
  content?: unknown;
  leafUuid?: string;
}

export interface SessionMetadata {
  sessionId: string;
  provider: CliProvider;
  project: string;
  projectEncoded: string;
  filePath: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  models: string[];
  gitBranch?: string;
  cwd?: string;
  entrypoint?: string;
  version?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  firstUserMessage?: string;
  label?: string;
  tags?: string[];
}

export interface ActiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  procStart?: string;
  version: string;
  peerProtocol?: number;
  kind: string;
  entrypoint: string;
}

export interface HistoryEntry {
  display: string;
  pastedContents?: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId?: string;
}

export interface TaskLabel {
  label: string;
  createdAt: string;
  tags?: string[];
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

export interface IssueActivity {
  id: string;
  issueId: string;
  at: string;
  actorType: 'user' | 'agent' | 'cli';
  changes: Record<string, { from: unknown; to: unknown }>;
}

export interface IssueBoardData {
  version: 1;
  nextIssueNumber: number;
  issues: Record<string, Issue>;
  relations: IssueRelation[];
  comments: Record<string, IssueComment>;
  activities: IssueActivity[];
}

// --- Idea (想法) ---

// --- Idea（想法）---
// draft: json-only, no category yet, nothing else allowed.
// incubating: categorized, backed by an md doc under <project>/00-Inbox/Idea/.
// promoted: turned into an Issue; the md doc is the task's requirement doc.
// Terminal states: abandoned（想做但外部条件不满足，可恢复）/ archived（结束归档，不再流转）.
export type IdeaStatus = 'draft' | 'incubating' | 'promoted' | 'abandoned' | 'archived';

export interface IdeaCategory {
  key: string;
  label: string;
  /** Absolute project path the category's idea docs live under. */
  project: string;
}

export interface IdeaComment {
  at: string;
  body: string;
}

export interface Idea {
  id: string;
  identifier: string; // IDEA-n
  title: string;
  /** Original one-line record. Immutable after creation. */
  content: string;
  status: IdeaStatus;
  category?: string;      // IdeaCategory.key
  project?: string;       // decoded absolute path (from category)
  docPath?: string;       // md file path, set when categorized
  comments: IdeaComment[];
  promotedIssueId?: string;
  promotedIssueIdentifier?: string;
  /** Joined from the issue store at read time. */
  issueStatus?: IssueStatus;
  issueTitle?: string;
  issueProject?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IdeaStoreData {
  version: 1;
  nextIdeaNumber: number;
  ideas: Record<string, Idea>;
}

// --- Agent profile (agent 启动配置) ---

export interface AgentProfile {
  id: string;
  name: string;
  provider: CliProvider;
  model?: string;
  workingDir?: string;
  extraArgs?: string[];
  env?: Record<string, string>;
  /** Builtin profiles are created at first launch from provider registry defaults; cannot be removed. */
  builtin?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStoreData {
  version: 1;
  agents: Record<string, AgentProfile>;
}

// --- Issue run (执行记录，审计投影) ---

export type RunTrigger = 'manual';
export type RunStatus = 'running' | 'success' | 'failed' | 'stopped';

export interface IssueRun {
  id: string;
  issueId: string;
  agentId: string;
  agentName: string;
  provider: CliProvider;
  trigger: RunTrigger;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  sessionId?: string;
  exitCode?: number;
  error?: string;
}

export interface AppConfig {
  version: number;
  sessions: Record<string, TaskLabel>;
  archivedProjects?: string[];
  pinnedProjects?: string[];
  /** Decoded project path -> stable short id ("p1", "p2", …) used in web URLs. */
  projectIds?: Record<string, string>;
  settings: {
    defaultPort?: number;
    terminal?: TerminalType;
    /** App name/command used to open project folders (mac: open -a, win: command). Empty = OS default. */
    fileManager?: string;
  };
}

export interface ListOptions {
  provider?: CliProvider;
  project?: string;
  since?: Date;
  until?: Date;
  sort?: 'date-asc' | 'date-desc';
  limit?: number;
  offset?: number;
  branch?: string;
  model?: string;
}

export interface SearchOptions {
  project?: string;
  since?: Date;
  maxResults?: number;
  caseSensitive?: boolean;
  messageTypes?: ('user' | 'assistant')[];
}

export interface SearchResult {
  sessionId: string;
  project: string;
  hits: SearchHit[];
  totalHits: number;
}

export interface SearchHit {
  type: 'user' | 'assistant';
  timestamp?: string;
  snippet: string;
}

export interface ProjectInfo {
  /** Stable cross-provider identity: the decoded absolute project path. */
  encoded: string;
  decoded: string;
  /** Provider-specific on-disk dir names that map to this project (legacy ids). */
  aliases: string[];
  providers: CliProvider[];
  sessionCount: number;
  lastTimestamp?: string;
  archived?: boolean;
  pinned?: boolean;
}

export interface ProjectDetail {
  encoded: string;
  decoded: string;
  sessionCount: number;
  lastTimestamp?: string;
  diskPath: string;
  pathExists: boolean;
  gitRemoteUrl?: string;
  gitBranch?: string;
  gitStatus?: string;
  nodeVersion?: string;
  packageManager?: string;
}

export interface DailyStats {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface SkillInfo {
  id: string;
  name: string;
  version?: string;
  description?: string;
  provider: CliProvider;
  scope: 'global' | 'project';
  directory: string;
}

export interface McpServerInfo {
  id: string;
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  provider: CliProvider;
  scope: 'global' | 'project';
  status?: 'healthy' | 'unhealthy' | 'unknown';
}

export interface RuleFile {
  id: string;
  name: string;
  path: string;
  provider: CliProvider;
  scope: 'global' | 'project';
  exists: boolean;
}
