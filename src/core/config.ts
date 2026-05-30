import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { AppConfig } from './types.js';
import { getSuperCliConfigPath, getSuperCliHome } from './paths.js';

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? getSuperCliConfigPath();
  }

  async load(): Promise<AppConfig> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { version: 1, sessions: {}, settings: {} };
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const config = await this.load();
    return (config.settings as Record<string, unknown>)[key] as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const config = await this.load();
    (config.settings as Record<string, unknown>)[key] = value;
    await mkdir(getSuperCliHome(), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  async getAll(): Promise<Record<string, unknown>> {
    const config = await this.load();
    return config.settings as Record<string, unknown>;
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
