import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchWechatDashboard,
  fetchWechatReport,
  fetchWechatStatus,
  searchWechat,
  type WechatDashboardData,
  type WechatReportData,
  type WechatStatusData,
  type WechatSearchResults,
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
  const [dashboard, setDashboard] = useState<WechatDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<WechatReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedTalker, setSelectedTalker] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchWechatStatus();
      setStatus(s);
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

  useEffect(() => { void load(date); }, [date, load]);

  async function openReport(talker: string, name?: string) {
    setReportLoading(true);
    try {
      setReport(await fetchWechatReport(talker, date, name));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setReportLoading(false);
    }
  }

  function copyReport() {
    if (!report) return;
    navigator.clipboard.writeText(report.markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
        </div>
        <div className="toolbar-right">
          <WxSearch onSelectChat={talker => setSelectedTalker(talker)} onJumpDate={d => setDate(d)} />
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
              个人微信看板依赖本机的 wx-cli HTTP 服务。请先运行 <code>wx-cli server run</code>，
              或在 管理库 → 系统配置 中修改 wx-cli 地址。
            </div>
            {status.error && <div className="wx-offline-error">{status.error}</div>}
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
                    <button className="form-btn" onClick={() => void openReport(selectedChat.talker, selectedChat.name)} disabled={reportLoading}>
                      {reportLoading ? '生成中…' : '生成日报'}
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

      {/* 日报弹窗 */}
      {report && (
        <div className="overlay-backdrop" onClick={() => setReport(null)}>
          <div className="overlay-panel overlay-panel-wide wx-report-panel" onClick={e => e.stopPropagation()}>
            <div className="overlay-header">
              <h3>{report.chatName} 日报</h3>
              <div className="wx-report-actions">
                <button className="form-btn" onClick={copyReport}>{copied ? '✓ 已复制' : '复制 Markdown'}</button>
                <button className="close-btn" onClick={() => setReport(null)}>✕</button>
              </div>
            </div>
            <div className="wx-report-stats">
              消息 {report.stats.totalMessages} · 成员 {report.stats.activeMembers} · 链接 {report.stats.links} · @我 {report.stats.mentions}
            </div>
            <pre className="wx-report-md">{report.markdown}</pre>
          </div>
        </div>
      )}
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
