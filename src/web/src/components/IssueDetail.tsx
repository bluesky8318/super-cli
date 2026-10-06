import { useCallback, useEffect, useState } from 'react';
import { marked } from 'marked';
import {
  ApiError,
  addIssueRelation,
  bindIssueSession,
  createIssueComment,
  createNewSession,
  deleteIssueRelation,
  fetchIssue,
  fetchIssueActivities,
  fetchIssueComments,
  moveIssue,
  unbindIssueSession,
  updateIssue,
} from '../api/client.js';
import { ISSUE_COLUMNS, ISSUE_PRIORITY_META, PROVIDER_COLORS, PROVIDER_LABELS } from '../constants.js';
import type {
  Issue,
  IssueActivity,
  IssueComment,
  IssuePriority,
  IssueRelation,
  IssueRelationType,
  IssueStatus,
  IssueSummary,
  ProviderInfo,
  SessionItem,
} from '../types.js';

type Tab = 'detail' | 'comments' | 'sessions';

interface DetailData {
  issue: Issue;
  relations: IssueRelation[];
  commentCount: number;
}

const RELATION_TYPE_LABELS: Record<IssueRelationType, string> = {
  parent: '父任务',
  blocks: '阻塞',
  related: '相关',
};

const FIELD_LABELS: Record<string, string> = {
  title: '标题',
  status: '状态',
  priority: '优先级',
  labels: '标签',
  description: '描述',
  projectEncoded: '项目',
  sessionIds: '关联会话',
  archivedAt: '归档',
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(空)';
  if (Array.isArray(v)) return v.length === 0 ? '(空)' : v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
}

function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

export default function IssueDetail({ issueId, issues, sessions, providers, refreshKey, onClose, onSelectSession, onChanged }: {
  issueId: string;
  issues: IssueSummary[];
  sessions: SessionItem[];
  providers: ProviderInfo[];
  refreshKey: number;
  onClose: () => void;
  onSelectSession: (session: SessionItem) => void;
  onChanged: (issue: Issue) => void;
}) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [activities, setActivities] = useState<IssueActivity[]>([]);
  const [tab, setTab] = useState<Tab>('detail');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descMode, setDescMode] = useState<'preview' | 'edit'>('preview');
  const [descDraft, setDescDraft] = useState('');
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelsDraft, setLabelsDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [relType, setRelType] = useState<IssueRelationType>('related');
  const [relTarget, setRelTarget] = useState('');
  const [bindTarget, setBindTarget] = useState('');
  const [launchProvider, setLaunchProvider] = useState('');
  const [launching, setLaunching] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, c, a] = await Promise.all([
        fetchIssue(issueId),
        fetchIssueComments(issueId),
        fetchIssueActivities(issueId),
      ]);
      setDetail({ issue: d.issue, relations: d.relations ?? [], commentCount: d.commentCount ?? 0 });
      setComments(c.comments ?? []);
      setActivities(a.activities ?? []);
      setNotFound(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
      } else {
        console.error('Failed to load issue detail', e);
      }
    } finally {
      setLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    load();
  }, [load, refreshKey]);

  // Run a mutation; on 409 refresh the detail so the user sees the latest version.
  // Returns true on success. If the action returns an updated issue, sync it to state.
  async function run(action: () => Promise<{ issue?: Issue } | void>): Promise<boolean> {
    try {
      const result = await action();
      const updated = result && typeof result === 'object' && 'issue' in result ? result.issue : undefined;
      if (updated) {
        setDetail(d => (d ? { ...d, issue: updated } : d));
        onChanged(updated);
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert('数据已被修改，正在刷新');
        await load();
      } else {
        alert(e instanceof Error ? e.message : '操作失败');
      }
      return false;
    }
  }

  // Launch a new agent session for this issue with a claiming instruction as the
  // initial prompt. Providers without prompt support just open a plain session.
  async function startWork() {
    if (!detail) return;
    const { issue } = detail;
    if (!issue.projectEncoded) {
      alert('该 Issue 未关联项目，请先在详情中设置项目');
      return;
    }
    const project = issue.projectEncoded.replace(/-/g, '/');
    const prompt = `请认领并完成 issue ${issue.identifier}（${issue.title}）。遵循 super-cli-taskboard skill：先运行 super-cli issue claim ${issue.identifier} --session-id <你的sessionId> 认领，完成后评论记录改动与验证结果并移入 in_review。`;
    setLaunching(true);
    try {
      const result = await createNewSession(project, launchProvider || undefined, prompt);
      if (result.action === 'error') alert(result.message ?? '启动失败');
    } catch {
      alert('请求失败');
    } finally {
      setLaunching(false);
    }
  }

  if (loading && !detail) {
    return (
      <>
        <div className="detail-header">
          <div className="detail-title-area"><h3 className="detail-title">Issue</h3></div>
          <div className="detail-actions"><button className="close-btn" onClick={onClose}>✕</button></div>
        </div>
        <div className="loading-small">加载中...</div>
      </>
    );
  }

  if (notFound || !detail) {
    return (
      <>
        <div className="detail-header">
          <div className="detail-title-area"><h3 className="detail-title">Issue 不存在或已删除</h3></div>
          <div className="detail-actions"><button className="close-btn" onClick={onClose}>✕</button></div>
        </div>
        <div className="loading-small">无法加载该 Issue</div>
      </>
    );
  }

  const { issue, relations } = detail;

  function resolveIdentifier(id: string): string {
    return issues.find(i => i.id === id)?.identifier ?? id.slice(0, 8);
  }

  function resolveTitle(id: string): string | undefined {
    return issues.find(i => i.id === id)?.title;
  }

  function relationText(rel: IssueRelation): string {
    const outgoing = rel.sourceId === issue.id;
    const otherId = outgoing ? rel.targetId : rel.sourceId;
    const label = resolveIdentifier(otherId);
    if (rel.type === 'parent') return outgoing ? `父任务: ${label}` : `子任务: ${label}`;
    if (rel.type === 'blocks') return outgoing ? `阻塞 ${label}` : `被 ${label} 阻塞`;
    return `相关 ${label}`;
  }

  async function saveTitle() {
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (!title || title === issue.title) return;
    await run(() => updateIssue(issue.id, { version: issue.version, title }));
  }

  async function changeStatus(status: IssueStatus) {
    if (status === issue.status) return;
    await run(() => moveIssue(issue.id, { status, version: issue.version }));
  }

  async function changePriority(priority: IssuePriority) {
    if (priority === issue.priority) return;
    await run(() => updateIssue(issue.id, { version: issue.version, priority }));
  }

  async function saveLabels() {
    const labels = labelsDraft.split(',').map(s => s.trim()).filter(Boolean);
    setEditingLabels(false);
    if (JSON.stringify(labels) === JSON.stringify(issue.labels)) return;
    await run(() => updateIssue(issue.id, { version: issue.version, labels }));
  }

  async function saveDescription() {
    setDescMode('preview');
    if (descDraft === issue.description) return;
    await run(() => updateIssue(issue.id, { version: issue.version, description: descDraft }));
  }

  async function addRelation() {
    const target = relTarget.trim();
    if (!target) return;
    if (await run(() => addIssueRelation(issue.id, relType, target))) {
      setRelTarget('');
    }
    await load();
  }

  async function removeRelation(rel: IssueRelation) {
    await run(async () => {
      await deleteIssueRelation(rel.sourceId, rel.type, rel.targetId);
    });
    await load();
  }

  async function submitComment() {
    const body = commentDraft.trim();
    if (!body) return;
    try {
      const data = await createIssueComment(issue.id, { body, authorType: 'user' });
      setComments(prev => [...prev, data.comment]);
      setCommentDraft('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '评论失败');
    }
  }

  async function bindSession() {
    if (!bindTarget) return;
    const updated = await run(() => bindIssueSession(issue.id, bindTarget, issue.version));
    if (updated) setBindTarget('');
  }

  async function unbindSession(sessionId: string) {
    await run(() => unbindIssueSession(issue.id, sessionId, issue.version));
  }

  const boundElsewhere = new Set(issues.flatMap(i => i.sessionIds));
  const bindCandidates = sessions.filter(s => !boundElsewhere.has(s.sessionId));
  const recentActivities = activities.slice(-20).reverse();

  return (
    <>
      <div className="detail-header">
        <div className="detail-title-area">
          {editingTitle ? (
            <input
              className="form-input issue-title-input"
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
            />
          ) : (
            <h3
              className="detail-title issue-title-editable"
              title="点击编辑标题"
              onClick={() => { setTitleDraft(issue.title); setEditingTitle(true); }}
            >
              {issue.title}
            </h3>
          )}
          <span className="detail-id">{issue.identifier}</span>
          {issue.archivedAt && <span className="detail-badge">已归档</span>}
        </div>
        <div className="detail-actions">
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="issue-tab-bar">
        <div className="overlay-tabs">
          <button className={`overlay-tab ${tab === 'detail' ? 'active' : ''}`} onClick={() => setTab('detail')}>详情</button>
          <button className={`overlay-tab ${tab === 'comments' ? 'active' : ''}`} onClick={() => setTab('comments')}>
            评论{comments.length > 0 ? ` (${comments.length})` : ''}
          </button>
          <button className={`overlay-tab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>
            关联会话{issue.sessionIds.length > 0 ? ` (${issue.sessionIds.length})` : ''}
          </button>
        </div>
      </div>

      {tab === 'detail' && (
        <div className="issue-detail-body">
          <div className="issue-form-row">
            <div className="issue-form-field">
              <label className="form-label">状态</label>
              <select
                className="form-select"
                value={issue.status}
                onChange={e => changeStatus(e.target.value as IssueStatus)}
              >
                {ISSUE_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div className="issue-form-field">
              <label className="form-label">优先级</label>
              <select
                className="form-select"
                value={issue.priority}
                onChange={e => changePriority(e.target.value as IssuePriority)}
              >
                <option value="none">无</option>
                {ISSUE_PRIORITY_META.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">标签</label>
            {editingLabels ? (
              <input
                className="form-input"
                autoFocus
                placeholder="逗号分隔，如 bug, 前端"
                value={labelsDraft}
                onChange={e => setLabelsDraft(e.target.value)}
                onBlur={saveLabels}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveLabels();
                  if (e.key === 'Escape') setEditingLabels(false);
                }}
              />
            ) : (
              <div
                className="label-chips issue-labels-view"
                title="点击编辑标签"
                onClick={() => { setLabelsDraft(issue.labels.join(', ')); setEditingLabels(true); }}
              >
                {issue.labels.length > 0
                  ? issue.labels.map(l => <span key={l} className="label-chip">{l}</span>)
                  : <span className="issue-empty-hint">点击添加标签</span>}
              </div>
            )}
          </div>

          <div>
            <div className="issue-desc-header">
              <label className="form-label">描述</label>
              <div className="overlay-tabs">
                <button
                  className={`overlay-tab ${descMode === 'preview' ? 'active' : ''}`}
                  onClick={() => setDescMode('preview')}
                >
                  预览
                </button>
                <button
                  className={`overlay-tab ${descMode === 'edit' ? 'active' : ''}`}
                  onClick={() => { setDescDraft(issue.description); setDescMode('edit'); }}
                >
                  编辑
                </button>
              </div>
            </div>
            {descMode === 'edit' ? (
              <>
                <textarea
                  className="form-input issue-desc-textarea"
                  rows={8}
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                />
                <div className="form-actions">
                  <button className="form-btn" onClick={() => setDescMode('preview')}>取消</button>
                  <button className="form-btn primary" onClick={saveDescription}>保存</button>
                </div>
              </>
            ) : issue.description ? (
              <div className="file-md-body issue-desc-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.description) }} />
            ) : (
              <div
                className="issue-empty-hint issue-desc-empty"
                onClick={() => { setDescDraft(issue.description); setDescMode('edit'); }}
              >
                暂无描述，点击编辑
              </div>
            )}
          </div>

          <div>
            <label className="form-label">关系</label>
            {relations.length === 0 && <div className="issue-empty-hint">暂无关系</div>}
            {relations.map(rel => {
              const otherId = rel.sourceId === issue.id ? rel.targetId : rel.sourceId;
              const otherTitle = resolveTitle(otherId);
              return (
                <div className="relation-row" key={`${rel.type}-${rel.sourceId}-${rel.targetId}`}>
                  <span className="relation-type-badge">{RELATION_TYPE_LABELS[rel.type]}</span>
                  <span className="relation-text" title={otherTitle}>{relationText(rel)}</span>
                  <button className="relation-remove" title="删除关系" onClick={() => removeRelation(rel)}>✕</button>
                </div>
              );
            })}
            <div className="relation-add-row">
              <select
                className="form-select relation-type-select"
                value={relType}
                onChange={e => setRelType(e.target.value as IssueRelationType)}
              >
                {(Object.keys(RELATION_TYPE_LABELS) as IssueRelationType[]).map(t => (
                  <option key={t} value={t}>{RELATION_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <input
                className="form-input"
                placeholder="目标，如 ISSUE-12"
                value={relTarget}
                onChange={e => setRelTarget(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRelation(); }}
              />
              <button className="form-btn" disabled={!relTarget.trim()} onClick={addRelation}>添加</button>
            </div>
          </div>

          <div>
            <label className="form-label">最近活动</label>
            {recentActivities.length === 0 && <div className="issue-empty-hint">暂无活动</div>}
            <div className="activity-list">
              {recentActivities.map(a => (
                <div className="activity-item" key={a.id}>
                  <span className="activity-time">{new Date(a.at).toLocaleString('zh-CN')}</span>
                  <span className="activity-actor">[{a.actorType}]</span>
                  {Object.entries(a.changes).map(([field, ch]) => (
                    <span key={field} className="activity-change">
                      {FIELD_LABELS[field] ?? field}: {formatValue(ch.from)} → {formatValue(ch.to)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'comments' && (
        <>
          <div className="issue-detail-body issue-comments">
            {comments.length === 0 && <div className="issue-empty-hint">暂无评论</div>}
            {comments.map(c => (
              <div className={`comment-item ${c.authorType}`} key={c.id}>
                <div className="comment-header">
                  {c.authorType === 'agent' ? (
                    <span className="comment-author-badge">agent:{c.sessionId ? c.sessionId.slice(0, 8) : 'unknown'}</span>
                  ) : (
                    <span className="comment-author-badge user">用户</span>
                  )}
                  <span className="comment-time">{new Date(c.createdAt).toLocaleString('zh-CN')}</span>
                </div>
                <div className="comment-body">{c.body}</div>
              </div>
            ))}
          </div>
          <div className="comment-input-row">
            <input
              className="form-input"
              placeholder="添加评论..."
              value={commentDraft}
              onChange={e => setCommentDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitComment(); }}
            />
            <button className="form-btn primary" disabled={!commentDraft.trim()} onClick={submitComment}>发送</button>
          </div>
        </>
      )}

      {tab === 'sessions' && (
        <div className="issue-detail-body">
          <div className="relation-add-row">
            <select className="form-select" value={launchProvider} onChange={e => setLaunchProvider(e.target.value)}>
              <option value="">默认工具</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              className="form-btn primary"
              disabled={launching || !issue.projectEncoded}
              title={issue.projectEncoded ? '启动一个新会话认领并处理此 Issue' : '该 Issue 未关联项目'}
              onClick={startWork}
            >
              {launching ? '启动中...' : '▶ 开始处理'}
            </button>
          </div>
          {issue.sessionIds.length === 0 && <div className="issue-empty-hint">暂无关联会话</div>}
          {issue.sessionIds.map(sid => {
            const s = sessions.find(x => x.sessionId === sid);
            return (
              <div className="bound-session-row" key={sid}>
                {s ? (
                  <>
                    <span className="provider-badge" style={{ background: PROVIDER_COLORS[s.provider] }}>
                      {PROVIDER_LABELS[s.provider]}
                    </span>
                    <span
                      className="bound-session-title"
                      title="点击打开会话详情"
                      onClick={() => onSelectSession(s)}
                    >
                      {s.label || s.firstUserMessage?.slice(0, 60) || sid.slice(0, 8)}
                    </span>
                  </>
                ) : (
                  <span className="session-id-badge" title={sid}>{sid.slice(0, 8)}</span>
                )}
                <button className="relation-remove" title="解绑" onClick={() => unbindSession(sid)}>解绑</button>
              </div>
            );
          })}
          <div className="relation-add-row">
            <select className="form-select" value={bindTarget} onChange={e => setBindTarget(e.target.value)}>
              <option value="">选择会话绑定...</option>
              {bindCandidates.map(s => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.label || s.firstUserMessage?.slice(0, 40) || s.sessionId.slice(0, 8)}
                </option>
              ))}
            </select>
            <button className="form-btn" disabled={!bindTarget} onClick={bindSession}>绑定</button>
          </div>
        </div>
      )}
    </>
  );
}
