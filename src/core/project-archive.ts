import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { AppConfig } from './types.js';
import { getSuperCliConfigPath, getSuperCliHome } from './paths.js';

export class ProjectArchive {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? getSuperCliConfigPath();
  }

  private async load(): Promise<AppConfig> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { version: 1, sessions: {}, settings: {} };
    }
  }

  private async save(config: AppConfig): Promise<void> {
    await mkdir(getSuperCliHome(), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  async getArchivedIds(): Promise<string[]> {
    const config = await this.load();
    return config.archivedProjects ?? [];
  }

  async isArchived(encoded: string): Promise<boolean> {
    const ids = await this.getArchivedIds();
    return ids.includes(encoded);
  }

  async archive(encoded: string): Promise<void> {
    const config = await this.load();
    const list = config.archivedProjects ?? [];
    if (!list.includes(encoded)) {
      list.push(encoded);
      config.archivedProjects = list;
      await this.save(config);
    }
  }

  async unarchive(encoded: string): Promise<void> {
    const config = await this.load();
    const list = config.archivedProjects ?? [];
    config.archivedProjects = list.filter(id => id !== encoded);
    await this.save(config);
  }

  async getPinnedIds(): Promise<string[]> {
    const config = await this.load();
    return config.pinnedProjects ?? [];
  }

  async pin(encoded: string): Promise<void> {
    const config = await this.load();
    const list = config.pinnedProjects ?? [];
    if (!list.includes(encoded)) {
      list.push(encoded);
      config.pinnedProjects = list;
      await this.save(config);
    }
  }

  async unpin(encoded: string): Promise<void> {
    const config = await this.load();
    const list = config.pinnedProjects ?? [];
    config.pinnedProjects = list.filter(id => id !== encoded);
    await this.save(config);
  }
}
