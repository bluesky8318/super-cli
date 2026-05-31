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

export async function createNewSession(project: string, provider?: string) {
  const res = await fetch(`${API_BASE}/sessions/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, provider }),
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
