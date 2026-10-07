import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  abandonIdea,
  archiveIdea,
  categorizeIdea,
  commentIdea,
  fetchIdeaCategories,
  fetchIdeas,
  promoteIdea,
  restoreIdea,
} from '../api/client.js';
import type { Idea, IdeaCategory, IdeaStatus } from '../types.js';

const STATUS_META: Record<IdeaStatus, { label: string; className: string }> = {
  draft: { label: '待分类', className: 'idea-st-draft' },
  incubating: { label: '孵化中', className: 'idea-st-incubating' },
  promoted: { label: '已转任务', className: 'idea-st-promoted' },
  abandoned: { label: '已放弃', className: 'idea-st-abandoned' },
  archived: { label: '已归档', className: 'idea-st-archived' },
};

const STATUS_ORDER: IdeaStatus[] = ['draft', 'incubating', 'promoted', 'abandoned', 'archived'];

const ISSUE_STATUS_LABEL: Record<string, string> = {
  backlog: '未启动', todo: '待开始', in_progress: '进行中',
  in_review: '待验证', done: '已完成', blocked: '受阻', canceled: '已取消',
};

const TIME_RANGES: { key: string; label: string; days?: number }[] = [
  { key: 'all', label: '全部时间' },
  { key: 'today', label: '今天', days: 0 },
  { key: 'week', label: '近 7 天', days: 7 },
  { key: 'month', label: '近 30 天', days: 30 },
];

export default function IdeasView({ projectPaths, onPromoted, onOpenIssue }: {
  projectPaths: string[];
  onPromoted: () => void;
  onOpenIssue: (identifier: string, project?: string) => void;
}) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [categories, setCategories] = useState<IdeaCategory[]>([]);
  const [fCategory, setFCategory] = useState('');
  const [fProject, setFProject] = useState('');
  const [fTime, setFTime] = useState('all');
  const [detail, setDetail] = useState<Idea | null>(null);
  const [comment, setComment] = useState('');
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteTitle, setPromoteTitle] = useState('');
  const [promoteProject, setPromoteProject] = useState('');
  const [pickerEdited, setPickerEdited] = useState(false);

  const load = useCallback(async () => {
    const [ideaData, catData] = await Promise.all([fetchIdeas(), fetchIdeaCategories()]);
    setIdeas(ideaData.ideas ?? []);
    setCategories(catData.categories ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Global floating capture dispatches this event after saving.
  useEffect(() => {
    const onCaptured = () => void load();
    window.addEventListener('super-cli:idea-captured', onCaptured);
    return () => window.removeEventListener('super-cli:idea-captured', onCaptured);
  }, [load]);

  const categoryLabel = useCallback(
    (key?: string) => categories.find(c => c.key === key)?.label ?? key,
    [categories],
  );

  // 想法不跟随侧边栏项目选择，只用页内自己的筛选器。
  const projectIdeas = ideas;

  const projectOptions = useMemo(
    () => [...new Set(ideas.map(i => i.project).filter(Boolean))] as string[],
    [ideas],
  );

  const filtered = useMemo(() => {
    let list = projectIdeas;
    if (fCategory) list = list.filter(i => fCategory === '__none__' ? !i.category : i.category === fCategory);
    if (fProject) list = list.filter(i => i.project === fProject);
    if (fTime !== 'all') {
      const range = TIME_RANGES.find(r => r.key === fTime);
      if (range?.days !== undefined) {
        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - range.days);
        list = list.filter(i => new Date(i.createdAt) >= cutoff);
      }
    }
    return list;
  }, [projectIdeas, fCategory, fProject, fTime]);

  const byStatus = useMemo(() => {
    const m = new Map<IdeaStatus, Idea[]>(STATUS_ORDER.map(s => [s, []]));
    for (const i of filtered) m.get(i.status)?.push(i);
    return m;
  }, [filtered]);

  const openDetail = (idea: Idea) => {
    setDetail(idea);
    setComment('');
    setPromoteOpen(false);
    setPromoteTitle(idea.title);
    setPromoteProject(idea.project ?? '');
    setPickerEdited(false);
  };

  const refreshDetail = (idea: Idea) => {
    setDetail(idea);
    void load();
  };

  const sendComment = async () => {
    if (!detail || !comment.trim()) return;
    const res = await commentIdea(detail.id, comment.trim());
    setComment('');
    refreshDetail(res.idea);
  };

  const promoteOptions = useMemo(() => {
    // Only filter once the user has actually edited; focusing with the
    // default category project shows the full list.
    const q = pickerEdited ? promoteProject.trim().toLowerCase() : '';
    let list = projectPaths;
    if (q) list = list.filter(p => p.toLowerCase().includes(q));
    // Ensure the idea's category project is always offered even if not indexed yet.
    if (detail?.project && !list.includes(detail.project) && (!q || detail.project.toLowerCase().includes(q))) {
      list = [detail.project, ...list];
    }
    return list.slice(0, 30);
  }, [projectPaths, promoteProject, pickerEdited, detail]);

  const doPromote = async () => {
    if (!detail) return;
    await promoteIdea(detail.id, {
      title: promoteTitle.trim() || undefined,
      project: promoteProject.trim() || undefined,
    });
    setDetail(null);
    void load();
    onPromoted();
  };

  return (
    <div className="ideas-view">
      <div className="idea-filters">
        <select value={fCategory} onChange={e => setFCategory(e.target.value)}>
          <option value="">全部分类</option>
          <option value="__none__">未分类</option>
          {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={fProject} onChange={e => setFProject(e.target.value)}>
          <option value="">全部项目</option>
          {projectOptions.map(p => <option key={p} value={p}>{p.split('/').slice(-2).join('/')}</option>)}
        </select>
        <select value={fTime} onChange={e => setFTime(e.target.value)}>
          {TIME_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <span className="idea-filter-count">{filtered.length} 个想法</span>
      </div>

      <div className="idea-board">
        {STATUS_ORDER.map(status => {
          const meta = STATUS_META[status];
          const list = byStatus.get(status) ?? [];
          return (
            <div key={status} className="idea-col">
              <div className={`idea-col-head ${meta.className}`}>
                {meta.label}
                <span className="idea-col-count">{list.length}</span>
              </div>
              {list.map(idea => (
                <div key={idea.id} className={`idea-card ${meta.className}`} onClick={() => openDetail(idea)}>
                  <div className="idea-card-title">{idea.title}</div>
                  {idea.content.trim() !== idea.title.trim() && (
                    <div className="idea-card-snippet">{idea.content.slice(0, 80)}</div>
                  )}
                  {idea.status === 'draft' ? (
                    <select
                      className="idea-card-cat"
                      value=""
                      onClick={e => e.stopPropagation()}
                      onChange={async e => {
                        if (!e.target.value) return;
                        await categorizeIdea(idea.id, e.target.value);
                        void load();
                      }}
                    >
                      <option value="">选择分类…</option>
                      {categories.map(c => <option key={c.key} value={c.key}>{c.label} → {c.project.split('/').slice(-2).join('/')}</option>)}
                    </select>
                  ) : (
                    <div className="idea-card-foot">
                      {idea.category && <span className="idea-chip">{categoryLabel(idea.category)}</span>}
                      {idea.project && (
                        <span className="idea-chip idea-chip-project" title={idea.project}>
                          {idea.project.split('/').slice(-2).join('/')}
                        </span>
                      )}
                      {idea.comments.length > 0 && <span className="idea-chip">💬 {idea.comments.length}</span>}
                      {idea.promotedIssueIdentifier && (
                        <span
                          className="idea-chip idea-chip-issue idea-chip-link"
                          title="跳转到任务"
                          onClick={e => { e.stopPropagation(); onOpenIssue(idea.promotedIssueIdentifier!, idea.issueProject); }}
                        >
                          {idea.promotedIssueIdentifier}·{ISSUE_STATUS_LABEL[idea.issueStatus ?? ''] ?? idea.issueStatus}
                        </span>
                      )}
                      <span className="idea-card-date">{idea.createdAt.slice(0, 10)}</span>
                    </div>
                  )}
                </div>
              ))}
              {list.length === 0 && <div className="idea-col-empty">—</div>}
            </div>
          );
        })}
      </div>

      {detail && (
        <div className="overlay-backdrop" onClick={() => setDetail(null)}>
          <div className="overlay-panel idea-detail" onClick={e => e.stopPropagation()}>
            <div className="idea-detail-head">
              <h3 className="idea-detail-title">{detail.title}</h3>
              <span className={`idea-chip ${STATUS_META[detail.status].className}`}>{STATUS_META[detail.status].label}</span>
            </div>

            <div className="idea-meta-grid">
              <span className="idea-meta-item">{detail.identifier}</span>
              <span className="idea-meta-item">{detail.createdAt.slice(0, 16).replace('T', ' ')}</span>
              {detail.category && <span className="idea-meta-item">{categoryLabel(detail.category)}</span>}
              {detail.project && (
                <span className="idea-meta-item idea-meta-project" title={detail.project}>
                  {detail.project.split('/').slice(-2).join('/')}
                </span>
              )}
            </div>

            <div className="idea-detail-section">
              <div className="idea-detail-label">原始记录</div>
              <div className="idea-original">{detail.content}</div>
            </div>

            {detail.status === 'promoted' && detail.promotedIssueIdentifier && (
              <button
                className="idea-task-banner"
                title="跳转到任务"
                onClick={() => onOpenIssue(detail.promotedIssueIdentifier!, detail.issueProject)}
              >
                <span className="idea-task-banner-label">已转为任务</span>
                <span className="idea-task-banner-id">{detail.promotedIssueIdentifier}</span>
                <span className="idea-task-banner-title">{detail.issueTitle}</span>
                <span className="idea-task-banner-status">
                  {ISSUE_STATUS_LABEL[detail.issueStatus ?? ''] ?? detail.issueStatus} →
                </span>
              </button>
            )}

            {detail.comments.length > 0 && (
              <div className="idea-detail-section">
                <div className="idea-detail-label">评论与修正（{detail.comments.length}）</div>
                {detail.comments.map((c, i) => (
                  <div key={i} className="idea-comment">
                    <div className="idea-comment-at">{c.at}</div>
                    <div className="idea-comment-body">{c.body}</div>
                  </div>
                ))}
              </div>
            )}

            {detail.status === 'draft' ? (
              <div className="idea-detail-section">
                <div className="idea-detail-label">选择分类后才能评论、完善或转为任务</div>
                <div className="idea-detail-actions">
                  {categories.map(c => (
                    <button
                      key={c.key}
                      className="btn-primary"
                      onClick={async () => {
                        const res = await categorizeIdea(detail.id, c.key);
                        refreshDetail(res.idea);
                      }}
                    >
                      {c.label} → {c.project.split('/').slice(-2).join('/')}
                    </button>
                  ))}
                </div>
              </div>
            ) : detail.status === 'incubating' && (
              <div className="idea-detail-section">
                <div className="idea-comment-input">
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="追加评论或修正（原始记录不变）…"
                    rows={2}
                  />
                  <button className="btn-primary" onClick={() => void sendComment()} disabled={!comment.trim()}>评论</button>
                </div>
              </div>
            )}

            {detail.docPath && <div className="idea-detail-path">文档：{detail.docPath}</div>}

            {promoteOpen ? (
              <div className="idea-detail-section idea-promote-form">
                <div className="idea-detail-label">转为任务</div>
                <label>任务标题<input value={promoteTitle} onChange={e => setPromoteTitle(e.target.value)} /></label>
                <label>归属项目（从已有项目中检索选择）</label>
                <div className="idea-project-picker">
                  <input
                    value={promoteProject}
                    onChange={e => { setPromoteProject(e.target.value); setPickerEdited(true); }}
                    placeholder="输入路径关键字检索…"
                  />
                  {/* 显隐交给 :focus-within，不依赖焦点事件状态 */}
                  <div className="idea-project-options">
                    {promoteOptions.length > 0 ? promoteOptions.map(p => (
                      <div
                        key={p}
                        className={`idea-project-option${p === promoteProject ? ' selected' : ''}`}
                        onMouseDown={e => {
                          e.preventDefault();
                          setPromoteProject(p);
                          setPickerEdited(false);
                          (document.activeElement as HTMLElement | null)?.blur();
                        }}
                      >
                        <span className="idea-project-option-name">{p.split('/').slice(-2).join('/')}</span>
                        <span className="idea-project-option-path">{p}</span>
                      </div>
                    )) : (
                      <div className="idea-project-option idea-project-empty">无匹配项目</div>
                    )}
                  </div>
                </div>
                <div className="idea-detail-actions">
                  <button className="btn-primary" disabled={!promoteOptions.includes(promoteProject)} onClick={() => void doPromote()}>确认转任务</button>
                  <button className="btn" onClick={() => setPromoteOpen(false)}>取消</button>
                </div>
              </div>
            ) : (
              <div className="idea-detail-actions">
                {detail.status === 'incubating' && (
                  <button className="btn-primary" onClick={() => setPromoteOpen(true)}>转为任务 →</button>
                )}
                {(detail.status === 'draft' || detail.status === 'incubating') && (
                  <button className="btn" onClick={async () => { await abandonIdea(detail.id); setDetail(null); void load(); }}>放弃（条件不满足）</button>
                )}
                {detail.status !== 'archived' && detail.status !== 'promoted' && (
                  <button className="btn" onClick={async () => { await archiveIdea(detail.id); setDetail(null); void load(); }}>归档</button>
                )}
                {(detail.status === 'abandoned' || detail.status === 'archived') && (
                  <button className="btn" onClick={async () => { const res = await restoreIdea(detail.id); refreshDetail(res.idea); }}>
                    恢复{detail.docPath ? '到孵化中' : '到待分类'}
                  </button>
                )}
                <button className="btn" onClick={() => setDetail(null)}>关闭</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
