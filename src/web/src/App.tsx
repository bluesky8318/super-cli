import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSessions, fetchProjects, fetchSessionMessages, fetchTasks, resumeSession, createNewSession, fetchProjectDetail, archiveProject, unarchiveProject, pinProject, unpinProject, fetchProviders } from './api/client.js';
import './index.css';

type Theme = 'light' | 'dark' | 'deep';
type ViewMode = 'board' | 'card' | 'list';
type SortMode = 'time-desc' | 'time-asc' | 'messages';
type SessionStatus = 'backlog' | 'in_progress' | 'review' | 'done' | 'cancelled';
type CliProvider = 'claude-code' | 'qoder' | 'codex';

const STATUS_COLUMNS: { key: SessionStatus; label: string; color: string }[] = [
  { key: 'in_progress', label: '进行中', color: '#3b82f6' },
  { key: 'review', label: '待复查', color: '#8b5cf6' },
  { key: 'backlog', label: '待办', color: '#f59e0b' },
  { key: 'done', label: '已完成', color: '#10b981' },
  { key: 'cancelled', label: '已取消', color: '#6b7280' },
];

const PROVIDER_COLORS: Record<CliProvider, string> = {
  'claude-code': '#d97706',
  'qoder': '#7c3aed',
  'codex': '#059669',
};

const PROVIDER_LABELS: Record<CliProvider, string> = {
  'claude-code': 'CC',
  'qoder': 'QD',
  'codex': 'CX',
};

interface ProviderInfo {
  id: CliProvider;
  name: string;
  command: string;
}

interface SessionItem {
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
}

interface Message {
  type: string;
  timestamp?: string;
  content: any;
  model?: string;
  usage?: any;
}

interface ProjectInfo {
  encoded: string;
  decoded: string;
  providers: CliProvider[];
  sessionCount: number;
  lastTimestamp?: string;
  archived?: boolean;
  pinned?: boolean;
}

interface ProjectDetailData {
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

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'light');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<CliProvider[]>(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('provider');
    return p ? p.split(',') as CliProvider[] : [];
  });
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('project') || null;
  });
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('view') as ViewMode) || 'board';
  });
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('sort') as SortMode) || 'time-desc';
  });
  const [projectSort, setProjectSort] = useState<'time' | 'count'>('time');
  const [groupByDate, setGroupByDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const groupParam = params.get('group');
    if (groupParam === 'off') return false;
    if (groupParam === 'date') return true;
    const sort = (params.get('sort') as SortMode) || 'time-desc';
    return sort === 'time-desc' || sort === 'time-asc';
  });
  const [detailWidth, setDetailWidth] = useState(440);
  const [resizing, setResizing] = useState(false);
  const [tooltip, setTooltip] = useState<{ session: SessionItem; x: number; y: number } | null>(null);
  const [resumeStatus, setResumeStatus] = useState<string | null>(null);
  const [archivedCollapsed, setArchivedCollapsed] = useState(true);
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [projectDetail, setProjectDetail] = useState<ProjectDetailData | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const initialSessionId = useRef(new URLSearchParams(window.location.search).get('session'));

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedProviders.length > 0) params.set('provider', selectedProviders.join(','));
    if (selectedProject) params.set('project', selectedProject);
    if (viewMode !== 'board') params.set('view', viewMode);
    if (sortMode !== 'time-desc') params.set('sort', sortMode);
    if (selectedSession) params.set('session', selectedSession.sessionId);
    const isTimeBased = sortMode === 'time-desc' || sortMode === 'time-asc';
    if (isTimeBased && !groupByDate) params.set('group', 'off');
    if (!isTimeBased && groupByDate) params.set('group', 'date');
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [selectedProviders, selectedProject, viewMode, sortMode, selectedSession, groupByDate]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (providers.length > 0) {
      const providerParam = selectedProviders.length === 1 ? { provider: selectedProviders[0] } : undefined;
      fetchProjects(providerParam).then(data => {
        setProjects(data.projects ?? []);
      });
    }
  }, [selectedProviders]);

  useEffect(() => {
    loadSessions();
  }, [selectedProject, selectedProviders, sortMode]);

  async function loadData() {
    const providerParam = selectedProviders.length === 1 ? { provider: selectedProviders[0] } : undefined;
    const [projData, providerData] = await Promise.all([
      fetchProjects(providerParam),
      fetchProviders(),
    ]);
    setProjects(projData.projects ?? []);
    setProviders(providerData.providers ?? []);
    await loadSessions();
  }

  async function loadSessions() {
    setLoading(true);
    const params: Record<string, string> = { limit: '200' };
    if (selectedProject) params.project = selectedProject;
    if (selectedProviders.length === 1) params.provider = selectedProviders[0];
    const [data, taskData] = await Promise.all([fetchSessions(params), fetchTasks()]);
    const taskMap = new Map((taskData.tasks ?? []).map((t: any) => [t.sessionId, t]));

    let enriched: SessionItem[] = (data.sessions ?? []).map((s: any) => {
      const task = taskMap.get(s.sessionId);
      return { ...s, label: task?.label ?? s.label, tags: task?.tags ?? s.tags, status: s.status ?? 'backlog' };
    });

    if (selectedProviders.length > 1) {
      enriched = enriched.filter(s => selectedProviders.includes(s.provider));
    }

    enriched = sortSessions(enriched, sortMode);
    setSessions(enriched);
    setLoading(false);

    if (initialSessionId.current && !selectedSession) {
      const match = enriched.find(s => s.sessionId === initialSessionId.current);
      initialSessionId.current = null;
      if (match) selectSession(match);
    }
  }

  function sortSessions(list: SessionItem[], mode: SortMode): SessionItem[] {
    return [...list].sort((a, b) => {
      if (mode === 'time-desc') return (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? '');
      if (mode === 'time-asc') return (a.lastTimestamp ?? '').localeCompare(b.lastTimestamp ?? '');
      return (b.userMessageCount + b.assistantMessageCount) - (a.userMessageCount + a.assistantMessageCount);
    });
  }

  function getSortedProjects(): ProjectInfo[] {
    if (projectSort === 'time') {
      return [...projects].sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''));
    }
    return [...projects].sort((a, b) => b.sessionCount - a.sessionCount);
  }

  async function selectSession(session: SessionItem) {
    setSelectedSession(session);
    setDetailLoading(true);
    const data = await fetchSessionMessages(session.sessionId, { limit: '200' });
    setMessages(data.messages ?? []);
    setDetailLoading(false);
  }

  function closeDetail() {
    setSelectedSession(null);
    setMessages([]);
  }

  function scrollToTop() {
    messageListRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }

  function scrollToBottom() {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'instant' });
  }

  async function resumeInTerminal(session: SessionItem) {
    setResumeStatus('launching');
    try {
      const result = await resumeSession(session.sessionId);
      if (result.action === 'focused') {
        setResumeStatus('已切换到运行中的窗口');
      } else if (result.action === 'launched') {
        setResumeStatus(`已在 ${result.terminal} 中打开`);
      } else {
        setResumeStatus(result.message ?? '启动失败');
      }
    } catch {
      setResumeStatus('请求失败');
    }
    setTimeout(() => setResumeStatus(null), 3000);
  }

  async function handleArchive(encoded: string, e: React.MouseEvent) {
    e.stopPropagation();
    await archiveProject(encoded);
    const providerParam = selectedProviders.length === 1 ? { provider: selectedProviders[0] } : undefined;
    const projData = await fetchProjects(providerParam);
    setProjects(projData.projects ?? []);
  }

  async function handleUnarchive(encoded: string, e: React.MouseEvent) {
    e.stopPropagation();
    await unarchiveProject(encoded);
    const providerParam = selectedProviders.length === 1 ? { provider: selectedProviders[0] } : undefined;
    const projData = await fetchProjects(providerParam);
    setProjects(projData.projects ?? []);
  }

  async function handlePin(encoded: string, e: React.MouseEvent) {
    e.stopPropagation();
    await pinProject(encoded);
    const providerParam = selectedProviders.length === 1 ? { provider: selectedProviders[0] } : undefined;
    const projData = await fetchProjects(providerParam);
    setProjects(projData.projects ?? []);
  }

  async function handleUnpin(encoded: string, e: React.MouseEvent) {
    e.stopPropagation();
    await unpinProject(encoded);
    const providerParam = selectedProviders.length === 1 ? { provider: selectedProviders[0] } : undefined;
    const projData = await fetchProjects(providerParam);
    setProjects(projData.projects ?? []);
  }

  async function openProjectDetail(encoded: string, e: React.MouseEvent) {
    e.stopPropagation();
    const data = await fetchProjectDetail(encoded);
    setProjectDetail(data);
  }

  async function handleNewTask() {
    if (!selectedProject) return;
    const provider = selectedProviders.length === 1 ? selectedProviders[0] : undefined;
    const result = await createNewSession(selectedProject, provider);
    if (result.action === 'error') {
      alert(result.message ?? '启动失败');
    }
  }

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = detailWidth;

    const onMove = (ev: MouseEvent) => {
      const diff = startX - ev.clientX;
      setDetailWidth(Math.max(300, Math.min(800, startWidth + diff)));
    };
    const onUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [detailWidth]);

  const filteredSessions = searchQuery
    ? sessions.filter(s =>
        s.firstUserMessage?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sessionId.includes(searchQuery) ||
        s.gitBranch?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;

  return (
    <div className={`app-container ${resizing ? 'resizing' : ''}`}>
      {/* 左侧导航 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">任务中心</h1>
          <div className="theme-switcher">
            <button className={`theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')} title="亮色">☀️</button>
            <button className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')} title="暗色">🌙</button>
            <button className={`theme-btn ${theme === 'deep' ? 'active' : ''}`} onClick={() => setTheme('deep')} title="深色">🌑</button>
          </div>
        </div>

        {providers.length > 1 && (
          <div className="provider-dropdown-wrapper">
            <button
              className="provider-dropdown-trigger"
              onClick={() => setProviderDropdownOpen(o => !o)}
            >
              {selectedProviders.length === 0 ? (
                <span className="provider-trigger-text">全部工具</span>
              ) : (
                <span className="provider-trigger-chips">
                  {selectedProviders.map(id => {
                    const p = providers.find(x => x.id === id);
                    return (
                      <span key={id} className="provider-chip" style={{ background: PROVIDER_COLORS[id] }}>
                        {p?.name || id}
                      </span>
                    );
                  })}
                </span>
              )}
              <svg className={`provider-dropdown-arrow ${providerDropdownOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {providerDropdownOpen && (
              <>
                <div className="provider-dropdown-backdrop" onClick={() => setProviderDropdownOpen(false)} />
                <div className="provider-dropdown-menu">
                  <label className="provider-dropdown-item" onClick={() => { setSelectedProviders([]); setSelectedProject(null); setProviderDropdownOpen(false); }}>
                    <span className={`provider-check ${selectedProviders.length === 0 ? 'checked' : ''}`}>
                      {selectedProviders.length === 0 && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </span>
                    <span>全部工具</span>
                  </label>
                  {providers.map(p => {
                    const checked = selectedProviders.includes(p.id);
                    return (
                      <label key={p.id} className="provider-dropdown-item" onClick={() => {
                        const next = checked
                          ? selectedProviders.filter(x => x !== p.id)
                          : [...selectedProviders, p.id];
                        setSelectedProviders(next);
                        setSelectedProject(null);
                      }}>
                        <span className={`provider-check ${checked ? 'checked' : ''}`}>
                          {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        </span>
                        <span className="provider-dot" style={{ background: PROVIDER_COLORS[p.id] }} />
                        <span>{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <div className="sidebar-section">
          <div className="section-header">
            <span className="section-title">项目</span>
            <button className="sort-btn" onClick={() => setProjectSort(p => p === 'time' ? 'count' : 'time')} title={projectSort === 'time' ? '按时间排序' : '按数量排序'}>
              {projectSort === 'time' ? '🕐' : '#'}
            </button>
          </div>
          <div className="project-list">
            <div
              className={`project-item ${!selectedProject ? 'active' : ''}`}
              onClick={() => setSelectedProject(null)}
            >
              <span className="project-name">全部项目</span>
              <span className="project-count">{sessions.length}</span>
            </div>
            {getSortedProjects().filter(p => p.pinned && !p.archived).length > 0 && (
              <>
                <div className="section-divider">
                  <span>置顶</span>
                </div>
                {getSortedProjects().filter(p => p.pinned && !p.archived).map(p => (
                  <div
                    key={p.encoded}
                    className={`project-item ${selectedProject === p.decoded ? 'active' : ''}`}
                    onClick={() => setSelectedProject(p.decoded)}
                  >
                    <span className="project-name">{p.decoded.split('/').slice(-2).join('/')}</span>
                    <span className="project-count">{p.sessionCount}</span>
                    <span className="project-actions">
                      <button className="project-action-btn" onClick={(e) => openProjectDetail(p.encoded, e)} title="查看详情"><IconInfo /></button>
                      <button className="project-action-btn" onClick={(e) => handleUnpin(p.encoded, e)} title="取消置顶"><IconPinOff /></button>
                    </span>
                  </div>
                ))}
              </>
            )}
            {getSortedProjects().filter(p => !p.pinned && !p.archived).length > 0 && (
              <>
                {getSortedProjects().filter(p => p.pinned && !p.archived).length > 0 && (
                  <div className="section-divider">
                    <span>全部</span>
                  </div>
                )}
                {getSortedProjects().filter(p => !p.pinned && !p.archived).map(p => (
                  <div
                    key={p.encoded}
                    className={`project-item ${selectedProject === p.decoded ? 'active' : ''}`}
                    onClick={() => setSelectedProject(p.decoded)}
                  >
                    <span className="project-name">{p.decoded.split('/').slice(-2).join('/')}</span>
                    <span className="project-count">{p.sessionCount}</span>
                    <span className="project-actions">
                      <button className="project-action-btn" onClick={(e) => openProjectDetail(p.encoded, e)} title="查看详情"><IconInfo /></button>
                      <button className="project-action-btn" onClick={(e) => handlePin(p.encoded, e)} title="置顶"><IconPin /></button>
                      <button className="project-action-btn" onClick={(e) => handleArchive(p.encoded, e)} title="归档"><IconArchive /></button>
                    </span>
                  </div>
                ))}
              </>
            )}
            {getSortedProjects().filter(p => p.archived).length > 0 && (
              <>
                <div className="archive-header" onClick={() => setArchivedCollapsed(!archivedCollapsed)}>
                  <span className={`archive-toggle ${archivedCollapsed ? '' : 'open'}`}>▶</span>
                  <span>归档</span>
                  <span className="project-count">{getSortedProjects().filter(p => p.archived).length}</span>
                </div>
                {!archivedCollapsed && getSortedProjects().filter(p => p.archived).map(p => (
                  <div
                    key={p.encoded}
                    className={`project-item archived ${selectedProject === p.decoded ? 'active' : ''}`}
                    onClick={() => setSelectedProject(p.decoded)}
                  >
                    <span className="project-name">{p.decoded.split('/').slice(-2).join('/')}</span>
                    <span className="project-count">{p.sessionCount}</span>
                    <span className="project-actions">
                      <button className="project-action-btn" onClick={(e) => openProjectDetail(p.encoded, e)} title="查看详情"><IconInfo /></button>
                      <button className="project-action-btn" onClick={(e) => handleUnarchive(p.encoded, e)} title="取消归档"><IconArchiveRestore /></button>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="main-content">
        <header className="toolbar">
          <div className="toolbar-left">
            <h2 className="page-title">
              {selectedProject ? selectedProject.split('/').slice(-2).join('/') : '全部任务'}
            </h2>
            <span className="task-count">{filteredSessions.length}</span>
            {selectedProject && (
              <button className="new-task-btn" onClick={handleNewTask} title="在当前项目新建任务">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                新建任务
              </button>
            )}
          </div>
          <div className="toolbar-right">
            <div className="search-box">
              <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/></svg>
              <input type="text" placeholder="搜索任务..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <select className="sort-select" value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>
              <option value="time-desc">最近更新</option>
              <option value="time-asc">最早更新</option>
              <option value="messages">消息最多</option>
            </select>
            {(sortMode === 'time-desc' || sortMode === 'time-asc') && viewMode === 'board' && (
              <button
                className={`group-toggle ${groupByDate ? 'active' : ''}`}
                onClick={() => setGroupByDate(g => !g)}
                title="按日期分组"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
              </button>
            )}
            <div className="view-toggle">
              <button className={`view-btn ${viewMode === 'board' ? 'active' : ''}`} onClick={() => setViewMode('board')} title="看板视图">
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M2 4a1 1 0 011-1h4a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4zm6 0a1 1 0 011-1h4a1 1 0 011 1v12a1 1 0 01-1 1H9a1 1 0 01-1-1V4zm7-1a1 1 0 00-1 1v12a1 1 0 001 1h4a1 1 0 001-1V4a1 1 0 00-1-1h-4z"/></svg>
              </button>
              <button className={`view-btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')} title="卡片视图">
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
              </button>
              <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="列表视图">
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/></svg>
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="loading">加载中...</div>
        ) : viewMode === 'board' ? (
          <div className="board">
            {STATUS_COLUMNS.map(col => {
              const colSessions = filteredSessions.filter(s => s.status === col.key);
              const dateGroupActive = groupByDate && (sortMode === 'time-desc' || sortMode === 'time-asc');
              const dateGroups = dateGroupActive ? groupSessionsByDate(colSessions) : null;
              return (
                <div key={col.key} className="board-column">
                  <div className="column-header">
                    <span className="column-dot" style={{ backgroundColor: col.color }}></span>
                    <span className="column-title">{col.label}</span>
                    <span className="column-count">{colSessions.length}</span>
                  </div>
                  <div className="column-cards">
                    {dateGroups ? dateGroups.map(group => (
                      <DateGroupSection key={group.label} label={group.label} count={group.sessions.length}>
                        {group.sessions.map(s => (
                          <SessionCard
                            key={s.sessionId}
                            session={s}
                            isSelected={selectedSession?.sessionId === s.sessionId}
                            onClick={() => selectSession(s)}
                            onHover={(e) => setTooltip({ session: s, x: e.clientX, y: e.clientY })}
                            onLeave={() => setTooltip(null)}
                          />
                        ))}
                      </DateGroupSection>
                    )) : colSessions.map(s => (
                      <SessionCard
                        key={s.sessionId}
                        session={s}
                        isSelected={selectedSession?.sessionId === s.sessionId}
                        onClick={() => selectSession(s)}
                        onHover={(e) => setTooltip({ session: s, x: e.clientX, y: e.clientY })}
                        onLeave={() => setTooltip(null)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'card' ? (
          <div className="card-grid">
            {filteredSessions.map(s => (
              <SessionCard
                key={s.sessionId}
                session={s}
                isSelected={selectedSession?.sessionId === s.sessionId}
                onClick={() => selectSession(s)}
                onHover={(e) => setTooltip({ session: s, x: e.clientX, y: e.clientY })}
                onLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        ) : (
          <div className="list-view">
            {filteredSessions.map(s => (
              <SessionListItem
                key={s.sessionId}
                session={s}
                isSelected={selectedSession?.sessionId === s.sessionId}
                onClick={() => selectSession(s)}
              />
            ))}
          </div>
        )}
      </main>

      {/* 右侧详情面板 */}
      {selectedSession && (
        <>
          <div className="resize-handle" onMouseDown={handleResizeStart}></div>
          <aside className="detail-panel" style={{ width: detailWidth }}>
            <div className="detail-header">
              <div className="detail-title-area">
                <h3 className="detail-title">{selectedSession.label || selectedSession.firstUserMessage?.slice(0, 50) || selectedSession.sessionId.slice(0, 8)}</h3>
                <span className="detail-id">{selectedSession.sessionId.slice(0, 8)}</span>
                {selectedSession.gitBranch && <span className="detail-badge">{selectedSession.gitBranch}</span>}
              </div>
              <div className="detail-actions">
                <button className="action-btn" onClick={() => resumeInTerminal(selectedSession)} title="在终端中恢复会话" disabled={resumeStatus === 'launching'}>
                  {resumeStatus === 'launching' ? '⏳ 启动中...' : resumeStatus ? `✓ ${resumeStatus}` : '▶ 恢复'}
                </button>
                <button className="close-btn" onClick={closeDetail}>✕</button>
              </div>
            </div>

            <div className="detail-meta">
              <MetaItem label="项目" value={selectedSession.project?.split('/').slice(-2).join('/')} />
              <MetaItem label="时间" value={selectedSession.firstTimestamp ? new Date(selectedSession.firstTimestamp).toLocaleString('zh-CN') : '-'} />
              <MetaItem label="消息" value={`${selectedSession.userMessageCount} 提问 / ${selectedSession.assistantMessageCount} 回复`} />
              <MetaItem label="模型" value={selectedSession.models?.join(', ') || '-'} />
              <MetaItem label="Token" value={`${(selectedSession.totalInputTokens / 1000).toFixed(0)}k 入 / ${(selectedSession.totalOutputTokens / 1000).toFixed(0)}k 出`} />
            </div>

            <div className="detail-nav">
              <button className="nav-btn" onClick={scrollToTop} title="跳到开头">⬆ 最早</button>
              <span className="nav-label">对话记录</span>
              <button className="nav-btn" onClick={scrollToBottom} title="跳到末尾">⬇ 最新</button>
            </div>

            <div className="detail-conversation" ref={messageListRef}>
              {detailLoading ? (
                <div className="loading-small">加载中...</div>
              ) : (
                messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
              )}
            </div>
          </aside>
        </>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <div className="tooltip-title">{tooltip.session.label || tooltip.session.firstUserMessage?.slice(0, 100)}</div>
          {tooltip.session.firstUserMessage && tooltip.session.firstUserMessage.length > 100 && (
            <div className="tooltip-content">{tooltip.session.firstUserMessage.slice(0, 300)}...</div>
          )}
        </div>
      )}

      {/* Project Detail Overlay */}
      {projectDetail && (
        <div className="overlay-backdrop" onClick={() => setProjectDetail(null)}>
          <div className="overlay-panel" onClick={e => e.stopPropagation()}>
            <div className="overlay-header">
              <h3>{projectDetail.decoded.split('/').slice(-2).join('/')}</h3>
              <button className="close-btn" onClick={() => setProjectDetail(null)}>✕</button>
            </div>
            <div className="overlay-body">
              <MetaItem label="路径" value={projectDetail.diskPath} />
              <MetaItem label="状态" value={projectDetail.pathExists ? '路径存在' : '路径不存在'} />
              {projectDetail.gitRemoteUrl && <MetaItem label="Git Remote" value={projectDetail.gitRemoteUrl} />}
              {projectDetail.gitBranch && <MetaItem label="当前分支" value={projectDetail.gitBranch} />}
              {projectDetail.gitStatus !== undefined && (
                <div className="meta-row">
                  <span className="meta-label">Git Status</span>
                  <span className="meta-value meta-pre">{projectDetail.gitStatus || '(clean)'}</span>
                </div>
              )}
              {projectDetail.nodeVersion && <MetaItem label="Node" value={projectDetail.nodeVersion} />}
              {projectDetail.packageManager && <MetaItem label="包管理器" value={projectDetail.packageManager} />}
              <MetaItem label="会话数" value={String(projectDetail.sessionCount)} />
              {projectDetail.lastTimestamp && <MetaItem label="最近活跃" value={new Date(projectDetail.lastTimestamp).toLocaleString('zh-CN')} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DateGroupSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="date-group">
      <div className="date-group-label" onClick={() => setCollapsed(c => !c)}>
        <svg className={`date-group-chevron ${collapsed ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span>{label}</span>
        <span className="date-group-count">{count}</span>
      </div>
      {!collapsed && children}
    </div>
  );
}

function SessionCard({ session, isSelected, onClick, onHover, onLeave }: {
  session: SessionItem; isSelected: boolean; onClick: () => void;
  onHover: (e: React.MouseEvent) => void; onLeave: () => void;
}) {
  const title = session.label || session.firstUserMessage?.slice(0, 60) || session.sessionId.slice(0, 8);
  const lastMsg = session.firstUserMessage?.slice(0, 100) || '';
  const timeAgo = session.lastTimestamp ? getTimeAgo(new Date(session.lastTimestamp)) : '';

  return (
    <div
      className={`session-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="card-title">
        {session.provider && (
          <span className="provider-badge" style={{ background: PROVIDER_COLORS[session.provider] }}>{PROVIDER_LABELS[session.provider]}</span>
        )}
        {title}
      </div>
      <div className="card-last-msg">{lastMsg}</div>
      <div className="card-footer">
        <span className="card-time">{timeAgo}</span>
        <span className="card-stats">💬 {session.userMessageCount + session.assistantMessageCount}</span>
        {session.gitBranch && <span className="card-branch">{session.gitBranch}</span>}
      </div>
    </div>
  );
}

function SessionListItem({ session, isSelected, onClick }: { session: SessionItem; isSelected: boolean; onClick: () => void }) {
  const title = session.label || session.firstUserMessage?.slice(0, 80) || session.sessionId.slice(0, 8);
  const timeAgo = session.lastTimestamp ? getTimeAgo(new Date(session.lastTimestamp)) : '';

  return (
    <div className={`list-item ${isSelected ? 'selected' : ''}`} onClick={onClick}>
      <div className="list-item-title">
        {session.provider && (
          <span className="provider-badge" style={{ background: PROVIDER_COLORS[session.provider] }}>{PROVIDER_LABELS[session.provider]}</span>
        )}
        {title}
      </div>
      <div className="list-item-meta">
        <span>{session.project?.split('/').slice(-2).join('/')}</span>
        <span>{timeAgo}</span>
        <span>💬 {session.userMessageCount + session.assistantMessageCount}</span>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.type === 'user';
  const content = extractContent(message.content);

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-header">
        <span className="message-role">{isUser ? '你' : '助手'}</span>
        <span className="message-time">{message.timestamp ? new Date(message.timestamp).toLocaleTimeString('zh-CN') : ''}</span>
      </div>
      <div className="message-content">{content.slice(0, 1200)}{content.length > 1200 ? '...' : ''}</div>
    </div>
  );
}

function extractContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (block.type === 'text') return block.text ?? '';
        if (block.type === 'tool_use') return `🔧 ${block.name}`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(content);
}

function getDateGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[date.getDay()];
  }
  return '更早';
}

function groupSessionsByDate(sessions: SessionItem[]): { label: string; sessions: SessionItem[] }[] {
  const groups = new Map<string, SessionItem[]>();
  for (const s of sessions) {
    const label = s.lastTimestamp ? getDateGroup(new Date(s.lastTimestamp)) : '更早';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(s);
  }
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const today = new Date().getDay();
  const recentDays: string[] = [];
  for (let i = 2; i < 7; i++) {
    recentDays.push(weekdays[(today - i + 7) % 7]);
  }
  const order = ['今天', '昨天', ...recentDays, '更早'];
  return order.filter(l => groups.has(l)).map(l => ({ label: l, sessions: groups.get(l)! }));
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function IconPin() {
  return <svg {...iconProps}><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>;
}

function IconPinOff() {
  return <svg {...iconProps}><path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/></svg>;
}

function IconArchive() {
  return <svg {...iconProps}><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>;
}

function IconArchiveRestore() {
  return <svg {...iconProps}><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/></svg>;
}

function IconInfo() {
  return <svg {...iconProps}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>;
}
