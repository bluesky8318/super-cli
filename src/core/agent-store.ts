import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { AgentProfile, AgentStoreData, CliProvider } from './types.js';
import { getSuperCliAgentsPath, getSuperCliHome } from './paths.js';
import { getAllProviders, getAvailableProviders } from './providers.js';

export class AgentNotFoundError extends Error {
  readonly code = 'AGENT_NOT_FOUND';
  constructor(id: string) {
    super(`Agent not found: ${id}`);
    this.name = 'AgentNotFoundError';
  }
}

export class AgentStateError extends Error {
  readonly code = 'AGENT_STATE';
  constructor(message: string) {
    super(message);
    this.name = 'AgentStateError';
  }
}

/** Providers whose CLI supports a non-interactive (headless) execution mode. */
export const HEADLESS_PROVIDERS: CliProvider[] = ['claude-code', 'codex', 'pi'];

export function isHeadlessProvider(provider: CliProvider): boolean {
  return HEADLESS_PROVIDERS.includes(provider);
}

const DEFAULT_DATA: AgentStoreData = {
  version: 1,
  agents: {},
};

export interface CreateAgentInput {
  name: string;
  provider: CliProvider;
  model?: string;
  workingDir?: string;
  extraArgs?: string[];
  env?: Record<string, string>;
}

export interface UpdateAgentInput {
  name?: string;
  model?: string | null;
  workingDir?: string | null;
  extraArgs?: string[] | null;
  env?: Record<string, string> | null;
}

export class AgentStore {
  private dataPath: string;
  private data: AgentStoreData | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(dataPath?: string) {
    this.dataPath = dataPath ?? getSuperCliAgentsPath();
  }

  private async load(): Promise<AgentStoreData> {
    if (this.data) return this.data;
    try {
      const content = await readFile(this.dataPath, 'utf-8');
      this.data = { ...DEFAULT_DATA, ...JSON.parse(content) };
    } catch {
      this.data = { ...DEFAULT_DATA };
    }
    await this.ensureBuiltinProfiles();
    return this.data!;
  }

  /** Create one builtin profile per installed provider; migrate legacy naming; prune builtins for uninstalled providers. */
  private async ensureBuiltinProfiles(): Promise<void> {
    const data = this.data!;
    const now = new Date().toISOString();
    let changed = false;
    const available = new Set(getAvailableProviders().map(p => p.id));
    for (const agent of Object.values(data.agents)) {
      if (!agent.builtin) continue;
      if (!available.has(agent.provider)) {
        // Builtin profiles are generated, not user data: drop ones whose CLI is not installed.
        delete data.agents[agent.id];
        changed = true;
        continue;
      }
      const provider = getAllProviders().find(p => p.id === agent.provider);
      // Migrate the initial "X 默认" naming to the plain provider name.
      if (provider && agent.name === `${provider.name} 默认`) {
        agent.name = provider.name;
        agent.updatedAt = now;
        changed = true;
      }
    }
    for (const p of getAllProviders()) {
      if (!available.has(p.id)) continue;
      const exists = Object.values(data.agents).some(a => a.builtin && a.provider === p.id);
      if (exists) continue;
      const profile: AgentProfile = {
        id: randomUUID(),
        name: p.name,
        provider: p.id,
        // Interactive launches use the provider registry defaults; keep extraArgs
        // empty so the profile tracks providers.ts updates.
        extraArgs: [],
        builtin: true,
        createdAt: now,
        updatedAt: now,
      };
      data.agents[profile.id] = profile;
      changed = true;
    }
    if (changed) await this.save();
  }

  private save(): Promise<void> {
    const data = this.data;
    const task = this.writeQueue.then(async () => {
      if (!data) return;
      await mkdir(getSuperCliHome(), { recursive: true });
      await writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
    });
    this.writeQueue = task.catch(() => {});
    return task;
  }

  async resolveAgent(idOrName: string): Promise<AgentProfile | null> {
    const data = await this.load();
    if (data.agents[idOrName]) return data.agents[idOrName];
    const byName = Object.values(data.agents).filter(a => a.name === idOrName);
    if (byName.length === 1) return byName[0];
    const matches = Object.values(data.agents).filter(a => a.id.startsWith(idOrName));
    return matches.length === 1 ? matches[0] : null;
  }

  async getAgent(idOrName: string): Promise<AgentProfile> {
    const agent = await this.resolveAgent(idOrName);
    if (!agent) throw new AgentNotFoundError(idOrName);
    return agent;
  }

  async listAgents(): Promise<AgentProfile[]> {
    const data = await this.load();
    return Object.values(data.agents).sort((a, b) =>
      Number(b.builtin ?? false) - Number(a.builtin ?? false) || a.createdAt.localeCompare(b.createdAt),
    );
  }

  async createAgent(input: CreateAgentInput): Promise<AgentProfile> {
    const data = await this.load();
    if (!input.name?.trim()) throw new AgentStateError('Agent name is required');
    if (!getAllProviders().some(p => p.id === input.provider)) {
      throw new AgentStateError(`Unknown provider: ${input.provider}`);
    }
    if (Object.values(data.agents).some(a => a.name === input.name.trim())) {
      throw new AgentStateError(`Agent name already exists: ${input.name}`);
    }
    const now = new Date().toISOString();
    const agent: AgentProfile = {
      id: randomUUID(),
      name: input.name.trim(),
      provider: input.provider,
      model: input.model,
      workingDir: input.workingDir,
      extraArgs: input.extraArgs,
      env: input.env,
      createdAt: now,
      updatedAt: now,
    };
    data.agents[agent.id] = agent;
    await this.save();
    return agent;
  }

  async updateAgent(idOrName: string, patch: UpdateAgentInput): Promise<AgentProfile> {
    await this.load();
    const agent = await this.getAgent(idOrName);
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new AgentStateError('Agent name cannot be empty');
      agent.name = patch.name.trim();
    }
    if (patch.model !== undefined) agent.model = patch.model === null ? undefined : patch.model;
    if (patch.workingDir !== undefined) agent.workingDir = patch.workingDir === null ? undefined : patch.workingDir;
    if (patch.extraArgs !== undefined) agent.extraArgs = patch.extraArgs === null ? undefined : patch.extraArgs;
    if (patch.env !== undefined) agent.env = patch.env === null ? undefined : patch.env;
    agent.updatedAt = new Date().toISOString();
    await this.save();
    return agent;
  }

  async removeAgent(idOrName: string): Promise<void> {
    const data = await this.load();
    const agent = await this.getAgent(idOrName);
    if (agent.builtin) throw new AgentStateError('Builtin agent profiles cannot be removed');
    delete data.agents[agent.id];
    await this.save();
  }
}
