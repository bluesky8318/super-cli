import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentProfile, CliProvider, Issue, IssueRun } from './types.js';
import { getProvider } from './providers.js';
import { isHeadlessProvider } from './agent-store.js';
import { getSuperCliRunsDir, resolveIssueProjectPath } from './paths.js';
import { IssueStore } from './issue-store.js';

export class RunStateError extends Error {
  readonly code = 'RUN_STATE';
  constructor(message: string) {
    super(message);
    this.name = 'RunStateError';
  }
}

export interface RunEvent {
  type: 'run.started' | 'run.finished' | 'run.output';
  run: IssueRun;
  chunk?: string;
}

interface ActiveRun {
  run: IssueRun;
  child: ChildProcess;
}

/** Build the headless CLI invocation for a provider. Returns argv (without command). */
export function buildHeadlessArgs(profile: AgentProfile, prompt: string, piSessionId?: string): string[] {
  const provider = getProvider(profile.provider);
  // Explicit profile extraArgs win; otherwise fall back to the provider registry
  // defaults (e.g. claude's --dangerously-skip-permissions) which are required
  // for unattended execution.
  const base = profile.extraArgs && profile.extraArgs.length > 0 ? profile.extraArgs : provider.newArgs;
  const modelArgs = buildModelArgs(profile);
  switch (profile.provider) {
    case 'claude-code':
      return [...base, ...modelArgs, '-p', prompt, '--output-format', 'json'];
    case 'codex':
      return ['exec', ...base, ...modelArgs, '--json', prompt];
    case 'pi':
      return ['--mode', 'json', ...(piSessionId ? ['--session-id', piSessionId] : []), ...base, ...modelArgs, prompt];
    default:
      throw new RunStateError(`Provider ${profile.provider} does not support headless execution`);
  }
}

export function buildModelArgs(profile: Pick<AgentProfile, 'provider' | 'model'>): string[] {
  if (!profile.model) return [];
  switch (profile.provider) {
    case 'codex':
      return ['-c', `model="${profile.model}"`];
    default:
      return ['--model', profile.model];
  }
}

/** Args for an interactive (terminal) launch of a profile: base args + model. */
export function buildInteractiveArgs(profile: AgentProfile): string[] {
  const provider = getProvider(profile.provider);
  const base = profile.extraArgs && profile.extraArgs.length > 0 ? profile.extraArgs : provider.newArgs;
  return [...base, ...buildModelArgs(profile)];
}

/** Extract the provider session id from captured stdout. */
export function extractSessionId(provider: CliProvider, stdout: string, piSessionId?: string): string | undefined {
  if (provider === 'pi') return piSessionId;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (provider === 'claude-code' && typeof obj.session_id === 'string') return obj.session_id;
      if (provider === 'codex') {
        if (obj.type === 'thread.started' && typeof obj.thread_id === 'string') return obj.thread_id;
        if (typeof obj.session_id === 'string') return obj.session_id;
      }
    } catch {
      // not a JSON line; keep scanning
    }
  }
  return undefined;
}

/** Build the first-turn prompt for a headless run from the issue. */
export function buildRunPrompt(issue: Issue): string {
  const parts = [
    `你正在执行 super-cli 看板任务 ${issue.identifier}。`,
    ``,
    `# ${issue.title}`,
  ];
  if (issue.description) parts.push('', issue.description);
  parts.push(
    '',
    `完成后：用 \`super-cli issue comment ${issue.identifier} --add "<进展>" --agent\` 记录结果；` +
    `需要推进状态时用 \`super-cli issue move ${issue.identifier} <status>\`（done 只能由用户移动）。`,
  );
  return parts.join('\n');
}

const MAX_RUNS_PER_ISSUE = 500;

export class TaskRunner {
  private active = new Map<string, ActiveRun>(); // issueId -> active run (one at a time)
  private onEvent?: (event: RunEvent) => void;

  constructor(
    private issueStore: IssueStore = new IssueStore(),
    private runsDir: string = getSuperCliRunsDir(),
  ) {}

  setEventListener(listener: (event: RunEvent) => void): void {
    this.onEvent = listener;
  }

  private emit(event: RunEvent): void {
    this.onEvent?.(event);
  }

  isRunning(issueId: string): boolean {
    return this.active.has(issueId);
  }

  private aliasMapCache: Map<string, string> | null = null;

  /** encoded/alias → decoded path map from the session index (verified on disk). */
  private async projectAliasMap(): Promise<Map<string, string>> {
    if (this.aliasMapCache) return this.aliasMapCache;
    const map = new Map<string, string>();
    try {
      const { SessionIndex } = await import('./session-index.js');
      const projects = await new SessionIndex().getProjects();
      for (const p of projects) {
        map.set(p.encoded, p.decoded);
        for (const a of p.aliases ?? []) map.set(a, p.decoded);
      }
    } catch {
      // index unavailable — resolution will fall back to direct candidates
    }
    this.aliasMapCache = map;
    return map;
  }

  private runsPath(issueId: string): string {
    return join(this.runsDir, `${issueId}.json`);
  }

  async listRuns(issueId: string): Promise<IssueRun[]> {
    try {
      const content = await readFile(this.runsPath(issueId), 'utf-8');
      return JSON.parse(content) as IssueRun[];
    } catch {
      return [];
    }
  }

  private async persistRun(run: IssueRun): Promise<void> {
    const runs = await this.listRuns(run.issueId);
    const idx = runs.findIndex(r => r.id === run.id);
    if (idx >= 0) runs[idx] = run;
    else runs.push(run);
    await mkdir(this.runsDir, { recursive: true });
    await writeFile(this.runsPath(run.issueId), JSON.stringify(runs.slice(-MAX_RUNS_PER_ISSUE), null, 2), 'utf-8');
  }

  /**
   * Start a headless run for an issue with the given agent profile.
   * Exactly one active run per issue; a second start is rejected.
   */
  async startRun(issue: Issue, profile: AgentProfile, opts: { onOutput?: (chunk: string) => void } = {}): Promise<IssueRun> {
    if (this.active.has(issue.id)) {
      throw new RunStateError(`Issue ${issue.identifier} already has an active run`);
    }
    if (issue.archivedAt) throw new RunStateError(`Issue ${issue.identifier} is archived`);
    if (!isHeadlessProvider(profile.provider)) {
      throw new RunStateError(`Provider ${profile.provider} does not support headless execution`);
    }
    let cwd = profile.workingDir ?? process.cwd();
    if (!profile.workingDir && issue.projectEncoded) {
      const resolved = resolveIssueProjectPath(issue.projectEncoded, await this.projectAliasMap());
      if (!resolved) {
        throw new RunStateError(`无法解析任务归属项目路径: ${issue.projectEncoded}（请重新选择项目）`);
      }
      cwd = resolved;
    }
    if (!existsSync(cwd)) throw new RunStateError(`Working directory does not exist: ${cwd}`);

    const prompt = buildRunPrompt(issue);
    const piSessionId = profile.provider === 'pi' ? randomUUID() : undefined;
    const args = buildHeadlessArgs(profile, prompt, piSessionId);
    const command = getProvider(profile.provider).command;

    const run: IssueRun = {
      id: randomUUID(),
      issueId: issue.id,
      agentId: profile.id,
      agentName: profile.name,
      provider: profile.provider,
      trigger: 'manual',
      startedAt: new Date().toISOString(),
      status: 'running',
      sessionId: piSessionId,
    };
    await this.persistRun(run);

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...profile.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const active: ActiveRun = { run, child };
    this.active.set(issue.id, active);
    this.emit({ type: 'run.started', run });

    let stdout = '';
    let stderrTail = '';
    child.stdout?.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stdout += chunk;
      opts.onOutput?.(chunk);
      this.emit({ type: 'run.output', run, chunk });
    });
    child.stderr?.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderrTail = (stderrTail + chunk).slice(-4000);
      opts.onOutput?.(chunk);
      this.emit({ type: 'run.output', run, chunk });
    });

    child.on('error', (err) => {
      void this.finishRun(issue.id, { status: 'failed', error: err.message });
    });
    child.on('close', (code) => {
      if (run.status !== 'running') return; // already settled (stop/error)
      const sessionId = extractSessionId(profile.provider, stdout, piSessionId);
      void this.finishRun(issue.id, {
        status: code === 0 ? 'success' : 'failed',
        exitCode: code ?? undefined,
        error: code === 0 ? undefined : stderrTail.trim() || undefined,
        sessionId,
      });
    });

    // Run start moves todo -> in_progress, aligned with claim semantics.
    if (issue.status === 'todo') {
      try {
        await this.issueStore.moveIssue(issue.id, 'in_progress', undefined, issue.version, 'agent');
      } catch {
        // Status move is best-effort; never fail the run over it.
      }
    }

    return run;
  }

  async stopRun(issueId: string): Promise<IssueRun> {
    const active = this.active.get(issueId);
    if (!active) throw new RunStateError('No active run for this issue');
    active.run.status = 'stopped';
    active.child.kill('SIGTERM');
    setTimeout(() => {
      if (!active.child.killed) active.child.kill('SIGKILL');
    }, 5000).unref();
    return this.finishRun(issueId, { status: 'stopped' });
  }

  private async finishRun(
    issueId: string,
    result: { status: IssueRun['status']; exitCode?: number; error?: string; sessionId?: string },
  ): Promise<IssueRun> {
    const active = this.active.get(issueId);
    if (!active) throw new RunStateError('No active run for this issue');
    this.active.delete(issueId);

    const run = active.run;
    run.status = result.status;
    run.finishedAt = new Date().toISOString();
    run.exitCode = result.exitCode;
    run.error = result.error;
    if (result.sessionId) run.sessionId = result.sessionId;
    await this.persistRun(run);

    // Audit projection on the issue: lastRunAt/runCount + session binding.
    try {
      await this.issueStore.recordRun(issueId, { sessionId: run.sessionId });
      const durationS = ((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1);
      const summary = run.status === 'success'
        ? `Agent 执行完成（${run.agentName}，耗时 ${durationS}s${run.sessionId ? `，session ${run.sessionId.slice(0, 8)}` : ''}）`
        : `Agent 执行${run.status === 'stopped' ? '已停止' : '失败'}（${run.agentName}${run.error ? `：${run.error.slice(0, 200)}` : ''}）`;
      await this.issueStore.addComment(issueId, summary, { authorType: 'agent', sessionId: run.sessionId });
    } catch {
      // Issue may have been deleted mid-run; the run record is still on disk.
    }

    this.emit({ type: 'run.finished', run });
    return run;
  }
}
