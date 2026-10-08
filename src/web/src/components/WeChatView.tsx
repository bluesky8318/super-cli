import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchWechatDashboard,
  fetchWechatStatus,
  fetchWxServerStatus,
  fetchWxSummaries,
  fetchWxSummaryConfig,
  saveWxSummaryConfig,
  generateWxSummary,
  deleteWxSummary,
  clearWxSummaries,
  searchWechat,
  startWxServer,
  stopWxServer,
  type WechatDashboardData,
  type WechatStatusData,
  type WechatSearchResults,
  type WxServerStatusData,
  type WxSummaryConfigData,
  type WxSummaryEntry,
} from '../api/client.js';

function localToday(): string {
  return new Date().toLocaleDateString('sv-SE');
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('sv-SE');
}

function fmtTime(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function WeChatView({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const [date, setDate] = useState(localToday());
  const [status, setStatus] = useState<WechatStatusData | null>(null);
  const [server, setServer] = useState<WxServerStatusData | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [dashboard, setDashboard] = useState<WechatDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTalker, setSelectedTalker] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      // Server-lifecycle status is best-effort: a stale backend without
      // /api/wechat/server must not break the board.
      const [s, srv] = await Promise.all([
        fetchWechatStatus(),
        fetchWxServerStatus().catch(() => null),
      ]);
      setStatus(s);
      if (srv) setServer(srv);
      if (!s.reachable) {
        setDashboard(null);
        return;
      }
      setDashboard(await fetchWechatDashboard(d));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleStartServer() {
    setServerBusy(true);
    try {
      setServer(await startWxServer());
      await load(date);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setServerBusy(false);
    }
  }

  async function handleStopServer() {
    if (!window.confirm('确定停止 wx-cli server？看板数据将不可用。')) return;
    setServerBusy(true);
    try {
      setServer(await stopWxServer());
      await load(date);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setServerBusy(false);
    }
  }

  useEffect(() => { void load(date); }, [date, load]);

  // Open the daily report in a new tab via the progress page: it kicks off
  // background summary generation, shows progress, then redirects to the
  // report (near-instant when the summary is already cached). The raw .md URL
  // lets the docu.md Markdown Viewer extension render the report.
  function viewReport(talker: string, name?: string) {
    const params = new URLSearchParams({ talker, date });
    if (name) params.set('name', name);
    window.open(`/report-progress?${params}`, '_blank');
  }

  const cards = dashboard?.cards;
  const maxHourly = Math.max(1, ...(dashboard?.hourly ?? [1]));
  const selectedChat = dashboard?.activeChats.find(c => c.talker === selectedTalker);

  return (
    <main className="main-content">
      <header className="toolbar">
        <div className="toolbar-left">
          {onToggleSidebar && (
            <button className="hamburger-btn" onClick={onToggleSidebar} title="菜单">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
          )}
          <h2 className="page-title">个人微信看板</h2>
          {status?.account && (
            <span className="wx-account">{status.account.name}（{status.account.wxid}）</span>
          )}
          {server && (
            <span
              className={`wx-server-chip${server.running ? ' running' : ''}${server.installed ? '' : ' missing'}`}
              title={
                !server.installed
                  ? (server.error ?? 'PATH 中找不到 wx-cli')
                  : server.running
                    ? `wx-cli ${server.version ?? ''} · ${server.health ?? ''} · ${server.baseUrl ?? ''}`
                    : (server.error ?? `wx-cli server 未运行${server.baseUrl ? ` · ${server.baseUrl}` : ''}`)
              }
            >
              <span className="wx-server-dot" />
              {!server.installed
                ? 'wx-cli 未安装'
                : server.running
                  ? `服务运行中 · PID ${server.pid ?? '—'}`
                  : '服务已停止'}
            </span>
          )}
        </div>
        <div className="toolbar-right">
          {server?.installed && (
            server.running ? (
              <button className="wx-server-btn" onClick={() => void handleStopServer()} disabled={serverBusy} title="停止 wx-cli server">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
                {serverBusy ? '停止中…' : '停止'}
              </button>
            ) : (
              <button className="wx-server-btn start" onClick={() => void handleStartServer()} disabled={serverBusy} title="启动 wx-cli server">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>
                {serverBusy ? '启动中…' : '启动服务'}
              </button>
            )
          )}
          <WxSearch onSelectChat={talker => setSelectedTalker(talker)} onJumpDate={d => setDate(d)} />
          <button className="refresh-btn" onClick={() => setSettingsOpen(true)} title="日报摘要设置">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <div className="wx-date-nav">
            <button className="wx-date-btn" onClick={() => setDate(d => shiftDate(d, -1))} title="前一天">‹</button>
            <input
              className="wx-date-input"
              type="date"
              value={date}
              onChange={e => e.target.value && setDate(e.target.value)}
            />
            <button className="wx-date-btn" onClick={() => setDate(d => shiftDate(d, 1))} title="后一天">›</button>
            {date !== localToday() && (
              <button className="wx-date-btn wx-today-btn" onClick={() => setDate(localToday())}>今天</button>
            )}
          </div>
          <button className={`refresh-btn ${loading ? 'spinning' : ''}`} onClick={() => void load(date)} disabled={loading} title="刷新">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
        </div>
      </header>

      <div className="wx-body">
        {status && !status.reachable && (
          <div className="wx-offline">
            <div className="wx-offline-title">wx-cli server 不可达</div>
            <div className="wx-offline-desc">
              {server?.installed
                ? '本机 wx-cli HTTP 服务未运行。点击下方按钮一键启动，或在 管理库 → 系统配置 中修改 wx-cli 地址。'
                : <>个人微信看板依赖本机的 wx-cli HTTP 服务。请先运行 <code>wx-cli server run</code>，或在 管理库 → 系统配置 中修改 wx-cli 地址。</>}
            </div>
            {server?.installed && !server.running && (
              <button className="btn-primary wx-offline-start" onClick={() => void handleStartServer()} disabled={serverBusy}>
                {serverBusy ? '启动中…' : '启动 wx-cli server'}
              </button>
            )}
            {(status.error || server?.error) && <div className="wx-offline-error">{status.error ?? server?.error}</div>}
          </div>
        )}
        {error && <div className="wx-offline"><div className="wx-offline-title">加载失败</div><div className="wx-offline-error">{error}</div></div>}

        {dashboard && cards && (
          <>
            {/* 统计卡 */}
            <div className="wx-cards">
              <WxCard icon={<IconActivity />} tone="accent" label="活跃群" value={cards.groupChats} sub={`共 ${cards.totalGroups || '—'} 个群`} />
              <WxCard icon={<IconMessage />} tone="accent" label="总消息" value={cards.totalMessages} sub={`${cards.activeChats} 个活跃会话`} />
              <WxCard icon={<IconAt />} tone="warn" label="@ 我的" value={cards.mentions} sub={cards.mentions > 0 ? '可能需要回复' : '无待处理'} highlight={cards.mentions > 0} />
              <WxCard icon={<IconMoon />} tone="muted" label="静默群" value={cards.totalGroups ? cards.silentGroups : '—'} sub="当天无消息" />
              <WxCard icon={<IconLink />} tone="accent" label="分享链接" value={cards.links} />
              <WxCard icon={<IconSend />} tone="muted" label="我发出的" value={cards.myMessages} />
            </div>

            {/* 24 小时趋势 */}
            <div className="wx-section">
              <div className="wx-section-title"><IconChart /> 消息时段分布</div>
              <div className="wx-trend">
                {dashboard.hourly.map((count, h) => (
                  <div key={h} className="wx-trend-col" title={`${h}:00 · ${count} 条`}>
                    <div className="wx-trend-bar" style={{ height: `${Math.max(count > 0 ? 4 : 0, (count / maxHourly) * 100)}%` }} />
                    <div className="wx-trend-hour">{h % 3 === 0 ? h : ''}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="wx-grid">
              {/* 活跃会话 */}
              <div className="wx-section">
                <div className="wx-section-title"><IconChat /> 活跃会话（{dashboard.activeChats.length}）</div>
                <div className="wx-chat-list">
                  {dashboard.activeChats.slice(0, 30).map(chat => (
                    <div
                      key={chat.talker}
                      className={`wx-chat-item ${selectedTalker === chat.talker ? 'selected' : ''}`}
                      onClick={() => setSelectedTalker(t => t === chat.talker ? null : chat.talker)}
                    >
                      <div className="wx-chat-main">
                        <span className="wx-chat-name">
                          {chat.isGroup && <span className="wx-chat-badge">群</span>}
                          {chat.name}
                        </span>
                        <span className="wx-chat-meta">{chat.senders.length} 人 · {fmtTime(chat.lastTime)}</span>
                      </div>
                      <span className="wx-chat-count">{chat.messageCount}</span>
                    </div>
                  ))}
                </div>
                {selectedChat && (
                  <div className="wx-chat-actions">
                    <span className="wx-chat-selected-name">已选：{selectedChat.name}</span>
                    <button className="form-btn" onClick={() => viewReport(selectedChat.talker, selectedChat.name)}>
                      查看日报
                    </button>
                  </div>
                )}
              </div>

              <div className="wx-right-col">
                {/* @我 */}
                <div className="wx-section">
                  <div className="wx-section-title"><IconAt /> @我（{dashboard.mentions.length}）</div>
                  {dashboard.mentions.length === 0 ? (
                    <div className="wx-empty">今日暂无 @你的消息</div>
                  ) : (
                    <div className="wx-mention-list">
                      {dashboard.mentions.slice(0, 20).map((m, i) => (
                        <div key={i} className="wx-mention-item">
                          <div className="wx-mention-head">
                            <span className="wx-mention-sender">{m.sender}</span>
                            <span className="wx-mention-chat">{m.chatName}</span>
                            <span className="wx-mention-time">{fmtTime(m.time)}</span>
                          </div>
                          <div className="wx-mention-snippet">{m.snippet}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 链接情报 */}
                <div className="wx-section">
                  <div className="wx-section-title"><IconLink /> 链接情报（{dashboard.links.length}）</div>
                  {dashboard.links.length === 0 ? (
                    <div className="wx-empty">今日暂无链接分享</div>
                  ) : (
                    <div className="wx-link-list">
                      {dashboard.links.slice(0, 30).map((l, i) => (
                        <div key={i} className="wx-link-item">
                          <a className="wx-link-url" href={l.url} target="_blank" rel="noreferrer" title={l.url}>
                            <span className="wx-link-domain">{l.domain}</span>
                            {l.title || l.url}
                          </a>
                          <div className="wx-link-meta">
                            {l.chatName} · {l.sender} · {fmtTime(l.time)}
                            {l.count > 1 && ` · ×${l.count}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 高信号人物 */}
                <div className="wx-section">
                  <div className="wx-section-title"><IconPerson /> 活跃人物</div>
                  <div className="wx-people-list">
                    {dashboard.people.slice(0, 10).map((p, i) => (
                      <div key={i} className="wx-person-item">
                        <span className="wx-person-rank">{i + 1}</span>
                        <span className="wx-person-name">{p.sender}</span>
                        <span className="wx-person-meta">{p.messageCount} 条 · {p.chatCount} 群</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {settingsOpen && <WxSummarySettings onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function WxCard({ icon, tone, label, value, sub, highlight }: {
  icon: React.ReactNode;
  tone: 'accent' | 'warn' | 'muted';
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`wx-card wx-tone-${tone} ${highlight ? 'highlight' : ''}`}>
      <div className="wx-card-head">
        <span className="wx-card-icon">{icon}</span>
        <span className="wx-card-label">{label}</span>
      </div>
      <div className="wx-card-value">{value}</div>
      {sub && <div className="wx-card-sub">{sub}</div>}
    </div>
  );
}

function WxSearch({ onSelectChat, onJumpDate }: {
  onSelectChat: (talker: string) => void;
  onJumpDate: (date: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WechatSearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchWechat(q));
        setOpen(true);
      } catch { /* ignore */ } finally {
        setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [query]);

  const empty = results && !results.groups.length && !results.people.length && !results.messages.length;

  return (
    <div ref={boxRef} className="wx-search">
      <div className="wx-search-box">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/></svg>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          placeholder="搜索群、人、关键词"
        />
        {searching && <span className="wx-search-spinner" />}
      </div>
      {open && query.trim().length >= 2 && results && (
        <div className="wx-search-dropdown">
          {empty && <div className="wx-empty">没找到匹配结果</div>}
          {results.groups.length > 0 && (
            <div className="wx-search-group">
              <div className="wx-search-group-title">会话</div>
              {results.groups.map(g => (
                <div key={g.talker} className="wx-search-item" onClick={() => { onSelectChat(g.talker); setOpen(false); }}>
                  <span className="wx-search-badge">{g.isGroup ? '群' : '聊'}</span>
                  <span className="wx-search-item-main">
                    <span className="wx-search-item-title">{g.name}</span>
                    <span className="wx-search-item-sub">{g.summary}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {results.people.length > 0 && (
            <div className="wx-search-group">
              <div className="wx-search-group-title">联系人</div>
              {results.people.map(p => (
                <div key={p.userName} className="wx-search-item" onClick={() => setOpen(false)}>
                  <span className="wx-search-badge">人</span>
                  <span className="wx-search-item-main">
                    <span className="wx-search-item-title">{p.name}</span>
                    <span className="wx-search-item-sub">{p.userName}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {results.messages.length > 0 && (
            <div className="wx-search-group">
              <div className="wx-search-group-title">消息</div>
              {results.messages.map((m, i) => (
                <div key={m.serverId ?? i} className="wx-search-item" onClick={() => {
                  if (m.time) onJumpDate(new Date(m.time * 1000).toLocaleDateString('sv-SE'));
                  onSelectChat(m.talker);
                  setOpen(false);
                }}>
                  <span className="wx-search-badge">消息</span>
                  <span className="wx-search-item-main">
                    <span className="wx-search-item-title">{m.snippet}</span>
                    <span className="wx-search-item-sub">{m.chatName} · {m.sender}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ====== Icons (inline SVG, 14px) ====== */

/** Settings modal: summary prompt + runtime config, and summary cache management. */
function WxSummarySettings({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<WxSummaryConfigData | null>(null);
  const [prompt, setPrompt] = useState('');
  const [runtime, setRuntime] = useState('');
  const [model, setModel] = useState('');
  const [summaries, setSummaries] = useState<WxSummaryEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedTip, setSavedTip] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cfg, list] = await Promise.all([
        fetchWxSummaryConfig(),
        fetchWxSummaries().catch(() => ({ summaries: [] as WxSummaryEntry[] })),
      ]);
      setConfig(cfg);
      setPrompt(cfg.prompt);
      setRuntime(cfg.runtime);
      setModel(cfg.model ?? '');
      setSummaries(list.summaries);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const cfg = await saveWxSummaryConfig({ prompt, runtime, model });
      setConfig(cfg);
      setSavedTip('已保存');
      setTimeout(() => setSavedTip(''), 1500);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function regenerate(entry: WxSummaryEntry) {
    setBusyKey(entry.key);
    try {
      const res = await generateWxSummary({ talker: entry.talker, date: entry.date, name: entry.chatName, force: true });
      setSummaries(prev => prev.map(s => (s.key === entry.key ? res.entry : s)));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function removeEntry(key: string) {
    try {
      await deleteWxSummary(key);
      setSummaries(prev => prev.filter(s => s.key !== key));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function clearAll() {
    if (!window.confirm('确定清空全部摘要缓存？')) return;
    try {
      await clearWxSummaries();
      setSummaries([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  const STATUS_LABEL: Record<WxSummaryEntry['status'], string> = { pending: '生成中', done: '已生成', error: '失败' };

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-panel wx-settings-panel" onClick={e => e.stopPropagation()}>
        <div className="overlay-header">
          <h3>日报摘要设置</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {!config ? (
          <div className="wx-settings-body"><div className="wx-empty">加载中…</div></div>
        ) : (
          <div className="wx-settings-body">
            <div>
              <div className="wx-settings-section-title">摘要运行时</div>
              <select className="form-select" value={runtime} onChange={e => setRuntime(e.target.value)}>
                {config.runtimes.map(r => (
                  <option key={r.id} value={r.id} disabled={!r.installed}>
                    {r.name}（{r.command}）{r.installed ? '' : ' · 未安装'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="wx-settings-section-title">摘要模型（可选）</div>
              <input
                className="form-input"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="留空使用 CLI 全局默认模型"
              />
              <div className="wx-prompt-hint">填了会在调用时附加 --model 参数，如 glm-5.3、MiniMax-M3、k3</div>
            </div>

            <div>
              <div className="wx-settings-section-title">日报摘要 Prompt</div>
              <textarea
                className="form-input wx-prompt-input"
                rows={9}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
              <div className="wx-prompt-hint">可用占位符：{'{chatName}'}、{'{date}'}、{'{messageCount}'}、{'{messages}'}</div>
              <div className="wx-prompt-actions">
                <button className="form-btn" onClick={() => setPrompt(config.defaultPrompt)}>恢复默认</button>
                <button className="form-btn primary" onClick={() => void save()} disabled={saving}>
                  {saving ? '保存中…' : '保存'}
                </button>
                {savedTip && <span className="wx-saved-tip">{savedTip}</span>}
              </div>
            </div>

            <div>
              <div className="wx-settings-section-title wx-cache-head">
                <span>摘要缓存（{summaries.length}）</span>
                {summaries.length > 0 && (
                  <button className="form-btn wx-cache-clear" onClick={() => void clearAll()}>清空全部</button>
                )}
              </div>
              {summaries.length === 0 ? (
                <div className="wx-empty">暂无缓存，查看日报时会自动生成</div>
              ) : (
                <div className="wx-summary-list">
                  {summaries.map(s => (
                    <div key={s.key} className="wx-summary-row">
                      <div className="wx-summary-main">
                        <span className="wx-summary-name">
                          {s.chatName}
                          <span className="wx-summary-date">{s.date}</span>
                          <span className={`wx-summary-badge st-${s.status}`}>{STATUS_LABEL[s.status]}</span>
                        </span>
                        <span className="wx-summary-meta">
                          {s.runtime ?? '—'} · {s.messageCount ?? 0} 条消息 · {new Date(s.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {s.status === 'error' && s.error && <span className="wx-summary-err">{s.error}</span>}
                      </div>
                      <button
                        className="form-btn"
                        disabled={busyKey === s.key}
                        onClick={() => void regenerate(s)}
                        title="重新生成摘要"
                      >
                        {busyKey === s.key ? '生成中…' : '重新生成'}
                      </button>
                      <button className="form-btn" onClick={() => void removeEntry(s.key)} title="删除该缓存">删除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====== Icons (inline SVG, 14px) ====== */
const I = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function IconActivity() { return <svg {...I}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function IconMessage() { return <svg {...I}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function IconAt() { return <svg {...I}><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>; }
function IconMoon() { return <svg {...I}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }
function IconLink() { return <svg {...I}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>; }
function IconSend() { return <svg {...I}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>; }
function IconChart() { return <svg {...I}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function IconChat() { return <svg {...I}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconPerson() { return <svg {...I}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
