import { useState } from 'react';
import { createIssue } from '../api/client.js';
import { ISSUE_COLUMNS, ISSUE_PRIORITY_META } from '../constants.js';
import type { Issue, IssuePriority, IssueStatus } from '../types.js';

export default function NewIssueModal({ projectEncoded, projectPaths, initialStatus, onClose, onCreated }: {
  projectEncoded?: string;
  projectPaths: string[];
  initialStatus?: IssueStatus;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
}) {
  const [title, setTitle] = useState('');
  const [project, setProject] = useState(projectEncoded ?? '');
  const [pickerEdited, setPickerEdited] = useState(false);
  const [priority, setPriority] = useState<IssuePriority>('none');
  const [labels, setLabels] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = initialStatus ? ISSUE_COLUMNS.find(c => c.key === initialStatus)?.label : undefined;

  async function submit() {
    if (!title.trim()) {
      setError('标题必填');
      return;
    }
    if (!project.trim()) {
      setError('任务必须有归属项目');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await createIssue({
        title: title.trim(),
        projectEncoded: project.trim(),
        description: description.trim() || undefined,
        status: initialStatus,
        priority: priority === 'none' ? undefined : priority,
        labels: labels.split(',').map(s => s.trim()).filter(Boolean),
      });
      onCreated(data.issue);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-panel" onClick={e => e.stopPropagation()}>
        <div className="overlay-header">
          <h3>新建 Issue{statusLabel ? ` · ${statusLabel}` : ''}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <label className="form-label">标题 *</label>
        <input
          className="form-input"
          autoFocus
          placeholder="要做什么？"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <label className="form-label">归属项目 *</label>
        <div className="idea-project-picker">
          <input
            className="form-input"
            value={project}
            onChange={e => { setProject(e.target.value); setPickerEdited(true); }}
            placeholder="输入路径关键字检索…"
          />
          <div className="idea-project-options">
            {(() => {
              const q = pickerEdited ? project.trim().toLowerCase() : '';
              const opts = (q ? projectPaths.filter(p => p.toLowerCase().includes(q)) : projectPaths).slice(0, 30);
              return opts.length > 0 ? opts.map(p => (
                <div
                  key={p}
                  className={`idea-project-option${p === project ? ' selected' : ''}`}
                  onMouseDown={e => {
                    e.preventDefault();
                    setProject(p);
                    setPickerEdited(false);
                    (document.activeElement as HTMLElement | null)?.blur();
                  }}
                >
                  <span className="idea-project-option-name">{p.split('/').slice(-2).join('/')}</span>
                  <span className="idea-project-option-path">{p}</span>
                </div>
              )) : <div className="idea-project-option idea-project-empty">无匹配项目</div>;
            })()}
          </div>
        </div>

        <label className="form-label">优先级</label>
        <select className="form-select" value={priority} onChange={e => setPriority(e.target.value as IssuePriority)}>
          <option value="none">无</option>
          {ISSUE_PRIORITY_META.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <label className="form-label">标签（逗号分隔）</label>
        <input
          className="form-input"
          placeholder="如 bug, 前端"
          value={labels}
          onChange={e => setLabels(e.target.value)}
        />
        <label className="form-label">描述</label>
        <textarea
          className="form-input"
          rows={4}
          placeholder="支持 Markdown"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="form-btn" onClick={onClose}>取消</button>
          <button className="form-btn primary" disabled={submitting} onClick={submit}>
            {submitting ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
