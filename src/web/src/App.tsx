import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchSystemConfig, createIdea, fetchSessions, fetchProjects, fetchSessionMessages, fetchTasks, resumeSession, createNewSession, fetchProjectDetail, archiveProject, unarchiveProject, pinProject, unpinProject, fetchProviders, openProjectInFinder, openProjectInTerminal, refreshCache, fetchProjectFiles, fetchProjectFileContent, fetchIssues, fetchAgents, moveIssue, ApiError } from './api/client.js';
import ConfigView from './ConfigView.js';
import SystemConfigView from './components/SystemConfigView.js';
import IssueCard from './components/IssueCard.js';
import IssueDetail from './components/IssueDetail.js';
import IdeasView from './components/IdeasView.js';
import WeChatView from './components/WeChatView.js';
import NewIssueModal from './components/NewIssueModal.js';
import BoardColumnHeader from './components/BoardColumnHeader.js';
import { PROVIDER_COLORS, PROVIDER_LABELS, ISSUE_COLUMNS, sessionStatusToColumn } from './constants.js';
import type { AgentProfile, CliProvider, Issue, IssueStatus, IssueSummary, ProviderInfo, SessionItem } from './types.js';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-toml.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-docker.js';
import 'prismjs/themes/prism-tomorrow.css';
import { marked } from 'marked';
import './index.css';

type Theme = 'light' | 'dark' | 'deep';
type ViewMode = 'board' | 'card' | 'list';
type SortMode = 'time-desc' | 'time-asc' | 'messages';

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

/** Global floating idea capture — one sentence, from anywhere. */
function IdeaQuickCapture() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [savedTip, setSavedTip] = useState('');

  const save = async () => {
    const content = text.trim();
    if (!content) return;
    const res = await createIdea({ content });
    setText('');
    setSavedTip(`已记录 ${res.idea?.identifier ?? ''}`);
    window.dispatchEvent(new CustomEvent('super-cli:idea-captured'));
    setTimeout(() => { setSavedTip(''); setOpen(false); }, 900);
  };

  return (
    <>
      {open && (
        <div className="idea-quick-panel">
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="记录一个想法…（⌘/Ctrl + Enter 保存）"
            rows={3}
          />
          <div className="idea-quick-actions">
            {savedTip && <span className="idea-quick-saved">{savedTip}</span>}
            <button className="btn" onClick={() => setOpen(false)}>取消</button>
            <button className="btn-primary" disabled={!text.trim()} onClick={() => void save()}>记录</button>
          </div>
        </div>
      )}
      <button
        className={`idea-fab${open ? ' idea-fab-open' : ''}`}
        title="记录想法"
        onClick={() => setOpen(o => !o)}
      >
        {open ? '✕' : '💡'}
      </button>
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'light');
  // Nav groups with sub-menus are collapsed by default; the group containing the
  // active mode always shows expanded.
  const [collapsedNav, setCollapsedNav] = useState<Set<string>>(new Set(['inspiration', 'config']));
  const [appMode, setAppMode] = useState<'ideas' | 'task' | 'inspiration' | 'config' | 'system'>(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    return mode === 'task' || mode === 'inspiration' || mode === 'config' || mode === 'system' ? mode : 'ideas';
  });
  const [agents, setAgents] = useState<AgentProfile[]>([]);
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
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [newIssueInitialStatus, setNewIssueInitialStatus] = useState<IssueStatus | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<IssueStatus | null>(null);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const [issueRefreshKey, setIssueRefreshKey] = useState(0);
  const dragIssueRef = useRef<IssueSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('view') as ViewMode) || 'board';
  });
  const [taskTab, setTaskTab] = useState<'issues' | 'sessions'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'sessions' ? 'sessions' : 'issues';
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
  const [refreshing, setRefreshing] = useState(false);
  const [archivedCollapsed, setArchivedCollapsed] = useState(true);
  const [projectSearch, setProjectSearch] = useState('');
  const [allLimit, setAllLimit] = useState(10);
  const [archivedLimit, setArchivedLimit] = useState(10);

  /** Subsequence fuzzy match, case-insensitive. */
  function fuzzyMatch(query: string, target: string): boolean {
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let i = 0;
    for (const ch of t) {
      if (ch === q[i]) i++;
      if (i >= q.length) return true;
    }
    return q.length === 0;
  }

  // Selecting a project jumps to its task view; ideas filter by it too.
  // Project selection has the highest priority: the provider filter is clamped
  // to the providers actually present in the selected project.
  function selectProject(decoded: string | null) {
    setSelectedProject(decoded);
    setAppMode('task');
    if (decoded) {
      const proj = projects.find(p => p.decoded === decoded);
      if (proj) {
        setSelectedProviders(prev => prev.filter(id => proj.providers.includes(id)));
      }
    }
  }
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [newTaskDropdownOpen, setNewTaskDropdownOpen] = useState(false);
  const [projectDetail, setProjectDetail] = useState<ProjectDetailData | null>(null);
  const [overlayTab, setOverlayTab] = useState<'detail' | 'files'>('detail');
  // Right-side project panel (project detail + file browser) in task view.
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  // Default panel width: one third of the viewport, clamped to a sane range.
  const [projectPanelWidth, setProjectPanelWidth] = useState(() =>
    Math.max(320, Math.min(1200, Math.round(window.innerWidth / 2))));
  const [fileManagerLabel, setFileManagerLabel] = useState('Finder');
  const [contextMenu, setContextMenu] = useState<{ encoded: string; decoded: string; pinned: boolean; archived: boolean; x: number; y: number } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar-width');
    return saved ? Number(saved) : 240;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const initialSessionId = useRef(new URLSearchParams(window.location.search).get('session'));

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('mode', appMode);
    if (selectedProviders.length > 0) params.set('provider', selectedProviders.join(','));
    if (selectedProject) params.set('project', selectedProject);
    if (viewMode !== 'board') params.set('view', viewMode);
    if (sortMode !== 'time-desc') params.set('sort', sortMode);
    if (selectedSession) params.set('session', selectedSession.sessionId);
    if (taskTab !== 'issues') params.set('tab', taskTab);
    const isTimeBased = sortMode === 'time-desc' || sortMode === 'time-asc';
    if (isTimeBased && !groupByDate) params.set('group', 'off');
    if (!isTimeBased && groupByDate) params.set('group', 'date');
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [appMode, selectedProviders, selectedProject, viewMode, sortMode, selectedSession, groupByDate, taskTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (providers.length > 0) {
      fetchProjects().then(data => {
        setProjects(data.projects ?? []);
      });
    }
  }, [selectedProviders]);

  useEffect(() => {
    loadSessions();
  }, [selectedProject, selectedProviders, sortMode]);

  // Call this render's loadIssues directly: going through loadIssuesRef here
  // would execute the PREVIOUS render's closure (stale project filter).
  useEffect(() => {
    void loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]);

  // Refetch issues for the current project filter (used by SSE events and conflict recovery).
  function issueQueryParams(): Record<string, string> {
    // Issue project identity is the decoded absolute path (canonical).
    return selectedProject ? { project: selectedProject } : {};
  }

  const pendingIssueRef = useRef<string | null>(null);

  async function loadIssues() {
    try {
      const data = await fetchIssues(issueQueryParams());
      const list = data.issues ?? [];
      setIssues(list);
      // Honor a pending jump (e.g. from an idea card) once issues are loaded.
      if (pendingIssueRef.current) {
        const hit = list.find((i: IssueSummary) => i.identifier === pendingIssueRef.current);
        if (hit) setSelectedIssueId(hit.id);
        pendingIssueRef.current = null;
      }
    } catch (e) {
      console.error('Failed to load issues', e);
    }
  }

  const loadIssuesRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    loadIssuesRef.current = loadIssues;
  });

  // SSE: debounce issue/comment events into a board + open-detail refresh.
  useEffect(() => {
    const es = new EventSource('/api/events');
    let timer: ReturnType<typeof setTimeout> | null = null;
    let openedOnce = false;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadIssuesRef.current();
        setIssueRefreshKey(k => k + 1);
      }, 300);
    };
    const eventNames = [
      'issue.created', 'issue.updated', 'issue.moved', 'issue.archived', 'issue.restored',
      'issue.deleted', 'issue.relation.updated', 'comment.created', 'comment.updated', 'comment.deleted',
      'run.started', 'run.finished', 'idea.promoted',
    ];
    eventNames.forEach(name => es.addEventListener(name, scheduleRefresh));
    es.onopen = () => {
      // Auto-reconnect: do a full refresh on every reconnect after the first open.
      if (openedOnce) scheduleRefresh();
      openedOnce = true;
    };
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, []);

  async function loadData() {
    const [projData, providerData, agentData] = await Promise.all([
      fetchProjects(),
      fetchProviders(),
      // Agents is an auxiliary list (new-session dropdown); a stale server without
      // /api/agents must not break the whole page load.
      fetchAgents().catch(() => ({ agents: [] })),
    ]);
    setProjects(projData.projects ?? []);
    setProviders(providerData.providers ?? []);
    setAgents(agentData.agents ?? []);
    // File-manager label for "open folder" actions (configurable in 系统配置).
    fetchSystemConfig()
      .then(cfg => {
        const custom = typeof cfg.settings?.fileManager === 'string' ? cfg.settings.fileManager.trim() : '';
        if (custom) setFileManagerLabel(custom);
        else setFileManagerLabel(cfg.platform === 'win32' ? '文件管理器' : 'Finder');
      })
      .catch(() => {});
    await loadSessions();
  }

  async function loadSessions() {
    setLoading(true);
    const params: Record<string, string> = { limit: '200' };
    if (selectedProject) params.project = selectedProject;
    if (selectedProviders.length === 1) params.provider = selectedProviders[0];
    const [data, taskData, issueData] = await Promise.all([fetchSessions(params), fetchTasks(), fetchIssues(issueQueryParams())]);
    const taskMap = new Map<string, { label?: string; tags?: string[] }>((taskData.tasks ?? []).map((t: any) => [t.sessionId, t]));
    setIssues(issueData.issues ?? []);

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
    setSelectedIssueId(null);
    setSelectedSession(session);
    setDetailLoading(true);
    const data = await fetchSessionMessages(session.sessionId, { limit: '200' });
    setMessages(data.messages ?? []);
    setDetailLoading(false);
  }

  function selectIssue(issue: IssueSummary) {
    setSelectedSession(null);
    setMessages([]);
    setSelectedIssueId(issue.id);
  }

  // Sync an updated issue back into the board list (from IssueDetail mutations).
  function handleIssueChanged(issue: Issue) {
    setIssues(prev => {
      const exists = prev.some(i => i.id === issue.id);
      return exists
        ? prev.map(i => (i.id === issue.id ? { ...i, ...issue } : i))
        : [...prev, { ...issue, commentCount: 0 }];
    });
  }

  async function handleDropIssue(status: IssueStatus) {
    const issue = dragIssueRef.current;
    dragIssueRef.current = null;
    setDraggingIssueId(null);
    setDropTarget(null);
    if (!issue || issue.status === status) return;
    try {
      const data = await moveIssue(issue.id, { status, version: issue.version });
      setIssues(prev => prev.map(i => (i.id === issue.id ? { ...i, ...data.issue } : i)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert('数据已被修改，正在刷新');
        await loadIssues();
      } else {
        alert(e instanceof Error ? e.message : '移动失败');
      }
    }
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

  async function handleArchive(encoded: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    await archiveProject(encoded);
    const projData = await fetchProjects();
    setProjects(projData.projects ?? []);
  }

  async function handleUnarchive(encoded: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    await unarchiveProject(encoded);
    const projData = await fetchProjects();
    setProjects(projData.projects ?? []);
  }

  async function handlePin(encoded: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    await pinProject(encoded);
    const projData = await fetchProjects();
    setProjects(projData.projects ?? []);
  }

  async function handleUnpin(encoded: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    await unpinProject(encoded);
    const projData = await fetchProjects();
    setProjects(projData.projects ?? []);
  }

  async function handleOpenFinder(encoded: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    await openProjectInFinder(encoded);
  }

  async function handleOpenTerminal(encoded: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    await openProjectInTerminal(encoded);
  }

  async function openProjectDetail(encoded: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    // Project identity == decoded path; select it and open the right panel.
    selectProject(encoded);
    setRightPanelOpen(true);
  }

  // Load project detail whenever the right panel targets a (new) project.
  useEffect(() => {
    if (!rightPanelOpen || !selectedProject) return;
    if (projectDetail && projectDetail.encoded === selectedProject) return;
    let cancelled = false;
    fetchProjectDetail(selectedProject)
      .then(data => { if (!cancelled) setProjectDetail(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [rightPanelOpen, selectedProject]);

  async function handleNewTask(agentId?: string) {
    if (!selectedProject) return;
    const result = await createNewSession(selectedProject, undefined, undefined, agentId);
    if (result.action === 'error') {
      alert(result.message ?? '启动失败');
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshCache();
      const providerParam = selectedProviders.length === 1 ? { provider: selectedProviders[0] } : undefined;
      const [sessData, projData] = await Promise.all([
        fetchSessions({
          ...(providerParam ? { provider: providerParam.provider } : {}),
          ...(selectedProject ? { project: selectedProject } : {}),
          limit: '200',
        }),
        fetchProjects(),
      ]);
      setSessions(sessData.sessions ?? []);
      setProjects(projData.projects ?? []);
      await loadIssues();
    } finally {
      setRefreshing(false);
    }
  }

  const handleProjectPanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = projectPanelWidth;

    const onMove = (ev: MouseEvent) => {
      setProjectPanelWidth(Math.max(280, Math.min(Math.round(window.innerWidth * 0.8), startWidth + (startX - ev.clientX))));
    };
    const onUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [projectPanelWidth]);

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

  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(400, startWidth + (ev.clientX - startX)));
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      setResizing(false);
      setSidebarWidth(w => { localStorage.setItem('sidebar-width', String(w)); return w; });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  function handleProjectContextMenu(p: ProjectInfo, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ encoded: p.encoded, decoded: p.decoded, pinned: !!p.pinned, archived: !!p.archived, x: e.clientX, y: e.clientY });
  }

  // Sessions bound to any issue are rendered as badges on the issue card, not as standalone cards.
  const boundSessionIds = useMemo(() => new Set(issues.flatMap(i => i.sessionIds)), [issues]);
  const sessionIssueMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of issues) for (const sid of i.sessionIds) m.set(sid, i.identifier);
    return m;
  }, [issues]);
  const issueById = useMemo(() => new Map(issues.map(i => [i.id, i])), [issues]);

  // A session's board column: its bound task's status; unbound sessions fall
  // back to their own (legacy task-store) status mapping — i.e. the virtual task.
  const sessionColumn = useCallback((s: SessionItem): IssueStatus => {
    const bound = issues.find(i => i.sessionIds.includes(s.sessionId));
    if (bound) return bound.status;
    return sessionStatusToColumn(s.status ?? 'backlog');
  }, [issues]);

  const filteredIssues = useMemo(() => {
    let list = issues;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(i =>
        i.title.toLowerCase().includes(q)
        || i.identifier.toLowerCase().includes(q)
        || (i.description ?? '').toLowerCase().includes(q)
      );
    }
    // 工具筛选：任务按绑定会话的 provider 归属；无绑定会话的任务始终显示
    if (selectedProviders.length > 0) {
      const sessionProvider = new Map(sessions.map(s => [s.sessionId, s.provider]));
      list = list.filter(i =>
        i.sessionIds.length === 0
        || i.sessionIds.some(sid => {
          const p = sessionProvider.get(sid);
          return p && selectedProviders.includes(p);
        })
      );
    }
    if (sortMode === 'time-asc') list = [...list].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    else if (sortMode === 'messages') list = [...list].sort((a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0));
    else list = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [issues, searchQuery, selectedProviders, sessions, sortMode]);

  // Providers available in the current scope: the selected project's providers,
  // or all installed providers when no project is selected.
  const scopeProviders = useMemo(() => {
    if (!selectedProject) return providers;
    const proj = projects.find(p => p.decoded === selectedProject);
    if (!proj) return providers;
    return providers.filter(p => proj.providers.includes(p.id));
  }, [providers, projects, selectedProject]);

  // New-session dropdown: profiles whose provider exists in the current scope
  // (project providers when a project is selected, otherwise installed providers).
  const sessionAgents = useMemo(
    () => agents.filter(a => scopeProviders.some(p => p.id === a.provider)),
    [agents, scopeProviders],
  );

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
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <div className="sidebar-header">
          <h1 className="app-title">super-cli</h1>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${appMode === 'ideas' ? 'active' : ''}`} onClick={() => setAppMode('ideas')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>想法</span>
          </button>
          <button className={`nav-item ${appMode === 'task' ? 'active' : ''}`} onClick={() => setAppMode('task')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
            <span>任务</span>
          </button>
          <div className="nav-item nav-group" onClick={() => { setAppMode('inspiration'); setCollapsedNav(s => { const n = new Set(s); n.delete('inspiration'); return n; }); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>
            <span className={appMode === 'inspiration' ? 'nav-group-active-text' : ''}>灵感</span>
            <button
              className="nav-group-chevron"
              title={(collapsedNav.has('inspiration') && appMode !== 'inspiration') ? '展开' : '收起'}
              onClick={e => {
                e.stopPropagation();
                setCollapsedNav(s => {
                  const n = new Set(s);
                  if (n.has('inspiration') && appMode !== 'inspiration') n.delete('inspiration'); else n.add('inspiration');
                  return n;
                });
              }}
            >
              <svg className={(collapsedNav.has('inspiration') && appMode !== 'inspiration') ? 'collapsed' : ''} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          {!(collapsedNav.has('inspiration') && appMode !== 'inspiration') && (
          <button className={`nav-item nav-subitem ${appMode === 'inspiration' ? 'active' : ''}`} onClick={() => setAppMode('inspiration')}>
            <span>个人微信看板</span>
          </button>
          )}
          <div className="nav-item nav-group" onClick={() => { setAppMode('config'); setCollapsedNav(s => { const n = new Set(s); n.delete('config'); return n; }); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span className={appMode === 'config' || appMode === 'system' ? 'nav-group-active-text' : ''}>管理库</span>
            <button
              className="nav-group-chevron"
              title={(collapsedNav.has('config') && appMode !== 'config' && appMode !== 'system') ? '展开' : '收起'}
              onClick={e => {
                e.stopPropagation();
                setCollapsedNav(s => {
                  const n = new Set(s);
                  if (n.has('config') && appMode !== 'config' && appMode !== 'system') n.delete('config'); else n.add('config');
                  return n;
                });
              }}
            >
              <svg className={(collapsedNav.has('config') && appMode !== 'config' && appMode !== 'system') ? 'collapsed' : ''} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          {!(collapsedNav.has('config') && appMode !== 'config' && appMode !== 'system') && (
          <>
          <button className={`nav-item nav-subitem ${appMode === 'config' ? 'active' : ''}`} onClick={() => setAppMode('config')}>
            <span>技能·权限·连接器</span>
          </button>
          <button className={`nav-item nav-subitem ${appMode === 'system' ? 'active' : ''}`} onClick={() => setAppMode('system')}>
            <span>系统配置</span>
          </button>
          </>
          )}
        </nav>


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
              onClick={() => selectProject(null)}
            >
              <span className="project-name">全部项目</span>
              <span className="project-count">{sessions.length}</span>
            </div>
            <div className="project-search-box">
              <input
                className="project-search-input"
                placeholder="搜索项目…"
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
              />
              {projectSearch && (
                <button className="project-search-clear" onClick={() => setProjectSearch('')} title="清除">✕</button>
              )}
            </div>
            {projectSearch.trim() ? (
              <>
                {getSortedProjects().filter(p => fuzzyMatch(projectSearch.trim(), p.decoded)).length === 0 && (
                  <div className="issue-empty-hint project-search-empty">无匹配项目</div>
                )}
                {getSortedProjects().filter(p => fuzzyMatch(projectSearch.trim(), p.decoded)).map(p => (
                  <div
                    key={p.encoded}
                    className={`project-item ${p.archived ? 'archived' : ''} ${selectedProject === p.decoded ? 'active' : ''}`}
                    onClick={() => selectProject(p.decoded)}
                    onContextMenu={(e) => handleProjectContextMenu(p, e)}
                    title={p.decoded}
                  >
                    <span className="project-name">{p.decoded.split('/').slice(-2).join('/')}</span>
                    {!!p.archived && <span className="project-archived-badge">归档</span>}
                    <span className="project-count">{p.sessionCount}</span>
                    <button className="project-more-btn" onClick={(e) => { e.stopPropagation(); handleProjectContextMenu(p, e); }} title="更多操作">···</button>
                  </div>
                ))}
              </>
            ) : (
            <>
            {getSortedProjects().filter(p => p.pinned && !p.archived).length > 0 && (
              <>
                <div className="section-divider">
                  <span>置顶</span>
                </div>
                {getSortedProjects().filter(p => p.pinned && !p.archived).map(p => (
                  <div
                    key={p.encoded}
                    className={`project-item ${selectedProject === p.decoded ? 'active' : ''}`}
                    onClick={() => selectProject(p.decoded)}
                    onContextMenu={(e) => handleProjectContextMenu(p, e)}
                  >
                    <span className="project-name">{p.decoded.split('/').slice(-2).join('/')}</span>
                    <span className="project-count">{p.sessionCount}</span>
                    <button className="project-more-btn" onClick={(e) => { e.stopPropagation(); handleProjectContextMenu(p, e); }} title="更多操作">···</button>
                  </div>
                ))}
              </>
            )}
            {(() => {
              const allProjects = getSortedProjects().filter(p => !p.pinned && !p.archived);
              if (allProjects.length === 0) return null;
              const visible = allProjects.slice(0, allLimit);
              const hiddenCount = allProjects.length - visible.length;
              return (
                <>
                  {getSortedProjects().filter(p => p.pinned && !p.archived).length > 0 && (
                    <div className="section-divider">
                      <span>全部</span>
                    </div>
                  )}
                  {visible.map(p => (
                    <div
                      key={p.encoded}
                      className={`project-item ${selectedProject === p.decoded ? 'active' : ''}`}
                      onClick={() => selectProject(p.decoded)}
                      onContextMenu={(e) => handleProjectContextMenu(p, e)}
                    >
                      <span className="project-name">{p.decoded.split('/').slice(-2).join('/')}</span>
                      <span className="project-count">{p.sessionCount}</span>
                      <button className="project-more-btn" onClick={(e) => { e.stopPropagation(); handleProjectContextMenu(p, e); }} title="更多操作">···</button>
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <button className="project-expand-btn" onClick={() => setAllLimit(l => l + 10)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      展开更多（还有 {hiddenCount} 个）
                    </button>
                  )}
                </>
              );
            })()}
            {(() => {
              const archivedProjects = getSortedProjects().filter(p => p.archived);
              if (archivedProjects.length === 0) return null;
              const visible = archivedProjects.slice(0, archivedLimit);
              const hiddenCount = archivedProjects.length - visible.length;
              return (
                <>
                  <div className="archive-header" onClick={() => setArchivedCollapsed(!archivedCollapsed)}>
                    <span className={`archive-toggle ${archivedCollapsed ? '' : 'open'}`}>▶</span>
                    <span>归档</span>
                    <span className="project-count">{archivedProjects.length}</span>
                  </div>
                  {!archivedCollapsed && visible.map(p => (
                    <div
                      key={p.encoded}
                      className={`project-item archived ${selectedProject === p.decoded ? 'active' : ''}`}
                      onClick={() => selectProject(p.decoded)}
                      onContextMenu={(e) => handleProjectContextMenu(p, e)}
                    >
                      <span className="project-name">{p.decoded.split('/').slice(-2).join('/')}</span>
                      <span className="project-count">{p.sessionCount}</span>
                      <button className="project-more-btn" onClick={(e) => { e.stopPropagation(); handleProjectContextMenu(p, e); }} title="更多操作">···</button>
                    </div>
                  ))}
                  {!archivedCollapsed && hiddenCount > 0 && (
                    <button className="project-expand-btn" onClick={() => setArchivedLimit(l => l + 10)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                      展开更多（还有 {hiddenCount} 个）
                    </button>
                  )}
                </>
              );
            })()}
            </>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="theme-switcher">
            <button className={`theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')} title="亮色">☀️</button>
            <button className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')} title="暗色">🌙</button>
            <button className={`theme-btn ${theme === 'deep' ? 'active' : ''}`} onClick={() => setTheme('deep')} title="深色">🌑</button>
          </div>
        </div>
      </aside>
      <div className="sidebar-resize-handle" onMouseDown={handleSidebarResizeStart} />
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      {appMode === 'config' ? (
        <ConfigView
          selectedProject={selectedProject ? projects.find(p => p.decoded === selectedProject)?.decoded : undefined}
          selectedProjectProviders={selectedProject ? projects.find(p => p.decoded === selectedProject)?.providers : undefined}
          providers={providers}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
        />
      ) : appMode === 'system' ? (
        <SystemConfigView onToggleSidebar={() => setSidebarOpen(o => !o)} />
      ) : appMode === 'inspiration' ? (
        <WeChatView onToggleSidebar={() => setSidebarOpen(o => !o)} />
      ) : appMode === 'ideas' ? (
        <main className="main-content">
          <header className="toolbar">
            <div className="toolbar-left">
              <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} title="菜单">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              </button>
              <h2 className="page-title">想法</h2>
            </div>
          </header>
          <IdeasView projectPaths={projects.map(p => p.decoded)} onPromoted={() => { void loadIssues(); }} onOpenIssue={(identifier, project) => {
            pendingIssueRef.current = identifier;
            setAppMode('task');
            setTaskTab('issues');
            if (project && project !== selectedProject) setSelectedProject(project);
            // Same project: issues won't reload, select immediately.
            const hit = issues.find(i => i.identifier === identifier);
            if (hit && (!project || project === selectedProject)) { pendingIssueRef.current = null; setSelectedIssueId(hit.id); }
          }} />
        </main>
      ) : (
      <>
      {/* 主内容区 */}
      <main className="main-content">
        <header className="toolbar">
          <div className="toolbar-left">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} title="菜单">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <div className="task-tabs">
              <button className={`task-tab ${taskTab === 'issues' ? 'active' : ''}`} onClick={() => setTaskTab('issues')}>
                任务 <span className="task-count">{issues.filter(i => !i.archivedAt).length}</span>
              </button>
              <button className={`task-tab ${taskTab === 'sessions' ? 'active' : ''}`} onClick={() => setTaskTab('sessions')}>
                会话 <span className="task-count">{filteredSessions.length}</span>
              </button>
            </div>
            {taskTab === 'sessions' && selectedProject && (
              <div className="new-task-split">
                <button className="new-task-btn" onClick={() => handleNewTask(sessionAgents.find(a => a.builtin && a.provider === 'claude-code')?.id ?? sessionAgents[0]?.id)} title={sessionAgents[0] ? `新建会话（${sessionAgents.find(a => a.builtin && a.provider === 'claude-code')?.name ?? sessionAgents[0].name}）` : '新建会话'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  新建会话
                </button>
                <button className="new-task-arrow" onClick={() => setNewTaskDropdownOpen(o => !o)} title="选择 Agent">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {newTaskDropdownOpen && (
                  <>
                    <div className="new-task-backdrop" onClick={() => setNewTaskDropdownOpen(false)} />
                    <div className="new-task-menu">
                      {sessionAgents.map(a => (
                        <div key={a.id} className="new-task-menu-item" onClick={() => { handleNewTask(a.id); setNewTaskDropdownOpen(false); }}>
                          <span className="provider-dot" style={{ background: PROVIDER_COLORS[a.provider] }} />
                          {a.name}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {taskTab === 'issues' && (
              <button className="new-issue-btn" onClick={() => { setNewIssueInitialStatus(undefined); setShowNewIssue(true); }} title="新建任务">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                新建任务
              </button>
            )}
          </div>
          <div className="toolbar-right">
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
                      <label className="provider-dropdown-item" onClick={() => { setSelectedProviders([]); setProviderDropdownOpen(false); }}>
                        <span className={`provider-check ${selectedProviders.length === 0 ? 'checked' : ''}`}>
                          {selectedProviders.length === 0 && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        </span>
                        <span>全部工具</span>
                      </label>
                      {scopeProviders.map(p => {
                        const checked = selectedProviders.includes(p.id);
                        return (
                          <label key={p.id} className="provider-dropdown-item" onClick={() => {
                            const next = checked
                              ? selectedProviders.filter(x => x !== p.id)
                              : [...selectedProviders, p.id];
                            setSelectedProviders(next);
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
            <button className={`refresh-btn ${refreshing ? 'spinning' : ''}`} onClick={handleRefresh} disabled={refreshing} title="刷新数据">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
            <div className="search-box">
              <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/></svg>
              <input type="text" placeholder={taskTab === 'issues' ? '搜索任务...' : '搜索会话...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
<>
              <select className="sort-select" value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}>
                <option value="time-desc">最近更新</option>
                <option value="time-asc">最早更新</option>
                <option value="messages">{taskTab === 'issues' ? '评论最多' : '消息最多'}</option>
              </select>
              {(sortMode === 'time-desc' || sortMode === 'time-asc') && (
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
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 002 2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                </button>
                <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="列表视图">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/></svg>
                </button>
              </div>
            </>
            <button
              className={`view-btn ${rightPanelOpen ? 'active' : ''}`}
              onClick={() => setRightPanelOpen(o => !o)}
              title={rightPanelOpen ? '关闭右侧栏' : '打开右侧栏'}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M2 4a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm11 0v12h3a1 1 0 001-1V5a1 1 0 00-1-1h-3z" clipRule="evenodd"/></svg>
            </button>
          </div>
        </header>

        {loading ? (
          <div className="loading">加载中...</div>
        ) : taskTab === 'issues' ? (
          viewMode === 'board' ? (
          <div className="board">
            {ISSUE_COLUMNS.map(col => {
              const colIssues = filteredIssues
                .filter(i => i.status === col.key)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <div
                  key={col.key}
                  className={`board-column ${dropTarget === col.key ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    if (!dragIssueRef.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dropTarget !== col.key) setDropTarget(col.key);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropIssue(col.key);
                  }}
                >
                  <BoardColumnHeader
                    status={col.key}
                    label={col.label}
                    color={col.color}
                    count={colIssues.length}
                    onAdd={() => { setNewIssueInitialStatus(col.key); setShowNewIssue(true); }}
                  />
                  <div className="column-cards">
                    {colIssues.map(issue => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        sessions={sessions}
                        isSelected={selectedIssueId === issue.id}
                        isDragging={draggingIssueId === issue.id}
                        onClick={() => selectIssue(issue)}
                        onDragStart={() => { dragIssueRef.current = issue; setDraggingIssueId(issue.id); }}
                        onDragEnd={() => { dragIssueRef.current = null; setDraggingIssueId(null); setDropTarget(null); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          ) : viewMode === 'card' ? (
            <div className="card-grid">
              {(groupByDate && (sortMode === 'time-desc' || sortMode === 'time-asc')
                ? groupIssuesByDate(filteredIssues)
                : [{ label: '', issues: filteredIssues }]
              ).map(group => (
                <div key={group.label || 'all'} className="card-grid-group">
                  {group.label && <div className="date-group-label">{group.label}（{group.issues.length}）</div>}
                  <div className="card-grid">
                    {group.issues.map(issue => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        sessions={sessions}
                        isSelected={selectedIssueId === issue.id}
                        isDragging={false}
                        onClick={() => selectIssue(issue)}
                        onDragStart={() => {}}
                        onDragEnd={() => {}}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="list-view">
              {filteredIssues.map(issue => (
                <IssueListItem
                  key={issue.id}
                  issue={issue}
                  isSelected={selectedIssueId === issue.id}
                  onClick={() => selectIssue(issue)}
                />
              ))}
            </div>
          )
        ) : viewMode === 'board' ? (
          <div className="board">
            {ISSUE_COLUMNS.map(col => {
              const colSessions = filteredSessions.filter(s => sessionColumn(s) === col.key);
              const dateGroupActive = groupByDate && (sortMode === 'time-desc' || sortMode === 'time-asc');
              const dateGroups = dateGroupActive ? groupSessionsByDate(colSessions) : null;
              return (
                <div key={col.key} className="board-column">
                  <div className="board-column-header-simple" style={{ borderTopColor: col.color }}>
                    <span>{col.label}</span>
                    <span className="task-count">{colSessions.length}</span>
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
                            boundLabel={sessionIssueMap.get(s.sessionId)}
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
                        boundLabel={sessionIssueMap.get(s.sessionId)}
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
                boundLabel={sessionIssueMap.get(s.sessionId)}
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

      {/* 右侧详情面板（session 与 issue 互斥，共用可拖拽宽度） */}
      {(selectedSession || selectedIssueId) && (
        <div
          className="resize-handle detail-resize-handle"
          style={{ right: detailWidth }}
          onMouseDown={handleResizeStart}
        ></div>
      )}
      {selectedSession && (
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

            {/* 归属任务块：已绑定显示真实任务（可跳转）；未绑定按规则虚拟（会话标题即任务名，不落库） */}
            {(() => {
              const boundIssue = issues.find(i => i.sessionIds.includes(selectedSession.sessionId));
              if (boundIssue) {
                const col = ISSUE_COLUMNS.find(c => c.key === boundIssue.status);
                return (
                  <div className="session-task-block">
                    <div className="session-task-label">归属任务</div>
                    <div className="session-task-row">
                      <span className="issue-list-id">{boundIssue.identifier}</span>
                      <span className="session-task-title">{boundIssue.title}</span>
                      <span className="issue-list-status" style={{ color: col?.color }}>{col?.label}</span>
                      <button
                        className="btn-sm"
                        onClick={() => { setSelectedIssueId(boundIssue.id); setSelectedSession(null); setTaskTab('issues'); }}
                      >查看任务</button>
                    </div>
                  </div>
                );
              }
              return (
                <div className="session-task-block virtual">
                  <div className="session-task-label">归属任务</div>
                  <div className="session-task-row">
                    <span className="session-task-title">
                      {selectedSession.label || selectedSession.firstUserMessage?.slice(0, 60) || selectedSession.sessionId.slice(0, 8)}
                    </span>
                    <span className="session-task-virtual-chip">未绑定 · 虚拟任务</span>
                  </div>
                </div>
              );
            })()}

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
      )}

      {selectedIssueId && !selectedSession && (
        <aside className="detail-panel" style={{ width: detailWidth }}>
          <IssueDetail
            issueId={selectedIssueId}
            issues={issues}
            sessions={sessions}
            providers={providers}
            refreshKey={issueRefreshKey}
            onClose={() => setSelectedIssueId(null)}
            onSelectSession={selectSession}
            onChanged={handleIssueChanged}
          />
        </aside>
      )}

      {/* 最右侧：项目面板（详情 + 文件目录），跟随当前选中项目 */}
      {rightPanelOpen && appMode === 'task' && (
        <div
          className="resize-handle project-panel-resize-handle"
          style={{ right: projectPanelWidth }}
          onMouseDown={handleProjectPanelResizeStart}
        ></div>
      )}
      {rightPanelOpen && appMode === 'task' && (
        <aside className="project-panel" style={{ width: projectPanelWidth }}>
          <div className="detail-header">
            <div className="detail-title-area">
              <h3 className="detail-title">
                {selectedProject ? selectedProject.split('/').slice(-2).join('/') : '项目详情'}
              </h3>
            </div>
            <div className="detail-actions">
              <button className="close-btn" onClick={() => setRightPanelOpen(false)}>✕</button>
            </div>
          </div>
          {!selectedProject ? (
            <div className="loading-small">在左侧选择一个项目查看详情</div>
          ) : !projectDetail || projectDetail.encoded !== selectedProject ? (
            <div className="loading-small">加载中...</div>
          ) : (
            <>
              <div className="project-panel-tabs">
                <button className={`project-panel-tab ${overlayTab === 'detail' ? 'active' : ''}`} onClick={() => setOverlayTab('detail')}>详情</button>
                <button className={`project-panel-tab ${overlayTab === 'files' ? 'active' : ''}`} onClick={() => setOverlayTab('files')}>文件</button>
              </div>
              {overlayTab === 'detail' ? (
                <div className="overlay-body project-panel-body">
                  <MetaItem label="路径" value={projectDetail.diskPath} />
                  <MetaItem label="状态" value={projectDetail.pathExists ? '路径存在' : '路径不存在'} />
                  {projectDetail.gitRemoteUrl && <MetaItem label="Git Remote" value={projectDetail.gitRemoteUrl} />}
                  {projectDetail.gitBranch && <MetaItem label="当前分支" value={projectDetail.gitBranch} />}
                  {projectDetail.gitStatus !== undefined && (
                    <div className="meta-row">
                      <span className="meta-label">Git 状态</span>
                      <span className="meta-value meta-pre">{projectDetail.gitStatus || '(clean)'}</span>
                    </div>
                  )}
                  {projectDetail.nodeVersion && <MetaItem label="Node" value={projectDetail.nodeVersion} />}
                  {projectDetail.packageManager && <MetaItem label="包管理器" value={projectDetail.packageManager} />}
                  <MetaItem label="会话数" value={String(projectDetail.sessionCount)} />
                  {projectDetail.lastTimestamp && <MetaItem label="最近活跃" value={new Date(projectDetail.lastTimestamp).toLocaleString('zh-CN')} />}

                  <div className="overlay-actions">
                    <button className="overlay-action-btn" onClick={() => handleOpenFinder(projectDetail.encoded)}>
                      <IconFolder /> 在{fileManagerLabel}中打开
                    </button>
                    <button className="overlay-action-btn" onClick={() => handleOpenTerminal(projectDetail.encoded)}>
                      <IconTerminal /> 打开终端
                    </button>
                    {projects.find(p => p.encoded === projectDetail.encoded)?.pinned ? (
                      <button className="overlay-action-btn" onClick={() => handleUnpin(projectDetail.encoded)}>
                        <IconPinOff /> 取消置顶
                      </button>
                    ) : (
                      <button className="overlay-action-btn" onClick={() => handlePin(projectDetail.encoded)}>
                        <IconPin /> 置顶
                      </button>
                    )}
                    {projects.find(p => p.encoded === projectDetail.encoded)?.archived ? (
                      <button className="overlay-action-btn" onClick={() => handleUnarchive(projectDetail.encoded)}>
                        <IconArchiveRestore /> 取消归档
                      </button>
                    ) : (
                      <button className="overlay-action-btn" onClick={() => handleArchive(projectDetail.encoded)}>
                        <IconArchive /> 归档
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="project-panel-files">
                  <FileBrowser encoded={projectDetail.encoded} />
                </div>
              )}
            </>
          )}
        </aside>
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
      </>
      )}

      {/* New Issue Modal */}
      {showNewIssue && (
        <NewIssueModal
          projectEncoded={selectedProject ?? undefined}
          projectPaths={projects.map(p => p.decoded)}
          initialStatus={newIssueInitialStatus}
          onClose={() => setShowNewIssue(false)}
          onCreated={(issue) => {
            setShowNewIssue(false);
            setIssues(prev => [...prev, { ...issue, commentCount: 0 }]);
          }}
        />
      )}

      {/* Project Detail Overlay */}
      {contextMenu && (
        <>
          <div className="context-menu-backdrop" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button className="context-menu-item" onClick={() => { handleOpenFinder(contextMenu.encoded); setContextMenu(null); }}>
              <IconFolder /> 在{fileManagerLabel}中打开
            </button>
            <button className="context-menu-item" onClick={() => { handleOpenTerminal(contextMenu.encoded); setContextMenu(null); }}>
              <IconTerminal /> 在终端中打开
            </button>
            <button className="context-menu-item" onClick={() => { openProjectDetail(contextMenu.encoded); setContextMenu(null); }}>
              <IconInfo /> 查看详情
            </button>
            <div className="context-menu-divider" />
            {contextMenu.pinned ? (
              <button className="context-menu-item" onClick={() => { handleUnpin(contextMenu.encoded); setContextMenu(null); }}>
                <IconPinOff /> 取消置顶
              </button>
            ) : (
              <button className="context-menu-item" onClick={() => { handlePin(contextMenu.encoded); setContextMenu(null); }}>
                <IconPin /> 置顶
              </button>
            )}
            {contextMenu.archived ? (
              <button className="context-menu-item" onClick={() => { handleUnarchive(contextMenu.encoded); setContextMenu(null); }}>
                <IconArchiveRestore /> 取消归档
              </button>
            ) : (
              <button className="context-menu-item" onClick={() => { handleArchive(contextMenu.encoded); setContextMenu(null); }}>
                <IconArchive /> 归档
              </button>
            )}
          </div>
        </>
      )}
      <IdeaQuickCapture />
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

function SessionCard({ session, isSelected, onClick, onHover, onLeave, boundLabel }: {
  session: SessionItem; isSelected: boolean; onClick: () => void;
  onHover: (e: React.MouseEvent) => void; onLeave: () => void;
  boundLabel?: string;
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
        {boundLabel && <span className="card-bound-issue" title="已绑定任务">{boundLabel}</span>}
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

function groupIssuesByDate(issues: IssueSummary[]): { label: string; issues: IssueSummary[] }[] {
  const groups = new Map<string, IssueSummary[]>();
  for (const i of issues) {
    const label = i.updatedAt ? getDateGroup(new Date(i.updatedAt)) : '更早';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(i);
  }
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const today = new Date().getDay();
  const recentDays: string[] = [];
  for (let i = 2; i < 7; i++) {
    recentDays.push(weekdays[(today - i + 7) % 7]);
  }
  const order = ['今天', '昨天', ...recentDays, '更早'];
  return order.filter(l => groups.has(l)).map(l => ({ label: l, issues: groups.get(l)! }));
}

/** Task row for the issues list view. */
function IssueListItem({ issue, isSelected, onClick }: {
  issue: IssueSummary; isSelected: boolean; onClick: () => void;
}) {
  const col = ISSUE_COLUMNS.find(c => c.key === issue.status);
  return (
    <div className={`session-list-item issue-list-item ${isSelected ? 'selected' : ''}`} onClick={onClick}>
      <div className="list-item-main">
        <span className="issue-list-id">{issue.identifier}</span>
        <span className="list-item-title">{issue.title}</span>
        <span className="issue-list-status" style={{ color: col?.color }}>{col?.label}</span>
      </div>
      <div className="list-item-meta">
        {issue.priority && issue.priority !== 'none' && <span>{issue.priority}</span>}
        <span>💬 {issue.commentCount ?? 0}</span>
        <span>会话 {issue.sessionIds.length}</span>
        <span>{getTimeAgo(new Date(issue.updatedAt))}</span>
      </div>
    </div>
  );
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

function IconFolder() {
  return <svg {...iconProps}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>;
}

function IconTerminal() {
  return <svg {...iconProps}><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>;
}

interface DirEntry {
  name: string;
  type: 'dir' | 'file';
  size?: number;
  extension?: string;
}

interface FileContentData {
  path: string;
  content: string | null;
  binary: boolean;
  truncated: boolean;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'jsx', jsx: 'jsx', mjs: 'jsx',
  json: 'json', css: 'css', scss: 'css', less: 'css',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  py: 'python', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  md: 'markdown', mdx: 'markdown',
  sql: 'sql', rs: 'rust', go: 'go', java: 'java',
  dockerfile: 'docker',
  html: 'markup', xml: 'markup', svg: 'markup',
  graphql: 'typescript', gql: 'typescript',
};

function getLang(filePath: string): string | undefined {
  const name = filePath.split('/').pop()!.toLowerCase();
  if (name === 'dockerfile') return 'docker';
  if (name === 'makefile') return 'bash';
  if (name.endsWith('.d.ts')) return 'typescript';
  const ext = name.split('.').pop()!;
  return EXT_TO_LANG[ext];
}

function highlightCode(code: string, filePath: string): string {
  const lang = getLang(filePath);
  if (!lang) return escapeHtml(code);
  const grammar = Prism.languages[lang];
  if (!grammar) return escapeHtml(code);
  return Prism.highlight(code, grammar, lang);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

function FileBrowser({ encoded }: { encoded: string }) {
  const [treeCache, setTreeCache] = useState<Map<string, DirEntry[]>>(new Map());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContentData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProjectFiles(encoded, '').then((data: any) => {
      setTreeCache(new Map([['', data.entries ?? []]]));
    });
  }, [encoded]);

  async function toggleDir(dirPath: string) {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
    if (!treeCache.has(dirPath)) {
      const data = await fetchProjectFiles(encoded, dirPath);
      setTreeCache(prev => new Map(prev).set(dirPath, data.entries ?? []));
    }
  }

  async function selectFile(filePath: string) {
    setSelectedFile(filePath);
    setLoading(true);
    try {
      const data = await fetchProjectFileContent(encoded, filePath);
      setFileContent(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="file-browser">
      <div className="file-tree">
        <TreeNode
          path=""
          entries={treeCache.get('') ?? []}
          level={0}
          expandedDirs={expandedDirs}
          selectedFile={selectedFile}
          treeCache={treeCache}
          onToggleDir={toggleDir}
          onSelectFile={selectFile}
          encoded={encoded}
        />
      </div>
      <div className="file-preview">
        {loading ? (
          <div className="file-preview-empty">加载中...</div>
        ) : !selectedFile ? (
          <div className="file-preview-empty">选择文件查看内容</div>
        ) : fileContent?.binary ? (
          <div className="file-preview-binary">
            <IconFileBinary />
            <span>二进制文件</span>
            <span className="file-preview-size">{formatSize(fileContent.size)}</span>
          </div>
        ) : fileContent ? (
          <>
            <div className="file-preview-header">
              <span className="file-preview-path">{fileContent.path}</span>
              <span className="file-preview-size">{formatSize(fileContent.size)}</span>
            </div>
            {fileContent.truncated && (
              <div className="file-truncation-banner">文件过大，仅显示前 100KB（共 {formatSize(fileContent.size)}）</div>
            )}
            {getLang(fileContent.path) === 'markdown' ? (
              <div className="file-md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent.content ?? '') }} />
            ) : (
              <pre className="file-content-pre"><code dangerouslySetInnerHTML={{ __html: highlightCode(fileContent.content ?? '', fileContent.path) }} /></pre>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function TreeNode({ path, entries, level, expandedDirs, selectedFile, treeCache, onToggleDir, onSelectFile, encoded }: {
  path: string;
  entries: DirEntry[];
  level: number;
  expandedDirs: Set<string>;
  selectedFile: string | null;
  treeCache: Map<string, DirEntry[]>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  encoded: string;
}) {
  return (
    <div>
      {entries.map(entry => {
        const fullPath = path ? `${path}/${entry.name}` : entry.name;
        const isExpanded = expandedDirs.has(fullPath);
        const isSelected = selectedFile === fullPath;
        const children = treeCache.get(fullPath);
        return (
          <div key={fullPath}>
            <div
              className={`file-tree-item ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: level * 16 + 8 }}
              onClick={() => entry.type === 'dir' ? onToggleDir(fullPath) : onSelectFile(fullPath)}
            >
              {entry.type === 'dir' ? (
                <>
                  <span className={`tree-chevron ${isExpanded ? 'expanded' : ''}`}>▶</span>
                  <IconFolder />
                </>
              ) : (
                <IconFile />
              )}
              <span className="tree-name">{entry.name}</span>
              {entry.type !== 'dir' && (
                <a
                  className="tree-open-external"
                  href={`/api/projects/${encodeURIComponent(encoded)}/files/raw/${fullPath.split('/').map(encodeURIComponent).join('/')}`}
                  target="_blank"
                  rel="noreferrer"
                  title="在新页面打开"
                  onClick={e => e.stopPropagation()}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
            </div>
            {entry.type === 'dir' && isExpanded && children && (
              <TreeNode
                path={fullPath}
                entries={children}
                level={level + 1}
                expandedDirs={expandedDirs}
                selectedFile={selectedFile}
                treeCache={treeCache}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                encoded={encoded}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function IconFile() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}

function IconFileBinary() {
  return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>;
}
