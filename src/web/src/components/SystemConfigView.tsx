import { useCallback, useEffect, useState } from 'react';
import {
  deleteTask,
  fetchSystemConfig,
  fetchSystemDataFile,
  fetchSystemRunFile,
  revealSuperCliHome,
  unarchiveProject,
  unpinProject,
  updateSystemConfig,
} from '../api/client.js';

/** Decode an encoded project path ("/" → "-" on disk) back to a readable path. */
function decodeProjectPath(encoded: string): string {
  if (!encoded.startsWith('-')) return encoded;
  return encoded.replace(/-/g, '/');
}

const TERMINAL_OPTIONS = [
  { value: 'ghostty', label: 'Ghostty' },
  { value: 'iterm2', label: 'iTerm2' },
  { value: 'terminal', label: 'Terminal.app' },
  { value: 'kitty', label: 'Kitty' },
  { value: 'warp', label: 'Warp' },
];

interface DataFile {
  name: string;
  path: string;
  bytes: number;
  exists: boolean;
}

interface SessionLabelEntry {
  sessionId: string;
  label: string;
  tags: string[];
  createdAt: string;
}

interface FileViewer {
  title: string;
  content: string;
}

interface RunFileEntry {
  name: string;
  bytes: number;
}

interface SystemConfig {
  settings: Record<string, unknown>;
  configPath: string;
  homePath: string;
  dataFiles: DataFile[];
  sessionLabels: SessionLabelEntry[];
  archivedProjects: string[];
  pinnedProjects: string[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SystemConfigView({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [terminal, setTerminal] = useState('terminal');
  const [defaultPort, setDefaultPort] = useState('');
  const [fileManager, setFileManager] = useState('');
  const [platform, setPlatform] = useState('');
  const [wechatUrl, setWechatUrl] = useState('');
  const [wechatToken, setWechatToken] = useState('');
  const [wechatNames, setWechatNames] = useState('');
  const [saved, setSaved] = useState(false);
  const [ideaCategories, setIdeaCategories] = useState<{ key: string; label: string; project: string }[]>([]);
  const [viewer, setViewer] = useState<FileViewer | null>(null);
  const [runFiles, setRunFiles] = useState<RunFileEntry[] | null>(null);

  async function openFile(name: string) {
    try {
      if (name === 'runs') {
        const d = await fetchSystemDataFile('runs');
        setRunFiles(d.files ?? []);
        setViewer(null);
        return;
      }
      setRunFiles(null);
      const d = await fetchSystemDataFile(name);
      setViewer({ title: name, content: JSON.stringify(d.data, null, 2) });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function openRunFile(file: string) {
    try {
      const d = await fetchSystemRunFile(file);
      setViewer({ title: `runs/${file}`, content: JSON.stringify(d.data, null, 2) });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  const load = useCallback(async () => {
    try {
      const d = await fetchSystemConfig();
      setConfig(d);
      const s = d.settings ?? {};
      setTerminal(typeof s.terminal === 'string' ? s.terminal : 'terminal');
      setDefaultPort(typeof s.defaultPort === 'number' ? String(s.defaultPort) : '');
      setFileManager(typeof s.fileManager === 'string' ? s.fileManager : '');
      setPlatform(typeof d.platform === 'string' ? d.platform : '');
      setWechatUrl(typeof s.wechatUrl === 'string' ? s.wechatUrl : '');
      setWechatToken(typeof s.wechatToken === 'string' ? s.wechatToken : '');
      setWechatNames(typeof s.wechatNames === 'string' ? s.wechatNames : '');
      const cats = Array.isArray(s.ideaCategories) ? s.ideaCategories : [];
      setIdeaCategories(cats.filter((c: unknown) => c && typeof c === 'object') as { key: string; label: string; project: string }[]);
    } catch (err) {
      console.error('Failed to load system config', err);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const patch: Record<string, unknown> = {
      terminal,
      fileManager: fileManager.trim(),
      wechatUrl: wechatUrl.trim(),
      wechatToken: wechatToken.trim(),
      wechatNames: wechatNames.trim(),
      ideaCategories: ideaCategories
        .map(c => ({ key: c.key.trim(), label: c.label.trim(), project: c.project.trim() }))
        .filter(c => c.key && c.label && c.project),
    };
    if (defaultPort.trim()) patch.defaultPort = Number(defaultPort);
    try {
      await updateSystemConfig(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeLabel(sessionId: string) {
    if (!confirm('确定删除该会话的命名与标签？')) return;
    await deleteTask(sessionId);
    await load();
  }

  async function restoreProject(encoded: string, kind: 'archived' | 'pinned') {
    if (kind === 'archived') await unarchiveProject(encoded);
    else await unpinProject(encoded);
    await load();
  }

  return (
    <main className="main-content">
      <header className="toolbar">
        <div className="toolbar-left">
          {onToggleSidebar && (
            <button className="hamburger-btn" onClick={onToggleSidebar} title="菜单">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
          )}
          <h2 className="page-title">系统配置</h2>
        </div>
      </header>

      <div className="config-body">
        {/* 基本设置 */}
        <div className="config-section">
          <h3 className="config-section-title">基本设置</h3>
          <div className="system-config-form">
            <label className="form-label">默认终端（新建会话 / 恢复会话打开的终端）</label>
            <select className="form-select" value={terminal} onChange={e => setTerminal(e.target.value)}>
              {TERMINAL_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <label className="form-label">
              打开目录使用的应用（留空用系统默认：{platform === 'win32' ? '文件管理器' : platform === 'linux' ? 'xdg-open' : 'Finder'}）
            </label>
            <input
              className="form-input"
              placeholder={platform === 'win32' ? 'explorer' : '如 Cursor、ForkLift、Finder'}
              value={fileManager}
              onChange={e => setFileManager(e.target.value)}
            />

            <label className="form-label">wx-cli 服务地址（个人微信看板，留空默认 http://127.0.0.1:9100）</label>
            <input
              className="form-input"
              placeholder="http://127.0.0.1:9100"
              value={wechatUrl}
              onChange={e => setWechatUrl(e.target.value)}
            />

            <label className="form-label">wx-cli 访问令牌（server 以 --token 启动时填写）</label>
            <input
              className="form-input"
              type="password"
              placeholder="留空表示无令牌"
              value={wechatToken}
              onChange={e => setWechatToken(e.target.value)}
            />

            <label className="form-label">我的微信名（用于「@我」识别，逗号分隔多个）</label>
            <input
              className="form-input"
              placeholder="如：征,Leo"
              value={wechatNames}
              onChange={e => setWechatNames(e.target.value)}
            />

            <label className="form-label">想法分类（想法归档项目，分类后才能评论/转任务；留空用内置：个人→personal-notes、工作→work-notes）</label>
            {ideaCategories.map((c, idx) => (
              <div key={idx} className="idea-cat-row">
                <input
                  className="form-input"
                  placeholder="key（如 personal）"
                  value={c.key}
                  onChange={e => setIdeaCategories(prev => prev.map((x, i) => i === idx ? { ...x, key: e.target.value } : x))}
                />
                <input
                  className="form-input"
                  placeholder="名称（如 个人）"
                  value={c.label}
                  onChange={e => setIdeaCategories(prev => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                />
                <input
                  className="form-input"
                  placeholder="归属项目绝对路径"
                  value={c.project}
                  onChange={e => setIdeaCategories(prev => prev.map((x, i) => i === idx ? { ...x, project: e.target.value } : x))}
                />
                <button className="btn-sm" onClick={() => setIdeaCategories(prev => prev.filter((_, i) => i !== idx))}>删除</button>
              </div>
            ))}
            <button
              className="btn-sm"
              onClick={() => setIdeaCategories(prev => [...prev, { key: '', label: '', project: '' }])}
            >
              + 添加分类
            </button>

            <label className="form-label">默认端口</label>
            <input
              className="form-input"
              placeholder="3000"
              value={defaultPort}
              onChange={e => setDefaultPort(e.target.value.replace(/\D/g, ''))}
            />

            <div className="form-actions">
              <button className="form-btn primary" onClick={() => void save()}>
                {saved ? '✓ 已保存' : '保存'}
              </button>
            </div>
          </div>
        </div>

        {/* 数据存储 */}
        <div className="config-section">
          <h3 className="config-section-title">数据存储</h3>
          <p className="config-section-desc">
            super-cli 的全部自有数据都在本地 {config?.homePath ?? '~/.super-cli'} 下，无数据库、无外部上传。
          </p>
          <div className="system-config-files">
            {(config?.dataFiles ?? []).map(f => (
              <div
                key={f.name}
                className={`system-config-file-row clickable ${viewer?.title === f.name ? 'active' : ''}`}
                title="点击查看内容"
                onClick={() => f.exists && void openFile(f.name)}
              >
                <span className="system-config-file-name">{f.name}</span>
                <span className="system-config-file-size">
                  {f.exists ? formatBytes(f.bytes) : '未创建'}
                </span>
              </div>
            ))}
          </div>
          {runFiles && (
            <div className="system-config-files">
              {runFiles.length === 0 && <div className="issue-empty-hint">暂无运行记录</div>}
              {runFiles.map(f => (
                <div
                  key={f.name}
                  className="system-config-file-row clickable nested"
                  onClick={() => void openRunFile(f.name)}
                >
                  <span className="system-config-file-name">{f.name}</span>
                  <span className="system-config-file-size">{formatBytes(f.bytes)}</span>
                </div>
              ))}
            </div>
          )}
          {viewer && (
            <div className="system-config-viewer">
              <div className="system-config-viewer-header">
                <span className="system-config-file-name">{viewer.title}</span>
                <span className="agent-spacer" />
                <button className="form-btn" onClick={() => void navigator.clipboard.writeText(viewer.content)}>复制</button>
                <button className="form-btn" onClick={() => setViewer(null)}>关闭</button>
              </div>
              <pre className="system-config-viewer-body">{viewer.content}</pre>
            </div>
          )}
          <div className="form-actions">
            <button className="form-btn" onClick={() => void revealSuperCliHome()}>在 Finder 中打开</button>
          </div>
        </div>

        {/* 会话命名 */}
        <div className="config-section">
          <h3 className="config-section-title">会话命名与标签</h3>
          <p className="config-section-desc">为各 provider 会话设置的名称/标签（存储在 config.json）。</p>
          {(config?.sessionLabels.length ?? 0) === 0 && <div className="issue-empty-hint">暂无命名会话</div>}
          {(config?.sessionLabels ?? []).map(l => (
            <div key={l.sessionId} className="system-config-label-row">
              <span className="session-id-badge" title={l.sessionId}>{l.sessionId.slice(0, 8)}</span>
              <span className="system-config-label-text">{l.label}</span>
              {l.tags.map(t => <span key={t} className="idea-tag">#{t}</span>)}
              <span className="agent-spacer" />
              <button className="relation-remove" title="删除命名" onClick={() => void removeLabel(l.sessionId)}>✕</button>
            </div>
          ))}
        </div>

        {/* 项目管理 */}
        <div className="config-section">
          <h3 className="config-section-title">项目置顶与归档</h3>
          {(config?.pinnedProjects.length ?? 0) === 0 && (config?.archivedProjects.length ?? 0) === 0 && (
            <div className="issue-empty-hint">暂无置顶或归档的项目</div>
          )}
          {(config?.pinnedProjects.length ?? 0) > 0 && (
            <>
              <h4 className="system-config-subtitle">已置顶</h4>
              {config!.pinnedProjects.map(p => (
                <div key={p} className="system-config-label-row">
                  <span className="system-config-label-text" title={p}>{decodeProjectPath(p)}</span>
                  <span className="agent-spacer" />
                  <button className="form-btn" onClick={() => void restoreProject(p, 'pinned')}>取消置顶</button>
                </div>
              ))}
            </>
          )}
          {(config?.archivedProjects.length ?? 0) > 0 && (
            <>
              <h4 className="system-config-subtitle">已归档</h4>
              {config!.archivedProjects.map(p => (
                <div key={p} className="system-config-label-row">
                  <span className="system-config-label-text" title={p}>{decodeProjectPath(p)}</span>
                  <span className="agent-spacer" />
                  <button className="form-btn" onClick={() => void restoreProject(p, 'archived')}>恢复</button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
