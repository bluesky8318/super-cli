export type CliProvider = 'claude-code' | 'qoder' | 'codex';
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

export interface AppConfig {
  version: number;
  sessions: Record<string, TaskLabel>;
  archivedProjects?: string[];
  pinnedProjects?: string[];
  settings: {
    defaultPort?: number;
    claudeHome?: string;
    terminal?: TerminalType;
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
  encoded: string;
  decoded: string;
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
