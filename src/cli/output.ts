import chalk from 'chalk';
import Table from 'cli-table3';
import type { SessionMetadata, SearchResult } from '../core/types.js';

export interface OutputOptions {
  json?: boolean;
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatSessionList(sessions: SessionMetadata[], opts: OutputOptions): string {
  if (opts.json) return formatJson(sessions);

  if (sessions.length === 0) return chalk.dim('No sessions found.');

  const table = new Table({
    head: ['ID', 'Project', 'Date', 'Branch', 'Msgs', 'Label', 'First Message'],
    style: { head: ['cyan'] },
    colWidths: [10, 25, 12, 15, 6, 15, 40],
    wordWrap: true,
  });

  for (const s of sessions) {
    table.push([
      s.sessionId.slice(0, 8),
      truncate(s.project.split('/').slice(-2).join('/'), 23),
      s.lastTimestamp ? new Date(s.lastTimestamp).toLocaleDateString() : '-',
      s.gitBranch ?? '-',
      String(s.userMessageCount + s.assistantMessageCount),
      s.label ?? chalk.dim('-'),
      truncate(s.firstUserMessage ?? '-', 38),
    ]);
  }

  return table.toString();
}

export function formatSessionDetail(meta: SessionMetadata, opts: OutputOptions): string {
  if (opts.json) return formatJson(meta);

  const lines = [
    chalk.bold(`Session: ${meta.sessionId}`),
    '',
    `  ${chalk.cyan('Project:')}    ${meta.project}`,
    `  ${chalk.cyan('Branch:')}     ${meta.gitBranch ?? '-'}`,
    `  ${chalk.cyan('CWD:')}        ${meta.cwd ?? '-'}`,
    `  ${chalk.cyan('Started:')}    ${meta.firstTimestamp ?? '-'}`,
    `  ${chalk.cyan('Last:')}       ${meta.lastTimestamp ?? '-'}`,
    `  ${chalk.cyan('Version:')}    ${meta.version ?? '-'}`,
    `  ${chalk.cyan('Entrypoint:')} ${meta.entrypoint ?? '-'}`,
    `  ${chalk.cyan('Models:')}     ${meta.models.join(', ') || '-'}`,
    `  ${chalk.cyan('Messages:')}   ${meta.userMessageCount} user / ${meta.assistantMessageCount} assistant`,
    `  ${chalk.cyan('Tokens:')}     ${meta.totalInputTokens.toLocaleString()} in / ${meta.totalOutputTokens.toLocaleString()} out`,
    `  ${chalk.cyan('Label:')}      ${meta.label ?? '-'}`,
    `  ${chalk.cyan('Tags:')}       ${meta.tags?.join(', ') ?? '-'}`,
  ];

  if (meta.firstUserMessage) {
    lines.push('', chalk.cyan('  First message:'));
    lines.push(`  ${chalk.dim(meta.firstUserMessage)}`);
  }

  return lines.join('\n');
}

export function formatSearchResults(results: SearchResult[], opts: OutputOptions): string {
  if (opts.json) return formatJson(results);

  if (results.length === 0) return chalk.dim('No results found.');

  const lines: string[] = [];
  for (const result of results) {
    lines.push(chalk.bold(`${result.sessionId.slice(0, 8)} `) + chalk.dim(`(${result.project.split('/').slice(-2).join('/')}) - ${result.totalHits} hits`));
    for (const hit of result.hits) {
      const typeColor = hit.type === 'user' ? chalk.green : chalk.blue;
      lines.push(`  ${typeColor(hit.type)} ${chalk.dim(hit.timestamp ?? '')} ${hit.snippet}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}
