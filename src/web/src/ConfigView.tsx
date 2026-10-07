import React, { useState, useEffect } from 'react';
import {
  fetchSkills, fetchSkillContent, copySkillApi,
  fetchMcpServers, addMcpServerApi, updateMcpServerApi, deleteMcpServerApi, copyMcpServerApi,
  fetchRules, fetchRuleContent, saveRuleContentApi,
  fetchHooks, fetchPermissions,
  fetchAgents, createAgent, deleteAgent,
} from './api/client.js';
import type { AgentProfile } from './types.js';

type CliProvider = 'claude-code' | 'qoder' | 'codex' | 'kimi' | 'pi' | 'opencode' | 'workbuddy' | 'traecode';
type ConfigTab = 'skills' | 'mcp' | 'rules' | 'hooks' | 'permissions' | 'agents';

interface ProviderInfo {
  id: CliProvider;
  name: string;
}

interface SkillInfo {
  id: string;
  name: string;
  version?: string;
  description?: string;
  provider: CliProvider;
  scope: 'global' | 'project';
  directory: string;
}

interface McpServerInfo {
  id: string;
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  provider: CliProvider;
  scope: 'global' | 'project';
  status?: 'healthy' | 'unhealthy' | 'unknown';
}

interface RuleFile {
  id: string;
  name: string;
  path: string;
  provider: CliProvider;
  scope: 'global' | 'project';
  exists: boolean;
}

const PROVIDER_COLORS: Record<CliProvider, string> = {
  'claude-code': '#d97706',
  'qoder': '#7c3aed',
  'codex': '#059669',
  'kimi': '#f43f5e',
  'pi': '#ec4899',
  'opencode': '#0ea5e9',
  'workbuddy': '#14b8a6',
  'traecode': '#3b82f6',
};

const PROVIDER_LABELS: Record<CliProvider, string> = {
  'claude-code': 'Claude',
  'qoder': 'Qoder',
  'codex': 'Codex',
  'kimi': 'Kimi',
  'pi': 'Pi',
  'opencode': 'OpenCode',
  'workbuddy': 'WorkBuddy',
  'traecode': 'TraeCode',
};

interface ConfigViewProps {
  selectedProject?: string;
  selectedProjectProviders?: CliProvider[];
  providers: ProviderInfo[];
  onToggleSidebar?: () => void;
}

export default function ConfigView({ selectedProject, selectedProjectProviders, providers, onToggleSidebar }: ConfigViewProps) {
  const [configTab, setConfigTab] = useState<ConfigTab>('skills');
  const activeProviders = selectedProjectProviders ?? providers.map(p => p.id);

  return (
    <main className="main-content">
      <header className="toolbar">
        <div className="toolbar-left">
          {onToggleSidebar && (
            <button className="hamburger-btn" onClick={onToggleSidebar} title="菜单">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
          )}
          <div className="config-tabs">
            <button className={`config-tab ${configTab === 'skills' ? 'active' : ''}`} onClick={() => setConfigTab('skills')}>Skills</button>
            <button className={`config-tab ${configTab === 'mcp' ? 'active' : ''}`} onClick={() => setConfigTab('mcp')}>MCP</button>
            <button className={`config-tab ${configTab === 'rules' ? 'active' : ''}`} onClick={() => setConfigTab('rules')}>Rules</button>
            <button className={`config-tab ${configTab === 'hooks' ? 'active' : ''}`} onClick={() => setConfigTab('hooks')}>Hooks</button>
            <button className={`config-tab ${configTab === 'permissions' ? 'active' : ''}`} onClick={() => setConfigTab('permissions')}>Permissions</button>
            <button className={`config-tab ${configTab === 'agents' ? 'active' : ''}`} onClick={() => setConfigTab('agents')}>Agents</button>
          </div>
        </div>
        <div className="toolbar-right">
          <span className="config-scope-info">
            {selectedProject
              ? `项目: ${selectedProject.split('/').slice(-2).join('/')}`
              : '全局配置'}
          </span>
          {selectedProjectProviders && (
            <span className="config-provider-tags">
              {selectedProjectProviders.map(p => (
                <span key={p} className="provider-badge small" style={{ background: PROVIDER_COLORS[p] }}>{PROVIDER_LABELS[p]}</span>
              ))}
            </span>
          )}
        </div>
      </header>

      {configTab === 'skills' && <SkillsView providers={providers} activeProviders={activeProviders} selectedProject={selectedProject} />}
      {configTab === 'mcp' && <McpView providers={providers} activeProviders={activeProviders} selectedProject={selectedProject} />}
      {configTab === 'rules' && <RulesView providers={providers} activeProviders={activeProviders} selectedProject={selectedProject} />}
      {configTab === 'hooks' && <HooksView activeProviders={activeProviders} selectedProject={selectedProject} />}
      {configTab === 'permissions' && <PermissionsView activeProviders={activeProviders} selectedProject={selectedProject} />}
      {configTab === 'agents' && <AgentsView providers={providers} />}
    </main>
  );
}

function AgentsView({ providers }: { providers: ProviderInfo[] }) {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<string>('claude-code');
  const [model, setModel] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [extraArgs, setExtraArgs] = useState('');

  async function load() {
    try {
      const data = await fetchAgents();
      setAgents(data.agents ?? []);
    } catch (err) {
      console.error('Failed to load agents', err);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      await createAgent({
        name: name.trim(),
        provider,
        model: model.trim() || undefined,
        workingDir: workingDir.trim() || undefined,
        extraArgs: extraArgs.trim() ? extraArgs.trim().split(/\s+/) : undefined,
      });
      setName(''); setModel(''); setWorkingDir(''); setExtraArgs('');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemove(agent: AgentProfile) {
    if (!confirm(`确定删除 Agent "${agent.name}"？`)) return;
    try {
      await deleteAgent(agent.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="config-body">
      <div className="config-section">
        <h3 className="config-section-title">Agent 启动配置</h3>
        <p className="config-section-desc">
          同一个 Agent 配置可用于两种启动模式：「新建会话」（打开终端窗口，交互式）和任务「运行」（后台无头执行，仅 Claude Code / Codex / Pi 支持无头）。
        </p>
        <div className="agents-list">
          {agents.map(a => (
            <div key={a.id} className="agent-row">
              <span className="provider-badge small" style={{ background: PROVIDER_COLORS[a.provider] }}>
                {PROVIDER_LABELS[a.provider]}
              </span>
              <span className="agent-name">{a.name}{a.builtin ? '（内置）' : ''}</span>
              {a.headless
                ? <span className="agent-headless-badge">无头 ✓</span>
                : <span className="agent-headless-badge off">仅交互</span>}
              {a.model && <span className="agent-meta">model: {a.model}</span>}
              {a.workingDir && <span className="agent-meta" title={a.workingDir}>dir: {a.workingDir}</span>}
              {a.extraArgs && a.extraArgs.length > 0 && <span className="agent-meta" title={a.extraArgs.join(' ')}>args: {a.extraArgs.join(' ')}</span>}
              <span className="agent-spacer" />
              {!a.builtin && (
                <button className="form-btn" onClick={() => void handleRemove(a)}>删除</button>
              )}
            </div>
          ))}
        </div>

        <h4 className="config-section-title">新建 Agent</h4>
        <div className="agent-form">
          <input className="form-input" placeholder="名称，如 claude-只读" value={name} onChange={e => setName(e.target.value)} />
          <select className="form-select" value={provider} onChange={e => setProvider(e.target.value)}>
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="form-input" placeholder="模型（可选）" value={model} onChange={e => setModel(e.target.value)} />
          <input className="form-input" placeholder="工作目录（可选，默认取任务项目目录）" value={workingDir} onChange={e => setWorkingDir(e.target.value)} />
          <input className="form-input" placeholder="额外参数（可选，空格分隔，如 --permission-mode plan）" value={extraArgs} onChange={e => setExtraArgs(e.target.value)} />
          <button className="form-btn primary" disabled={!name.trim()} onClick={() => void handleAdd()}>添加</button>
        </div>
      </div>
    </div>
  );
}

function SkillsView({ providers, activeProviders, selectedProject }: { providers: ProviderInfo[]; activeProviders: CliProvider[]; selectedProject?: string }) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [skillContent, setSkillContent] = useState<string>('');
  const [contentLoading, setContentLoading] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSkills();
  }, [activeProviders.join(','), selectedProject]);

  async function loadSkills() {
    setLoading(true);
    const allSkills: SkillInfo[] = [];
    for (const provider of activeProviders) {
      const params: Record<string, string> = { provider };
      if (selectedProject) params.project = selectedProject;
      const data = await fetchSkills(params);
      if (data.skills) allSkills.push(...data.skills);
    }
    allSkills.sort((a, b) => a.name.localeCompare(b.name));
    setSkills(allSkills);
    setLoading(false);
  }

  async function handleSelect(skill: SkillInfo) {
    setSelectedSkill(skill);
    setContentLoading(true);
    const params: Record<string, string> = { scope: skill.scope };
    if (skill.scope === 'project' && selectedProject) params.project = selectedProject;
    const data = await fetchSkillContent(skill.provider, skill.id, params);
    setSkillContent(data.content ?? '');
    setContentLoading(false);
  }

  async function handleCopy(skill: SkillInfo, toProvider: CliProvider) {
    await copySkillApi(skill.provider, toProvider, skill.id);
    await loadSkills();
  }

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="config-loading">加载中...</div>;

  const groupedByProvider = activeProviders
    .filter(p => skills.some(s => s.provider === p))
    .map(providerId => {
      const providerSkills = skills.filter(s => s.provider === providerId);
      const globalSkills = providerSkills.filter(s => s.scope === 'global');
      const projectSkills = providerSkills.filter(s => s.scope === 'project');
      const globalBaseDir = globalSkills[0]?.directory.replace(/\/[^/]+$/, '') || '';
      const projectBaseDir = projectSkills[0]?.directory.replace(/\/[^/]+$/, '') || '';
      return { providerId, globalSkills, projectSkills, globalBaseDir, projectBaseDir };
    });

  return (
    <div className="config-body skills-layout">
      <div className="skills-list-area">
        <div className="config-stats">
          <span className="config-stat-item config-stat-total">{skills.length} skills</span>
        </div>

        <div className="skills-grouped">
          {groupedByProvider.map(({ providerId, globalSkills, projectSkills, globalBaseDir, projectBaseDir }) => (
            <div key={providerId} className="skills-provider-group">
              <div className="skills-provider-header">
                <span className="provider-badge" style={{ background: PROVIDER_COLORS[providerId] }}>
                  {PROVIDER_LABELS[providerId]}
                </span>
                <span className="skills-provider-count">{globalSkills.length + projectSkills.length}</span>
              </div>

              {projectSkills.length > 0 && (
                <div className="skills-scope-section">
                  <div className="skills-scope-label" onClick={() => toggleSection(`${providerId}:project`)}>
                    <svg className={`scope-chevron ${collapsedSections.has(`${providerId}:project`) ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    <span className="scope-badge project">项目</span>
                    <span className="skills-scope-count">{projectSkills.length}</span>
                    <span className="skills-scope-dir" title={projectBaseDir}>{projectBaseDir}</span>
                  </div>
                  {!collapsedSections.has(`${providerId}:project`) && (
                    <div className="skill-grid">
                      {projectSkills.map(skill => (
                        <SkillCard
                          key={`${skill.provider}:project:${skill.id}`}
                          skill={skill}
                          isSelected={selectedSkill?.provider === skill.provider && selectedSkill?.id === skill.id && selectedSkill?.scope === skill.scope}
                          providers={providers}
                          onSelect={handleSelect}
                          onCopy={handleCopy}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {globalSkills.length > 0 && (
                <div className="skills-scope-section">
                  <div className="skills-scope-label" onClick={() => toggleSection(`${providerId}:global`)}>
                    <svg className={`scope-chevron ${collapsedSections.has(`${providerId}:global`) ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    <span className="scope-badge global">全局</span>
                    <span className="skills-scope-count">{globalSkills.length}</span>
                    <span className="skills-scope-dir" title={globalBaseDir}>{globalBaseDir}</span>
                  </div>
                  {!collapsedSections.has(`${providerId}:global`) && (
                    <div className="skill-grid">
                      {globalSkills.map(skill => (
                        <SkillCard
                          key={`${skill.provider}:global:${skill.id}`}
                          skill={skill}
                          isSelected={selectedSkill?.provider === skill.provider && selectedSkill?.id === skill.id && selectedSkill?.scope === skill.scope}
                          providers={providers}
                          onSelect={handleSelect}
                          onCopy={handleCopy}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {groupedByProvider.length === 0 && (
            <div className="config-empty">暂无 Skills</div>
          )}
        </div>
      </div>

      {selectedSkill && (
        <aside className="skill-detail-panel">
          <div className="skill-detail-header">
            <div className="skill-detail-title">
              <h3>{selectedSkill.name}</h3>
              {selectedSkill.version && <span className="skill-version">v{selectedSkill.version}</span>}
              <span className="provider-badge" style={{ background: PROVIDER_COLORS[selectedSkill.provider] }}>
                {PROVIDER_LABELS[selectedSkill.provider]}
              </span>
              <span className={`scope-badge ${selectedSkill.scope}`}>
                {selectedSkill.scope === 'global' ? '全局' : '项目'}
              </span>
            </div>
            <button className="close-btn" onClick={() => setSelectedSkill(null)}>✕</button>
          </div>
          {selectedSkill.description && (
            <div className="skill-detail-desc">{selectedSkill.description}</div>
          )}
          <div className="skill-detail-path" title={selectedSkill.directory}>{selectedSkill.directory}</div>
          <div className="skill-detail-content">
            {contentLoading ? (
              <div className="config-loading-small">加载中...</div>
            ) : (
              <pre className="skill-content-pre">{skillContent}</pre>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function SkillCard({ skill, isSelected, providers, onSelect, onCopy }: {
  skill: SkillInfo;
  isSelected: boolean;
  providers: ProviderInfo[];
  onSelect: (s: SkillInfo) => void;
  onCopy: (s: SkillInfo, to: CliProvider) => void;
}) {
  const otherProviders = providers.filter(p => p.id !== skill.provider && p.id !== 'codex');
  return (
    <div className={`skill-card ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(skill)}>
      <div className="skill-card-header">
        <div className="skill-card-title">
          <span className="skill-name">{skill.name}</span>
          {skill.version && <span className="skill-version">v{skill.version}</span>}
        </div>
      </div>
      {skill.description && <div className="skill-card-desc">{skill.description}</div>}
      <div className="skill-card-path" title={skill.directory}>{skill.directory}</div>
      {otherProviders.length > 0 && (
        <div className="skill-card-actions">
          {otherProviders.map(p => (
            <button key={p.id} className="skill-action-btn" onClick={(e) => { e.stopPropagation(); onCopy(skill, p.id); }} title={`复制到 ${p.name}`}>
              → {PROVIDER_LABELS[p.id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function McpView({ providers, activeProviders, selectedProject }: { providers: ProviderInfo[]; activeProviders: CliProvider[]; selectedProject?: string }) {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingServer, setEditingServer] = useState<McpServerInfo | null>(null);
  const [editJson, setEditJson] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServerId, setNewServerId] = useState('');
  const [newServerProvider, setNewServerProvider] = useState<CliProvider>('claude-code');
  const [newServerJson, setNewServerJson] = useState('{\n  "command": "",\n  "args": []\n}');
  const [newServerScope, setNewServerScope] = useState<'global' | 'project'>('global');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadServers();
  }, [selectedProject, activeProviders.join(',')]);

  async function loadServers() {
    setLoading(true);
    const allServers: McpServerInfo[] = [];
    for (const provider of activeProviders) {
      if (provider === 'codex') continue;
      const params: Record<string, string> = { provider };
      if (selectedProject) params.project = selectedProject;
      const data = await fetchMcpServers(params);
      if (data.servers) allServers.push(...data.servers);
    }
    setServers(allServers);
    setLoading(false);
  }

  async function handleDelete(server: McpServerInfo) {
    if (!confirm(`确定删除 MCP server "${server.id}"?`)) return;
    const params = server.scope === 'project' && selectedProject ? { project: selectedProject } : undefined;
    await deleteMcpServerApi(server.provider, server.id, params);
    await loadServers();
  }

  async function handleCopy(server: McpServerInfo, toProvider: CliProvider) {
    await copyMcpServerApi(server.provider, toProvider, server.id);
    await loadServers();
  }

  function handleEdit(server: McpServerInfo) {
    const config: any = {};
    if (server.command) config.command = server.command;
    if (server.args) config.args = server.args;
    if (server.url) config.url = server.url;
    if (server.env && Object.keys(server.env).length > 0) config.env = server.env;
    setEditingServer(server);
    setEditJson(JSON.stringify(config, null, 2));
  }

  async function handleSaveEdit() {
    if (!editingServer) return;
    try {
      const config = JSON.parse(editJson);
      const project = editingServer.scope === 'project' ? selectedProject : undefined;
      await updateMcpServerApi(editingServer.provider, editingServer.id, { config, project });
      setEditingServer(null);
      await loadServers();
    } catch (e: any) {
      alert('JSON 格式错误: ' + e.message);
    }
  }

  async function handleAdd() {
    if (!newServerId.trim()) { alert('请输入 Server ID'); return; }
    try {
      const config = JSON.parse(newServerJson);
      const project = newServerScope === 'project' ? selectedProject : undefined;
      await addMcpServerApi(newServerProvider, { id: newServerId, config, project });
      setShowAddForm(false);
      setNewServerId('');
      setNewServerJson('{\n  "command": "",\n  "args": []\n}');
      await loadServers();
    } catch (e: any) {
      alert('JSON 格式错误: ' + e.message);
    }
  }

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="config-loading">加载中...</div>;

  const PROVIDER_HOME: Record<CliProvider, string> = {
    'claude-code': '~/.claude',
    'qoder': '~/.qoder',
    'codex': '~/.codex',
    'kimi': '~/.kimi',
    'pi': '~/.pi',
    'opencode': '~/.opencode',
    'workbuddy': '~/.workbuddy',
    'traecode': '~/.traecode',
  };

  const groupedByProvider = activeProviders
    .filter(p => p !== 'codex' && servers.some(s => s.provider === p))
    .map(providerId => {
      const providerServers = servers.filter(s => s.provider === providerId);
      const globalServers = providerServers.filter(s => s.scope === 'global');
      const projectServers = providerServers.filter(s => s.scope === 'project');
      const globalConfigPath = `${PROVIDER_HOME[providerId]}/settings.json`;
      const projectConfigPath = selectedProject ? `${selectedProject}/.mcp.json` : '';
      return { providerId, globalServers, projectServers, globalConfigPath, projectConfigPath };
    });

  return (
    <div className="config-body mcp-grouped-body">
      <div className="config-toolbar">
        <span className="config-stat-item config-stat-total">{servers.length} servers</span>
        <button className="config-add-btn" onClick={() => setShowAddForm(true)}>+ 添加 Server</button>
      </div>

      <div className="skills-grouped">
        {groupedByProvider.map(({ providerId, globalServers, projectServers, globalConfigPath, projectConfigPath }) => (
          <div key={providerId} className="skills-provider-group">
            <div className="skills-provider-header">
              <span className="provider-badge" style={{ background: PROVIDER_COLORS[providerId] }}>
                {PROVIDER_LABELS[providerId]}
              </span>
              <span className="skills-provider-count">{globalServers.length + projectServers.length}</span>
            </div>

            {projectServers.length > 0 && (
              <div className="skills-scope-section">
                <div className="skills-scope-label" onClick={() => toggleSection(`mcp:${providerId}:project`)}>
                  <svg className={`scope-chevron ${collapsedSections.has(`mcp:${providerId}:project`) ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  <span className="scope-badge project">项目</span>
                  <span className="skills-scope-count">{projectServers.length}</span>
                  <span className="skills-scope-dir" title={projectConfigPath}>{projectConfigPath}</span>
                </div>
                {!collapsedSections.has(`mcp:${providerId}:project`) && (
                  <div className="mcp-server-list">
                    {projectServers.map(server => (
                      <McpServerRow key={`${server.provider}:project:${server.id}`} server={server} providers={providers} onEdit={handleEdit} onCopy={handleCopy} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {globalServers.length > 0 && (
              <div className="skills-scope-section">
                <div className="skills-scope-label" onClick={() => toggleSection(`mcp:${providerId}:global`)}>
                  <svg className={`scope-chevron ${collapsedSections.has(`mcp:${providerId}:global`) ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  <span className="scope-badge global">全局</span>
                  <span className="skills-scope-count">{globalServers.length}</span>
                  <span className="skills-scope-dir" title={globalConfigPath}>{globalConfigPath}</span>
                </div>
                {!collapsedSections.has(`mcp:${providerId}:global`) && (
                  <div className="mcp-server-list">
                    {globalServers.map(server => (
                      <McpServerRow key={`${server.provider}:global:${server.id}`} server={server} providers={providers} onEdit={handleEdit} onCopy={handleCopy} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {groupedByProvider.length === 0 && (
          <div className="config-empty">暂无 MCP Servers</div>
        )}
      </div>

      {/* Edit Modal */}
      {editingServer && (
        <div className="overlay-backdrop" onClick={() => setEditingServer(null)}>
          <div className="overlay-panel mcp-form-modal" onClick={e => e.stopPropagation()}>
            <div className="overlay-header">
              <h3>编辑: {editingServer.id}</h3>
              <button className="close-btn" onClick={() => setEditingServer(null)}>✕</button>
            </div>
            <div className="overlay-body">
              <label className="form-label">配置 (JSON)</label>
              <textarea className="mcp-json-editor" value={editJson} onChange={e => setEditJson(e.target.value)} rows={12} />
              <div className="form-actions">
                <button className="form-btn primary" onClick={handleSaveEdit}>保存</button>
                <button className="form-btn" onClick={() => setEditingServer(null)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddForm && (
        <div className="overlay-backdrop" onClick={() => setShowAddForm(false)}>
          <div className="overlay-panel mcp-form-modal" onClick={e => e.stopPropagation()}>
            <div className="overlay-header">
              <h3>添加 MCP Server</h3>
              <button className="close-btn" onClick={() => setShowAddForm(false)}>✕</button>
            </div>
            <div className="overlay-body">
              <label className="form-label">Server ID</label>
              <input className="form-input" value={newServerId} onChange={e => setNewServerId(e.target.value)} placeholder="my-server" />

              <label className="form-label">Provider</label>
              <select className="form-select" value={newServerProvider} onChange={e => setNewServerProvider(e.target.value as CliProvider)}>
                {providers.filter(p => p.id !== 'codex').map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {selectedProject && (
                <>
                  <label className="form-label">范围</label>
                  <select className="form-select" value={newServerScope} onChange={e => setNewServerScope(e.target.value as 'global' | 'project')}>
                    <option value="global">全局</option>
                    <option value="project">项目级</option>
                  </select>
                </>
              )}

              <label className="form-label">配置 (JSON)</label>
              <textarea className="mcp-json-editor" value={newServerJson} onChange={e => setNewServerJson(e.target.value)} rows={8} />

              <div className="form-actions">
                <button className="form-btn primary" onClick={handleAdd}>添加</button>
                <button className="form-btn" onClick={() => setShowAddForm(false)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function McpServerRow({ server, providers, onEdit, onCopy, onDelete }: {
  server: McpServerInfo;
  providers: ProviderInfo[];
  onEdit: (s: McpServerInfo) => void;
  onCopy: (s: McpServerInfo, to: CliProvider) => void;
  onDelete: (s: McpServerInfo) => void;
}) {
  const otherProviders = providers.filter(p => p.id !== server.provider && p.id !== 'codex');
  const cmdText = server.command ? `${server.command} ${(server.args || []).join(' ')}`.trim() : server.url || '';
  return (
    <div className="mcp-server-row">
      <div className="mcp-server-info">
        <span className="mcp-server-name">{server.id}</span>
        <span className="mcp-server-type">{server.type}</span>
        <span className={`status-dot ${server.status}`} />
      </div>
      <div className="mcp-server-cmd" title={cmdText}>{cmdText || '-'}</div>
      <div className="mcp-server-actions">
        <button className="mcp-action-btn" onClick={() => onEdit(server)}>编辑</button>
        {otherProviders.map(p => (
          <button key={p.id} className="mcp-action-btn" onClick={() => onCopy(server, p.id)} title={`复制到 ${p.name}`}>→{PROVIDER_LABELS[p.id]}</button>
        ))}
        <button className="mcp-action-btn danger" onClick={() => onDelete(server)}>删除</button>
      </div>
    </div>
  );
}

function RulesView({ providers, activeProviders, selectedProject }: { providers: ProviderInfo[]; activeProviders: CliProvider[]; selectedProject?: string }) {
  const [files, setFiles] = useState<RuleFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<RuleFile | null>(null);
  const [content, setContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFiles();
  }, [selectedProject, activeProviders.join(',')]);

  async function loadFiles() {
    setLoading(true);
    const allFiles: RuleFile[] = [];
    for (const provider of activeProviders) {
      if (provider === 'codex') continue;
      const params: Record<string, string> = { provider };
      if (selectedProject) params.project = selectedProject;
      const data = await fetchRules(params);
      if (data.files) allFiles.push(...data.files);
    }
    setFiles(allFiles);
    setLoading(false);
    setSelectedFile(null);
    setDirty(false);
  }

  async function handleSelectFile(file: RuleFile) {
    setSelectedFile(file);
    setDirty(false);
    setContentLoading(true);
    const data = await fetchRuleContent(file.path);
    setContent(data.content ?? '');
    setContentLoading(false);
  }

  async function handleSave() {
    if (!selectedFile) return;
    setSaving(true);
    await saveRuleContentApi(selectedFile.path, content);
    setSaving(false);
    setDirty(false);
    if (!selectedFile.exists) {
      await loadFiles();
    }
  }

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="config-loading">加载中...</div>;

  const groupedByProvider = activeProviders
    .filter(p => p !== 'codex' && files.some(f => f.provider === p))
    .map(providerId => {
      const providerFiles = files.filter(f => f.provider === providerId);
      const globalFiles = providerFiles.filter(f => f.scope === 'global');
      const projectFiles = providerFiles.filter(f => f.scope === 'project');
      return { providerId, globalFiles, projectFiles };
    });

  return (
    <div className="config-body rules-editor">
      <div className="rules-file-list">
        <div className="skills-grouped rules-grouped-list">
          {groupedByProvider.map(({ providerId, globalFiles, projectFiles }) => (
            <div key={providerId} className="rules-provider-group">
              <div className="rules-provider-header">
                <span className="provider-badge small" style={{ background: PROVIDER_COLORS[providerId] }}>
                  {PROVIDER_LABELS[providerId]}
                </span>
              </div>

              {projectFiles.length > 0 && (
                <div className="rules-scope-section">
                  <div className="rules-scope-label" onClick={() => toggleSection(`rules:${providerId}:project`)}>
                    <svg className={`scope-chevron ${collapsedSections.has(`rules:${providerId}:project`) ? 'collapsed' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    <span className="scope-badge project">项目</span>
                  </div>
                  {!collapsedSections.has(`rules:${providerId}:project`) && (
                    <div className="rules-file-items">
                      {projectFiles.map(file => (
                        <div
                          key={file.id}
                          className={`rules-file-item ${selectedFile?.id === file.id ? 'active' : ''} ${!file.exists ? 'not-exists' : ''}`}
                          onClick={() => handleSelectFile(file)}
                        >
                          <span className="rules-file-name">{file.name}</span>
                          {!file.exists && <span className="rules-new-badge">新建</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {globalFiles.length > 0 && (
                <div className="rules-scope-section">
                  <div className="rules-scope-label" onClick={() => toggleSection(`rules:${providerId}:global`)}>
                    <svg className={`scope-chevron ${collapsedSections.has(`rules:${providerId}:global`) ? 'collapsed' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    <span className="scope-badge global">全局</span>
                  </div>
                  {!collapsedSections.has(`rules:${providerId}:global`) && (
                    <div className="rules-file-items">
                      {globalFiles.map(file => (
                        <div
                          key={file.id}
                          className={`rules-file-item ${selectedFile?.id === file.id ? 'active' : ''} ${!file.exists ? 'not-exists' : ''}`}
                          onClick={() => handleSelectFile(file)}
                        >
                          <span className="rules-file-name">{file.name}</span>
                          {!file.exists && <span className="rules-new-badge">新建</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rules-content-area">
        {selectedFile ? (
          <>
            <div className="rules-content-header">
              <div className="rules-content-meta">
                <span className="provider-badge small" style={{ background: PROVIDER_COLORS[selectedFile.provider] }}>
                  {PROVIDER_LABELS[selectedFile.provider]}
                </span>
                <span className={`scope-badge ${selectedFile.scope}`}>{selectedFile.scope === 'global' ? '全局' : '项目'}</span>
                <span className="rules-content-path">{selectedFile.path}</span>
              </div>
              <div className="rules-content-actions">
                {dirty && <span className="rules-unsaved">未保存</span>}
                <button className="form-btn primary" onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
            {contentLoading ? (
              <div className="config-loading-small">加载中...</div>
            ) : (
              <textarea
                className="rules-content-editor"
                value={content}
                onChange={e => { setContent(e.target.value); setDirty(true); }}
                placeholder={selectedFile.exists ? '' : '输入内容创建新文件...'}
              />
            )}
          </>
        ) : (
          <div className="rules-empty">选择左侧文件进行查看或编辑</div>
        )}
      </div>
    </div>
  );
}

interface HooksConfigData {
  provider: CliProvider;
  scope: 'global' | 'project';
  configPath: string;
  events: { event: string; matchers: { matcher: string; hooks: { type: string; command?: string; url?: string; timeout?: number }[] }[] }[];
}

function HooksView({ activeProviders, selectedProject }: { activeProviders: CliProvider[]; selectedProject?: string }) {
  const [configs, setConfigs] = useState<HooksConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadHooks();
  }, [activeProviders.join(','), selectedProject]);

  async function loadHooks() {
    setLoading(true);
    const allConfigs: HooksConfigData[] = [];
    for (const provider of activeProviders) {
      if (provider === 'codex') continue;
      const params: Record<string, string> = { provider };
      if (selectedProject) params.project = selectedProject;
      const data = await fetchHooks(params);
      if (data.configs) allConfigs.push(...data.configs);
    }
    setConfigs(allConfigs);
    setLoading(false);
  }

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="config-loading">加载中...</div>;

  const groupedByProvider = activeProviders
    .filter(p => p !== 'codex' && configs.some(c => c.provider === p))
    .map(providerId => {
      const providerConfigs = configs.filter(c => c.provider === providerId);
      const projectConfigs = providerConfigs.filter(c => c.scope === 'project');
      const globalConfigs = providerConfigs.filter(c => c.scope === 'global');
      return { providerId, projectConfigs, globalConfigs };
    });

  const totalEvents = configs.reduce((sum, c) => sum + c.events.length, 0);

  return (
    <div className="config-body mcp-grouped-body">
      <div className="config-stats">
        <span className="config-stat-item config-stat-total">{totalEvents} hook events</span>
      </div>

      <div className="skills-grouped">
        {groupedByProvider.map(({ providerId, projectConfigs, globalConfigs }) => (
          <div key={providerId} className="skills-provider-group">
            <div className="skills-provider-header">
              <span className="provider-badge" style={{ background: PROVIDER_COLORS[providerId] }}>
                {PROVIDER_LABELS[providerId]}
              </span>
            </div>

            {projectConfigs.map((config, idx) => (
              <div key={`project-${idx}`} className="skills-scope-section">
                <div className="skills-scope-label" onClick={() => toggleSection(`hooks:${providerId}:project:${idx}`)}>
                  <svg className={`scope-chevron ${collapsedSections.has(`hooks:${providerId}:project:${idx}`) ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  <span className="scope-badge project">项目</span>
                  <span className="skills-scope-count">{config.events.length} events</span>
                  <span className="skills-scope-dir" title={config.configPath}>{config.configPath}</span>
                </div>
                {!collapsedSections.has(`hooks:${providerId}:project:${idx}`) && (
                  <div className="hooks-event-list">
                    {config.events.map(ev => (
                      <HookEventItem key={ev.event} event={ev} />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {globalConfigs.map((config, idx) => (
              <div key={`global-${idx}`} className="skills-scope-section">
                <div className="skills-scope-label" onClick={() => toggleSection(`hooks:${providerId}:global:${idx}`)}>
                  <svg className={`scope-chevron ${collapsedSections.has(`hooks:${providerId}:global:${idx}`) ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  <span className="scope-badge global">全局</span>
                  <span className="skills-scope-count">{config.events.length} events</span>
                  <span className="skills-scope-dir" title={config.configPath}>{config.configPath}</span>
                </div>
                {!collapsedSections.has(`hooks:${providerId}:global:${idx}`) && (
                  <div className="hooks-event-list">
                    {config.events.map(ev => (
                      <HookEventItem key={ev.event} event={ev} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {groupedByProvider.length === 0 && (
          <div className="config-empty">暂无 Hooks 配置</div>
        )}
      </div>
    </div>
  );
}

function HookEventItem({ event }: { event: { event: string; matchers: { matcher: string; hooks: { type: string; command?: string; url?: string; timeout?: number }[] }[] } }) {
  return (
    <div className="hook-event-item">
      <div className="hook-event-name">{event.event}</div>
      <div className="hook-matchers">
        {event.matchers.map((m, i) => (
          <div key={i} className="hook-matcher">
            <span className="hook-matcher-label">{m.matcher === '*' ? '所有工具' : m.matcher}</span>
            <div className="hook-entries">
              {m.hooks.map((h, j) => (
                <div key={j} className="hook-entry">
                  <span className="hook-entry-type">{h.type}</span>
                  <span className="hook-entry-cmd">{h.command || h.url || '-'}</span>
                  {h.timeout && <span className="hook-entry-timeout">{h.timeout}s</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PermissionsConfigData {
  provider: CliProvider;
  scope: 'global' | 'project';
  configPath: string;
  allow: string[];
  deny: string[];
  additionalDirectories?: string[];
}

function PermissionsView({ activeProviders, selectedProject }: { activeProviders: CliProvider[]; selectedProject?: string }) {
  const [configs, setConfigs] = useState<PermissionsConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPermissions();
  }, [activeProviders.join(','), selectedProject]);

  async function loadPermissions() {
    setLoading(true);
    const allConfigs: PermissionsConfigData[] = [];
    for (const provider of activeProviders) {
      if (provider === 'codex') continue;
      const params: Record<string, string> = { provider };
      if (selectedProject) params.project = selectedProject;
      const data = await fetchPermissions(params);
      if (data.configs) allConfigs.push(...data.configs);
    }
    setConfigs(allConfigs);
    setLoading(false);
  }

  function toggleSection(key: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="config-loading">加载中...</div>;

  const groupedByProvider = activeProviders
    .filter(p => p !== 'codex' && configs.some(c => c.provider === p))
    .map(providerId => {
      const providerConfigs = configs.filter(c => c.provider === providerId);
      const projectConfigs = providerConfigs.filter(c => c.scope === 'project');
      const globalConfigs = providerConfigs.filter(c => c.scope === 'global');
      return { providerId, projectConfigs, globalConfigs };
    });

  const totalRules = configs.reduce((sum, c) => sum + c.allow.length + c.deny.length, 0);

  return (
    <div className="config-body mcp-grouped-body">
      <div className="config-stats">
        <span className="config-stat-item config-stat-total">{totalRules} rules</span>
      </div>

      <div className="skills-grouped">
        {groupedByProvider.map(({ providerId, projectConfigs, globalConfigs }) => (
          <div key={providerId} className="skills-provider-group">
            <div className="skills-provider-header">
              <span className="provider-badge" style={{ background: PROVIDER_COLORS[providerId] }}>
                {PROVIDER_LABELS[providerId]}
              </span>
            </div>

            {projectConfigs.map((config, idx) => (
              <div key={`project-${idx}`} className="skills-scope-section">
                <div className="skills-scope-label" onClick={() => toggleSection(`perms:${providerId}:project:${idx}`)}>
                  <svg className={`scope-chevron ${collapsedSections.has(`perms:${providerId}:project:${idx}`) ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  <span className="scope-badge project">项目</span>
                  <span className="skills-scope-count">{config.allow.length + config.deny.length}</span>
                  <span className="skills-scope-dir" title={config.configPath}>{config.configPath}</span>
                </div>
                {!collapsedSections.has(`perms:${providerId}:project:${idx}`) && (
                  <PermissionsList config={config} />
                )}
              </div>
            ))}

            {globalConfigs.map((config, idx) => (
              <div key={`global-${idx}`} className="skills-scope-section">
                <div className="skills-scope-label" onClick={() => toggleSection(`perms:${providerId}:global:${idx}`)}>
                  <svg className={`scope-chevron ${collapsedSections.has(`perms:${providerId}:global:${idx}`) ? 'collapsed' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  <span className="scope-badge global">全局</span>
                  <span className="skills-scope-count">{config.allow.length + config.deny.length}</span>
                  <span className="skills-scope-dir" title={config.configPath}>{config.configPath}</span>
                </div>
                {!collapsedSections.has(`perms:${providerId}:global:${idx}`) && (
                  <PermissionsList config={config} />
                )}
              </div>
            ))}
          </div>
        ))}
        {groupedByProvider.length === 0 && (
          <div className="config-empty">暂无 Permissions 配置</div>
        )}
      </div>
    </div>
  );
}

function PermissionsList({ config }: { config: PermissionsConfigData }) {
  return (
    <div className="permissions-list">
      {config.allow.length > 0 && (
        <div className="permissions-section">
          <div className="permissions-section-label allow">Allow ({config.allow.length})</div>
          <div className="permissions-items">
            {config.allow.map((rule, i) => (
              <div key={i} className="permission-item allow">{rule}</div>
            ))}
          </div>
        </div>
      )}
      {config.deny.length > 0 && (
        <div className="permissions-section">
          <div className="permissions-section-label deny">Deny ({config.deny.length})</div>
          <div className="permissions-items">
            {config.deny.map((rule, i) => (
              <div key={i} className="permission-item deny">{rule}</div>
            ))}
          </div>
        </div>
      )}
      {config.additionalDirectories && config.additionalDirectories.length > 0 && (
        <div className="permissions-section">
          <div className="permissions-section-label dirs">Additional Directories</div>
          <div className="permissions-items">
            {config.additionalDirectories.map((dir, i) => (
              <div key={i} className="permission-item dir">{dir}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
