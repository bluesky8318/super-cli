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
