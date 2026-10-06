import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { IssueStore, VersionConflictError, IssueNotFoundError, IssueStateError } from '../../core/issue-store.js';
import { formatJson } from '../output.js';
import type { Issue, IssuePriority, IssueStatus } from '../../core/types.js';

interface JsonOpts {
  json?: boolean;
}

function fail(err: unknown): never {
  if (err instanceof VersionConflictError || err instanceof IssueNotFoundError || err instanceof IssueStateError) {
    console.error(formatJson({ error: { code: err.code, message: err.message } }));
    process.exit(err instanceof VersionConflictError ? 2 : 1);
  }
  throw err;
}

function printIssue(issue: Issue, opts: JsonOpts): void {
  if (opts.json) {
    console.log(formatJson(issue));
    return;
  }
  console.log(formatIssueDetail(issue));
}

function formatIssueDetail(issue: Issue): string {
  return [
    chalk.bold(`${issue.identifier}  ${issue.title}`),
    '',
    `  ${chalk.cyan('Status:')}    ${issue.status}`,
    `  ${chalk.cyan('Priority:')}  ${issue.priority}`,
    `  ${chalk.cyan('Labels:')}    ${issue.labels.join(', ') || '-'}`,
    `  ${chalk.cyan('Project:')}   ${issue.projectEncoded ?? '-'}`,
    `  ${chalk.cyan('Sessions:')}  ${issue.sessionIds.length > 0 ? issue.sessionIds.map(s => s.slice(0, 8)).join(', ') : '-'}`,
    `  ${chalk.cyan('Version:')}   ${issue.version}`,
    `  ${chalk.cyan('Created:')}   ${issue.createdAt}`,
    `  ${chalk.cyan('Updated:')}   ${issue.updatedAt}`,
    ...(issue.archivedAt ? [`  ${chalk.cyan('Archived:')}  ${issue.archivedAt}`] : []),
    ...(issue.description ? ['', chalk.cyan('  Description:'), `  ${issue.description}`] : []),
  ].join('\n');
}

function formatIssueTable(issues: Issue[]): string {
  if (issues.length === 0) return chalk.dim('No issues found.');
  const table = new Table({
    head: ['ID', 'Status', 'Priority', 'Title', 'Labels', 'Sessions', 'Updated'],
    style: { head: ['cyan'] },
    colWidths: [10, 13, 9, 40, 18, 10, 12],
    wordWrap: true,
  });
  for (const i of issues) {
    table.push([
      i.identifier,
      i.status,
      i.priority === 'none' ? chalk.dim('-') : i.priority,
      i.title.length > 38 ? i.title.slice(0, 37) + '…' : i.title,
      i.labels.join(', ') || chalk.dim('-'),
      String(i.sessionIds.length),
      new Date(i.updatedAt).toLocaleDateString(),
    ]);
  }
  return table.toString();
}

function parseLabels(value?: string): string[] | undefined {
  return value ? value.split(',').map(s => s.trim()).filter(Boolean) : undefined;
}

function requireVersion(opts: { ifVersion?: string }, store: Promise<Issue>): Promise<number> {
  if (opts.ifVersion !== undefined) return Promise.resolve(Number(opts.ifVersion));
  return store.then(i => i.version);
}

export function registerIssueCommand(program: Command): void {
  const issue = program
    .command('issue')
    .description('Manage issues on the task board');

  issue
    .command('list')
    .description('List issues')
    .option('--project <encoded>', 'Filter by project (encoded path)')
    .option('--status <status>', 'Filter by status')
    .option('--archived', 'Include archived issues')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const store = new IssueStore();
      const issues = await store.listIssues({
        projectEncoded: opts.project,
        status: opts.status as IssueStatus | undefined,
        includeArchived: !!opts.archived,
      });
      console.log(opts.json ? formatJson(issues) : formatIssueTable(issues));
    });

  issue
    .command('show <id>')
    .description('Show issue detail')
    .option('--comments', 'Include comments')
    .option('--activity', 'Include activity log')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      const store = new IssueStore();
      try {
        const found = await store.getIssue(id);
        const relations = await store.getRelations(found.id);
        if (opts.json) {
          const out: Record<string, unknown> = { issue: found, relations };
          if (opts.comments) out.comments = (await store.getComments(found.id)).comments;
          if (opts.activity) out.activities = await store.getActivities(found.id);
          console.log(formatJson(out));
          return;
        }
        console.log(formatIssueDetail(found));
        if (relations.length > 0) {
          console.log('', chalk.cyan('  Relations:'));
          for (const r of relations) {
            const otherId = r.sourceId === found.id ? r.targetId : r.sourceId;
            const other = await store.getIssue(otherId);
            const dir = r.sourceId === found.id ? `${r.type} →` : `← ${r.type}`;
            console.log(`  ${dir} ${other.identifier} ${other.title}`);
          }
        }
        if (opts.comments) {
          const { comments } = await store.getComments(found.id);
          console.log('', chalk.cyan('  Comments:'));
          for (const c of comments) {
            console.log(`  ${chalk.dim(c.createdAt)} [${c.authorType}${c.sessionId ? ':' + c.sessionId.slice(0, 8) : ''}]`);
            console.log(`  ${c.body}`);
            console.log('');
          }
        }
        if (opts.activity) {
          const activities = await store.getActivities(found.id);
          console.log('', chalk.cyan('  Activity:'));
          for (const a of activities) {
            const fields = Object.entries(a.changes).map(([k, v]) => `${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`).join(', ');
            console.log(`  ${chalk.dim(a.at)} [${a.actorType}] ${fields}`);
          }
        }
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('create')
    .description('Create an issue')
    .requiredOption('--title <title>', 'Issue title')
    .option('--project <encoded>', 'Project (encoded path)')
    .option('--desc <text>', 'Description (markdown)')
    .option('--priority <priority>', 'none|urgent|high|medium|low')
    .option('--label <labels>', 'Comma-separated labels')
    .option('--status <status>', 'Initial status (default: todo)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const store = new IssueStore();
      try {
        const created = await store.createIssue({
          title: opts.title,
          projectEncoded: opts.project,
          description: opts.desc,
          priority: opts.priority as IssuePriority | undefined,
          labels: parseLabels(opts.label),
          status: opts.status as IssueStatus | undefined,
        }, 'cli');
        printIssue(created, opts);
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('update <id>')
    .description('Update issue fields')
    .option('--title <title>', 'New title')
    .option('--desc <text>', 'New description')
    .option('--priority <priority>', 'none|urgent|high|medium|low')
    .option('--label <labels>', 'Comma-separated labels (replaces existing)')
    .option('--if-version <n>', 'Require current version to match')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      const store = new IssueStore();
      try {
        const current = await store.getIssue(id);
        const version = await requireVersion(opts, Promise.resolve(current));
        const updated = await store.updateIssue(id, {
          title: opts.title,
          description: opts.desc,
          priority: opts.priority as IssuePriority | undefined,
          labels: parseLabels(opts.label),
        }, version, 'cli');
        printIssue(updated, opts);
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('move <id> <status>')
    .description('Move issue to a status column')
    .option('--if-version <n>', 'Require current version to match')
    .option('--json', 'Output as JSON')
    .action(async (id, status, opts) => {
      const store = new IssueStore();
      try {
        const current = await store.getIssue(id);
        const version = await requireVersion(opts, Promise.resolve(current));
        const moved = await store.moveIssue(id, status as IssueStatus, undefined, version, 'cli');
        printIssue(moved, opts);
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('claim <id>')
    .description('Claim an issue: move todo -> in_progress and bind your session in one step')
    .option('--session-id <sessionId>', 'Bind this session as the owner')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      const store = new IssueStore();
      try {
        const claimed = await store.claimIssue(id, { sessionId: opts.sessionId }, opts.sessionId ? 'agent' : 'cli');
        printIssue(claimed, opts);
      } catch (err) {
        fail(err);
      }
    });

  for (const action of ['archive', 'restore'] as const) {
    issue
      .command(`${action} <id>`)
      .description(`${action === 'archive' ? 'Archive' : 'Restore'} an issue`)
      .option('--if-version <n>', 'Require current version to match')
      .option('--json', 'Output as JSON')
      .action(async (id, opts) => {
        const store = new IssueStore();
        try {
          const current = await store.getIssue(id);
          const version = await requireVersion(opts, Promise.resolve(current));
          const result = action === 'archive'
            ? await store.archiveIssue(id, version, 'cli')
            : await store.restoreIssue(id, version, 'cli');
          printIssue(result, opts);
        } catch (err) {
          fail(err);
        }
      });
  }

  issue
    .command('delete <id>')
    .description('Delete an archived issue')
    .option('--if-version <n>', 'Require current version to match')
    .action(async (id, opts) => {
      const store = new IssueStore();
      try {
        const current = await store.getIssue(id);
        const version = await requireVersion(opts, Promise.resolve(current));
        await store.deleteIssue(id, version);
        console.log(formatJson({ success: true, deleted: current.identifier }));
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('bind <id> <sessionId>')
    .description('Bind a session to an issue')
    .option('--if-version <n>', 'Require current version to match')
    .option('--json', 'Output as JSON')
    .action(async (id, sessionId, opts) => {
      const store = new IssueStore();
      try {
        const current = await store.getIssue(id);
        const version = await requireVersion(opts, Promise.resolve(current));
        const bound = await store.bindSession(id, sessionId, version, 'cli');
        printIssue(bound, opts);
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('unbind <id> <sessionId>')
    .description('Unbind a session from an issue')
    .option('--if-version <n>', 'Require current version to match')
    .option('--json', 'Output as JSON')
    .action(async (id, sessionId, opts) => {
      const store = new IssueStore();
      try {
        const current = await store.getIssue(id);
        const version = await requireVersion(opts, Promise.resolve(current));
        const unbound = await store.unbindSession(id, sessionId, version, 'cli');
        printIssue(unbound, opts);
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('comment <id>')
    .description('List comments, or add one with --add')
    .option('--add <body>', 'Add a comment')
    .option('--agent', 'Mark the comment as authored by an agent')
    .option('--session-id <sessionId>', 'Attribute the comment to a session')
    .option('--after <cursor>', 'Only comments after this ISO timestamp')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      const store = new IssueStore();
      try {
        if (opts.add) {
          const comment = await store.addComment(id, opts.add, {
            authorType: opts.agent ? 'agent' : 'user',
            sessionId: opts.sessionId,
          });
          console.log(opts.json ? formatJson(comment) : `Added comment ${comment.id.slice(0, 8)} to ${(await store.getIssue(id)).identifier}`);
          return;
        }
        const { comments, nextCursor } = await store.getComments(id, opts.after);
        if (opts.json) {
          console.log(formatJson({ comments, nextCursor }));
          return;
        }
        for (const c of comments) {
          console.log(`${chalk.dim(c.createdAt)} [${c.authorType}${c.sessionId ? ':' + c.sessionId.slice(0, 8) : ''}]`);
          console.log(c.body, '\n');
        }
        if (nextCursor) console.log(chalk.dim(`nextCursor: ${nextCursor}`));
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('relate <id> <type> <targetId>')
    .description('Add a relation (parent|blocks|related)')
    .option('--json', 'Output as JSON')
    .action(async (id, type, targetId, opts) => {
      const store = new IssueStore();
      try {
        const relation = await store.addRelation(id, type, targetId, 'cli');
        console.log(opts.json ? formatJson(relation) : `Added ${type} relation`);
      } catch (err) {
        fail(err);
      }
    });

  issue
    .command('unrelate <id> <type> <targetId>')
    .description('Remove a relation')
    .action(async (id, type, targetId) => {
      const store = new IssueStore();
      try {
        await store.removeRelation(id, type, targetId, 'cli');
        console.log(formatJson({ success: true }));
      } catch (err) {
        fail(err);
      }
    });
}
