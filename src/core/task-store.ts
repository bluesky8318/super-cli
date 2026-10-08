import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { TaskLabel, AppConfig } from './types.js';
import { getSuperCliConfigPath, getSuperCliHome } from './paths.js';

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  sessions: {},
  settings: {},
};

export class TaskStore {
  private configPath: string;
  private config: AppConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath ?? getSuperCliConfigPath();
  }

  private async load(): Promise<AppConfig> {
    if (this.config) return this.config;
    try {
      const content = await readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      return this.config!;
    } catch {
      this.config = { ...DEFAULT_CONFIG };
      return this.config;
    }
  }

  private async save(): Promise<void> {
    if (!this.config) return;
    await mkdir(getSuperCliHome(), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  async getAll(): Promise<Record<string, TaskLabel>> {
    const config = await this.load();
    return config.sessions;
  }

  async getLabel(sessionId: string): Promise<TaskLabel | null> {
    const config = await this.load();
    return config.sessions[sessionId] ?? null;
  }

  async setLabel(sessionId: string, label: string): Promise<void> {
    const config = await this.load();
    const existing = config.sessions[sessionId];
    config.sessions[sessionId] = {
      label,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      tags: existing?.tags,
    };
    await this.save();
  }

  async removeLabel(sessionId: string): Promise<void> {
    const config = await this.load();
    delete config.sessions[sessionId];
    await this.save();
  }

  async addTag(sessionId: string, tag: string): Promise<void> {
    const config = await this.load();
    const existing = config.sessions[sessionId];
    if (!existing) throw new Error(`Session "${sessionId}" has no label. Set a label first.`);
    existing.tags = [...new Set([...(existing.tags ?? []), tag])];
    await this.save();
  }

  async removeTag(sessionId: string, tag: string): Promise<void> {
    const config = await this.load();
    const existing = config.sessions[sessionId];
    if (!existing) return;
    existing.tags = (existing.tags ?? []).filter(t => t !== tag);
    await this.save();
  }

  /** Decoded project path -> short id ("p1", "p2", …). */
  async getProjectShortIds(): Promise<Record<string, string>> {
    const config = await this.load();
    return config.projectIds ?? {};
  }

  /**
   * Assign stable short ids to any project path that lacks one. Ids are
   * sequential ("p1", "p2", …) and never reused, so shared URLs stay valid.
   */
  async ensureProjectShortIds(decodedPaths: string[]): Promise<Record<string, string>> {
    const config = await this.load();
    const ids = config.projectIds ?? {};
    let next = 1;
    for (const id of Object.values(ids)) {
      const m = /^p(\d+)$/.exec(id);
      if (m) next = Math.max(next, Number(m[1]) + 1);
    }
    let changed = false;
    for (const path of decodedPaths) {
      if (!ids[path]) {
        ids[path] = `p${next++}`;
        changed = true;
      }
    }
    if (changed) {
      config.projectIds = ids;
      await this.save();
    }
    return ids;
  }
}
