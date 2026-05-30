import { execFile } from 'node:child_process';
import { stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ProjectDetail } from './types.js';

const execFileAsync = promisify(execFile);
const TIMEOUT = 5000;

export async function getProjectDetail(decodedPath: string): Promise<Omit<ProjectDetail, 'encoded' | 'decoded' | 'sessionCount' | 'lastTimestamp'>> {
  const result: Omit<ProjectDetail, 'encoded' | 'decoded' | 'sessionCount' | 'lastTimestamp'> = {
    diskPath: decodedPath,
    pathExists: false,
  };

  try {
    await stat(decodedPath);
    result.pathExists = true;
  } catch {
    return result;
  }

  result.gitRemoteUrl = await runGit(decodedPath, ['remote', 'get-url', 'origin']);
  result.gitBranch = await runGit(decodedPath, ['branch', '--show-current']);
  result.gitStatus = await runGit(decodedPath, ['status', '--short']);
  result.nodeVersion = await runCmd('node', ['--version'], decodedPath);
  result.packageManager = await detectPackageManager(decodedPath);

  return result;
}

async function runGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: TIMEOUT });
    const trimmed = stdout.trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

async function runCmd(cmd: string, args: string[], cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: TIMEOUT });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function detectPackageManager(cwd: string): Promise<string | undefined> {
  const lockfiles: [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  for (const [file, name] of lockfiles) {
    try {
      await access(join(cwd, file));
      return name;
    } catch {
      continue;
    }
  }
  return undefined;
}
