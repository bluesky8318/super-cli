import { execSync, spawn as cpSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { CliProvider, TerminalType } from './types.js';
import { ConfigManager } from './config.js';
import { getProvider } from './providers.js';

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

  async launchNew(cwd: string, provider: CliProvider = 'claude-code'): Promise<LaunchResult> {
    const terminal = await this.getTerminal();

    if (!existsSync(cwd)) {
      return { action: 'error', message: `路径不存在: ${cwd}` };
    }

    const providerConfig = getProvider(provider);
    const cmd = providerConfig.command;

    try {
      await this.launchInTerminal(terminal, cmd, cwd);
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
    const cdPrefix = cwd ? `cd ${this.shellEscape(cwd)} && ` : '';
    const fullCmd = `${cdPrefix}${cmd}`;
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
