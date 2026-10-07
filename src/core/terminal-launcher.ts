import { execSync, spawn as cpSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { AgentProfile, CliProvider, TerminalType } from './types.js';
import { ConfigManager } from './config.js';
import { getProvider } from './providers.js';
import { buildInteractiveArgs } from './task-runner.js';

export interface LaunchResult {
  action: 'focused' | 'launched' | 'error';
  terminal?: string;
  pid?: number;
  message?: string;
}

export class TerminalLauncher {
  private config: ConfigManager;

  constructor(config?: ConfigManager) {
    this.config = config ?? new ConfigManager();
  }

  async resume(sessionId: string, cwd?: string, provider: CliProvider = 'claude-code'): Promise<LaunchResult> {
    const terminal = await this.getTerminal();
    const workDir = cwd && existsSync(cwd) ? cwd : undefined;
    const providerConfig = getProvider(provider);
    const args = providerConfig.resumeArgs(sessionId);
    const cmd = `${providerConfig.command} ${args.join(' ')}`;

    try {
      await this.launchInTerminal(terminal, cmd, workDir);
      return { action: 'launched', terminal };
    } catch (err: any) {
      return { action: 'error', message: err.message ?? String(err) };
    }
  }

  async launchNew(cwd: string, provider: CliProvider = 'claude-code', prompt?: string): Promise<LaunchResult> {
    const terminal = await this.getTerminal();

    if (!existsSync(cwd)) {
      return { action: 'error', message: `路径不存在: ${cwd}` };
    }

    const providerConfig = getProvider(provider);
    const parts = [providerConfig.command, ...providerConfig.newArgs];
    if (prompt && providerConfig.supportsPrompt) {
      parts.push(this.shellEscape(prompt));
    }
    const cmd = parts.join(' ');

    try {
      await this.launchInTerminal(terminal, cmd, cwd);
      return { action: 'launched', terminal };
    } catch (err: any) {
      return { action: 'error', message: err.message ?? String(err) };
    }
  }

  /** Launch an interactive terminal session from an agent profile (args/model/env overrides). */
  async launchNewWithProfile(cwd: string, profile: AgentProfile, prompt?: string): Promise<LaunchResult> {
    const terminal = await this.getTerminal();

    if (!existsSync(cwd)) {
      return { action: 'error', message: `路径不存在: ${cwd}` };
    }

    const providerConfig = getProvider(profile.provider);
    const parts = [providerConfig.command, ...buildInteractiveArgs(profile)];
    if (prompt && providerConfig.supportsPrompt) {
      parts.push(this.shellEscape(prompt));
    }
    let cmd = parts.join(' ');
    if (profile.env && Object.keys(profile.env).length > 0) {
      const prefix = Object.entries(profile.env)
        .map(([k, v]) => `${k}=${this.shellEscape(v)}`)
        .join(' ');
      cmd = `${prefix} ${cmd}`;
    }

    try {
      await this.launchInTerminal(terminal, cmd, cwd);
      return { action: 'launched', terminal };
    } catch (err: any) {
      return { action: 'error', message: err.message ?? String(err) };
    }
  }

  async openDirectory(cwd: string): Promise<LaunchResult> {
    const terminal = await this.getTerminal();

    if (!existsSync(cwd)) {
      return { action: 'error', message: `路径不存在: ${cwd}` };
    }

    try {
      await this.launchInTerminal(terminal, '', cwd);
      return { action: 'launched', terminal };
    } catch (err: any) {
      return { action: 'error', message: err.message ?? String(err) };
    }
  }

  private async getTerminal(): Promise<TerminalType> {
    const t = await this.config.get<string>('terminal');
    if (t && isValidTerminal(t)) return t;
    return 'terminal';
  }

  private getAppName(terminal: TerminalType): string {
    switch (terminal) {
      case 'ghostty': return 'Ghostty';
      case 'iterm2': return 'iTerm';
      case 'terminal': return 'Terminal';
      case 'kitty': return 'kitty';
      case 'warp': return 'Warp';
    }
  }

  private async launchInTerminal(terminal: TerminalType, cmd: string, cwd?: string): Promise<void> {
    let fullCmd: string;
    if (cwd && cmd) {
      fullCmd = `cd ${this.shellEscape(cwd)} && ${cmd}`;
    } else if (cwd) {
      fullCmd = `cd ${this.shellEscape(cwd)} && exec zsh`;
    } else {
      fullCmd = cmd;
    }
    const asEscaped = fullCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    switch (terminal) {
      case 'ghostty':
        cpSpawn('open', ['-na', 'Ghostty.app', '--args', '-e', '/bin/zsh', '-c', fullCmd], {
          detached: true,
          stdio: 'ignore',
        }).unref();
        break;

      case 'iterm2':
        execSync(`osascript \
          -e 'tell application "iTerm" to activate' \
          -e 'tell application "iTerm"' \
          -e '  set newWindow to (create window with default profile)' \
          -e '  tell current session of newWindow' \
          -e '    write text "${asEscaped}"' \
          -e '  end tell' \
          -e 'end tell'`);
        break;

      case 'terminal':
        execSync(`osascript \
          -e 'tell application "Terminal" to activate' \
          -e 'tell application "Terminal" to do script "${asEscaped}"'`);
        break;

      case 'kitty':
        cpSpawn('/bin/zsh', ['-c', `kitty --single-instance /bin/zsh -c '${fullCmd.replace(/'/g, "'\\''")}'`], {
          detached: true,
          stdio: 'ignore',
        }).unref();
        break;

      case 'warp':
        execSync(`osascript \
          -e 'tell application "Warp" to activate' \
          -e 'tell application "System Events" to tell process "Warp"' \
          -e '  set frontmost to true' \
          -e 'end tell'`);
        cpSpawn('/bin/zsh', ['-c', `sleep 0.5 && open "warp://action/new-window?command=${encodeURIComponent(fullCmd)}"`], {
          detached: true,
          stdio: 'ignore',
        }).unref();
        break;
    }
  }

  private shellEscape(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
  }
}

function isValidTerminal(t: string): t is TerminalType {
  return ['ghostty', 'iterm2', 'terminal', 'kitty', 'warp'].includes(t);
}
