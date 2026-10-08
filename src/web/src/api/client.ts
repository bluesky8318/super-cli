const API_BASE = '/api';

export async function fetchProviders() {
  const res = await fetch(`${API_BASE}/providers`);
  return res.json();
}

export async function fetchSessions(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/sessions`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchSession(id: string) {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  return res.json();
}

export async function fetchSessionMessages(id: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/sessions/${id}/messages`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function searchSessions(query: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/search`, window.location.origin);
  url.searchParams.set('q', query);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchTasks(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/tasks`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`);
  return res.json();
}

export async function fetchProjects(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/projects`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function updateTask(id: string, data: { label?: string; tags?: string[] }) {
  const res = await fetch(`${API_BASE}/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteTask(id: string) {
  const res = await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function resumeSession(id: string) {
  const res = await fetch(`${API_BASE}/sessions/${id}/resume`, { method: 'POST' });
  return res.json();
}

export async function createNewSession(project: string, provider?: string, prompt?: string, agentId?: string) {
  const res = await fetch(`${API_BASE}/sessions/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, provider, prompt, agentId }),
  });
  return res.json();
}

export async function fetchProjectDetail(encoded: string) {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(encoded)}/detail`);
  return res.json();
}

export async function archiveProject(encoded: string) {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(encoded)}/archive`, { method: 'POST' });
  return res.json();
}

export async function unarchiveProject(encoded: string) {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(encoded)}/unarchive`, { method: 'POST' });
  return res.json();
}

export async function pinProject(encoded: string) {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(encoded)}/pin`, { method: 'POST' });
  return res.json();
}

export async function unpinProject(encoded: string) {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(encoded)}/unpin`, { method: 'POST' });
  return res.json();
}

export async function openProjectInFinder(encoded: string) {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(encoded)}/open-finder`, { method: 'POST' });
  return res.json();
}

export async function openProjectInTerminal(encoded: string) {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(encoded)}/open-terminal`, { method: 'POST' });
  return res.json();
}

// Config: Skills
export async function fetchSkills(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/config/skills`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchSkillContent(provider: string, id: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/config/skills/${provider}/${encodeURIComponent(id)}/content`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function deleteSkillApi(provider: string, id: string) {
  const res = await fetch(`${API_BASE}/config/skills/${provider}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.json();
}

export async function copySkillApi(from: string, to: string, id: string) {
  const res = await fetch(`${API_BASE}/config/skills/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, id }),
  });
  return res.json();
}

// Config: MCP
export async function fetchMcpServers(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/config/mcp`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function addMcpServerApi(provider: string, data: { id: string; config: object; project?: string }) {
  const res = await fetch(`${API_BASE}/config/mcp/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateMcpServerApi(provider: string, id: string, data: { config: object; project?: string }) {
  const res = await fetch(`${API_BASE}/config/mcp/${provider}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteMcpServerApi(provider: string, id: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/config/mcp/${provider}/${encodeURIComponent(id)}`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'DELETE' });
  return res.json();
}

export async function copyMcpServerApi(from: string, to: string, id: string) {
  const res = await fetch(`${API_BASE}/config/mcp/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, id }),
  });
  return res.json();
}

// Config: Rules
export async function fetchRules(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/config/rules`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchRuleContent(path: string) {
  const url = new URL(`${API_BASE}/config/rules/content`, window.location.origin);
  url.searchParams.set('path', path);
  const res = await fetch(url.toString());
  return res.json();
}

export async function saveRuleContentApi(path: string, content: string) {
  const res = await fetch(`${API_BASE}/config/rules/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  return res.json();
}

// Config: Hooks
export async function fetchHooks(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/config/hooks`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

// Config: Permissions
export async function fetchPermissions(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/config/permissions`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

export async function refreshCache() {
  const res = await fetch(`${API_BASE}/refresh`, { method: 'POST' });
  return res.json();
}

export async function fetchProjectFiles(encoded: string, path: string = '') {
  const url = new URL(`${API_BASE}/projects/${encodeURIComponent(encoded)}/files`, window.location.origin);
  if (path) url.searchParams.set('path', path);
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchProjectFileContent(encoded: string, path: string) {
  const url = new URL(`${API_BASE}/projects/${encodeURIComponent(encoded)}/files/content`, window.location.origin);
  url.searchParams.set('path', path);
  const res = await fetch(url.toString());
  return res.json();
}

// ====== Issues ======

// Error carrying the HTTP status and server error code (e.g. VERSION_CONFLICT on 409).
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code, data?.error?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

export async function fetchIssues(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/issues`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return jsonOrThrow(await fetch(url.toString()));
}

export async function createIssue(data: {
  title: string;
  projectEncoded?: string;
  description?: string;
  status?: string;
  priority?: string;
  labels?: string[];
}) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function fetchIssue(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}`));
}

export async function updateIssue(id: string, data: {
  version: number;
  title?: string;
  description?: string;
  priority?: string;
  labels?: string[];
  projectEncoded?: string;
}) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function moveIssue(id: string, data: { status: string; sortOrder?: number; version: number }) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function archiveIssue(id: string, version: number) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  }));
}

export async function restoreIssue(id: string, version: number) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  }));
}

export async function deleteIssue(id: string, version: number) {
  const url = new URL(`${API_BASE}/issues/${encodeURIComponent(id)}`, window.location.origin);
  url.searchParams.set('version', String(version));
  return jsonOrThrow(await fetch(url.toString(), { method: 'DELETE' }));
}

export async function addIssueRelation(id: string, type: string, targetId: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/relations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, targetId }),
  }));
}

export async function deleteIssueRelation(id: string, type: string, targetId: string) {
  return jsonOrThrow(await fetch(
    `${API_BASE}/issues/${encodeURIComponent(id)}/relations/${encodeURIComponent(type)}/${encodeURIComponent(targetId)}`,
    { method: 'DELETE' },
  ));
}

export async function fetchIssueComments(id: string, after?: string) {
  const url = new URL(`${API_BASE}/issues/${encodeURIComponent(id)}/comments`, window.location.origin);
  if (after) url.searchParams.set('after', after);
  return jsonOrThrow(await fetch(url.toString()));
}

export async function createIssueComment(id: string, data: { body: string; authorType?: string; sessionId?: string }) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function updateComment(id: string, data: { body: string; version: number }) {
  return jsonOrThrow(await fetch(`${API_BASE}/comments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function deleteComment(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export async function bindIssueSession(id: string, sessionId: string, version: number) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  }));
}

export async function unbindIssueSession(id: string, sessionId: string, version: number) {
  const url = new URL(`${API_BASE}/issues/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`, window.location.origin);
  url.searchParams.set('version', String(version));
  return jsonOrThrow(await fetch(url.toString(), { method: 'DELETE' }));
}

export async function fetchIssueActivities(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/activities`));
}

// --- Ideas (想法) ---

export async function fetchIdeas(params?: Record<string, string>) {
  const url = new URL(`${API_BASE}/ideas`, window.location.origin);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return jsonOrThrow(await fetch(url));
}

export async function fetchIdeaCategories(): Promise<{ categories: import('../types.js').IdeaCategory[] }> {
  return jsonOrThrow(await fetch(`${API_BASE}/ideas/categories`));
}

export async function createIdea(data: { content: string }) {
  return jsonOrThrow(await fetch(`${API_BASE}/ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function categorizeIdea(id: string, category: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/ideas/${encodeURIComponent(id)}/categorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  }));
}

export async function commentIdea(id: string, body: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/ideas/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  }));
}

export async function abandonIdea(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/ideas/${encodeURIComponent(id)}/abandon`, { method: 'POST' }));
}

export async function restoreIdea(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/ideas/${encodeURIComponent(id)}/restore`, { method: 'POST' }));
}

export async function archiveIdea(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/ideas/${encodeURIComponent(id)}/archive`, { method: 'POST' }));
}

export async function promoteIdea(id: string, data?: { title?: string; project?: string; priority?: string }) {
  return jsonOrThrow(await fetch(`${API_BASE}/ideas/${encodeURIComponent(id)}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  }));
}

// --- Agent profiles ---

export async function fetchAgents() {
  return jsonOrThrow(await fetch(`${API_BASE}/agents`));
}

export async function createAgent(data: {
  name: string;
  provider: string;
  model?: string;
  workingDir?: string;
  extraArgs?: string[];
}) {
  return jsonOrThrow(await fetch(`${API_BASE}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function updateAgent(id: string, data: {
  name?: string;
  model?: string | null;
  workingDir?: string | null;
  extraArgs?: string[] | null;
}) {
  return jsonOrThrow(await fetch(`${API_BASE}/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function deleteAgent(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

// --- Issue runs ---

export async function fetchIssueRuns(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/runs`));
}

export async function startIssueRun(id: string, agentId?: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agentId ? { agentId } : {}),
  }));
}

export async function stopIssueRun(id: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/runs/stop`, { method: 'POST' }));
}

// --- System config ---

export async function fetchSystemConfig() {
  return jsonOrThrow(await fetch(`${API_BASE}/config/system`));
}

export async function updateSystemConfig(data: Record<string, unknown>) {
  return jsonOrThrow(await fetch(`${API_BASE}/config/system`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function revealSuperCliHome() {
  return jsonOrThrow(await fetch(`${API_BASE}/config/system/reveal`, { method: 'POST' }));
}

export async function fetchSystemDataFile(name: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/config/system/files/${encodeURIComponent(name)}`));
}

export async function fetchSystemRunFile(file: string) {
  return jsonOrThrow(await fetch(`${API_BASE}/config/system/files/runs/${encodeURIComponent(file)}`));
}

// --- WeChat board ---

export interface WechatStatusData {
  reachable: boolean;
  ready?: boolean;
  version?: string;
  account?: { wxid: string; name: string };
  error?: string;
}

export interface WechatDashboardData {
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
  activeChats: {
    talker: string;
    name: string;
    isGroup: boolean;
    messageCount: number;
    lastTime: number;
    senders: string[];
  }[];
  mentions: { time: number; chatName: string; talker: string; sender: string; snippet: string }[];
  links: { url: string; domain: string; title: string; chatName: string; sender: string; time: number; count: number }[];
  people: { sender: string; messageCount: number; chatCount: number; lastTime: number }[];
}

export interface WechatReportData {
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

export interface WxServerStatusData {
  installed: boolean;
  running: boolean;
  pid?: number | null;
  baseUrl?: string;
  ready?: boolean;
  health?: string;
  version?: string | null;
  account?: { wxid: string; name: string } | null;
  stdoutLog?: string;
  stderrLog?: string;
  error?: string;
}

export async function fetchWxServerStatus(): Promise<WxServerStatusData> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/server`));
}

export async function startWxServer(): Promise<WxServerStatusData> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/server/start`, { method: 'POST' }));
}

export async function stopWxServer(): Promise<WxServerStatusData> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/server/stop`, { method: 'POST' }));
}

export interface WxSummaryConfigData {
  prompt: string;
  defaultPrompt: string;
  runtime: 'pi' | 'kimi' | 'mcode' | 'qoder';
  /** Optional model override passed as --model; empty = the CLI's global default. */
  model: string;
  runtimes: { id: string; name: string; command: string; installed: boolean }[];
}

export interface WxSummaryEntry {
  key: string;
  talker: string;
  chatName: string;
  date: string;
  status: 'pending' | 'done' | 'error';
  summary?: string;
  error?: string;
  runtime?: string;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export async function fetchWxSummaryConfig(): Promise<WxSummaryConfigData> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/summary-config`));
}

export async function saveWxSummaryConfig(data: { prompt?: string; runtime?: string; model?: string }): Promise<WxSummaryConfigData> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/summary-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function fetchWxSummaries(): Promise<{ summaries: WxSummaryEntry[] }> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/summaries`));
}

export async function generateWxSummary(data: { talker: string; date: string; name?: string; force?: boolean }): Promise<{ entry: WxSummaryEntry }> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/summaries/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function deleteWxSummary(key: string): Promise<unknown> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/summaries/${encodeURIComponent(key)}`, { method: 'DELETE' }));
}

export async function clearWxSummaries(): Promise<unknown> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/summaries/clear`, { method: 'POST' }));
}

export async function fetchWechatStatus(): Promise<WechatStatusData> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/status`));
}

export async function fetchWechatDashboard(date: string): Promise<WechatDashboardData> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/dashboard?date=${encodeURIComponent(date)}`));
}

export interface WechatSearchResults {
  groups: { talker: string; name: string; isGroup: boolean; summary: string; lastTime?: number }[];
  people: { userName: string; name: string; alias: string; nickName: string }[];
  messages: { serverId?: number; talker: string; chatName: string; sender: string; snippet: string; time?: number }[];
}

export async function searchWechat(q: string): Promise<WechatSearchResults> {
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/search?q=${encodeURIComponent(q)}`));
}

export async function fetchWechatReport(talker: string, date: string, name?: string): Promise<WechatReportData> {
  const params = new URLSearchParams({ talker, date });
  if (name) params.set('name', name);
  return jsonOrThrow(await fetch(`${API_BASE}/wechat/report?${params}`));
}
