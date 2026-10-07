import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { IdeaStore, IdeaNotFoundError, IdeaStateError } from '../../core/idea-store.js';
import { formatJson } from '../output.js';
import type { Idea, IdeaStatus, IssuePriority } from '../../core/types.js';

function fail(err: unknown): never {
  if (err instanceof IdeaNotFoundError || err instanceof IdeaStateError) {
    console.error(formatJson({ error: { code: err.code, message: err.message } }));
    process.exit(1);
  }
  throw err;
}

const STATUS_LABEL: Record<IdeaStatus, string> = {
  draft: '待分类',
  incubating: '孵化中',
  promoted: '已转任务',
  abandoned: '已放弃',
  archived: '已归档',
};

function formatIdeaTable(ideas: Idea[]): string {
  if (ideas.length === 0) return chalk.dim('No ideas found.');
  const table = new Table({
    head: ['ID', 'Status', 'Category', 'Title', 'Comments', 'Task', 'Created'],
    style: { head: ['cyan'] },
    colWidths: [9, 10, 10, 40, 9, 12, 12],
    wordWrap: true,
  });
  for (const i of ideas) {
    table.push([
      i.identifier,
      STATUS_LABEL[i.status],
      i.category ?? chalk.dim('-'),
      i.title.replace(/\n/g, ' ').slice(0, 38),
      String(i.comments.length),
      i.promotedIssueIdentifier ? chalk.green(i.promotedIssueIdentifier) : chalk.dim('-'),
      new Date(i.createdAt).toLocaleDateString(),
    ]);
  }
  return table.toString();
}

export function registerIdeaCommands(program: Command): void {
  const idea = new Command('idea').description('想法管理（随时记录 → 分类孵化 → 转为任务）');

  idea
    .command('list')
    .description('列出想法')
    .option('--status <status>', 'Filter: draft|incubating|promoted|abandoned')
    .option('--category <key>', 'Filter by category key')
    .option('--project <path>', 'Filter by project path')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const store = new IdeaStore();
      const ideas = await store.list({
        status: opts.status as IdeaStatus | undefined,
        category: opts.category,
        project: opts.project,
      });
      if (opts.json) console.log(formatJson({ ideas, total: ideas.length }));
      else console.log(formatIdeaTable(ideas));
    });

  idea
    .command('add')
    .description('一句话记录想法（draft，随后用 categorize 分类）')
    .argument('<content...>', 'Idea content')
    .option('--json', 'JSON output')
    .action(async (contentParts: string[], opts) => {
      const store = new IdeaStore();
      try {
        const i = await store.create(contentParts.join(' '));
        if (opts.json) console.log(formatJson({ idea: i }));
        else console.log(chalk.green(`✓ 已记录 ${i.identifier}`) + chalk.dim('（待分类）'));
      } catch (err) { fail(err); }
    });

  idea
    .command('categorize')
    .description('为想法选择分类（落 md 文档到分类项目，之后才能评论/转任务）')
    .argument('<id>', 'Idea id or identifier')
    .argument('<category>', 'Category key (see: super-cli idea categories)')
    .option('--json', 'JSON output')
    .action(async (id: string, category: string, opts) => {
      const store = new IdeaStore();
      try {
        const i = await store.categorize(id, category);
        if (opts.json) console.log(formatJson({ idea: i }));
        else console.log(chalk.green(`✓ ${i.identifier} → ${category}`) + chalk.dim(` ${i.docPath}`));
      } catch (err) { fail(err); }
    });

  idea
    .command('categories')
    .description('列出想法分类（系统配置 ideaCategories，含内置默认）')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const store = new IdeaStore();
      const cats = await store.categories();
      if (opts.json) { console.log(formatJson({ categories: cats })); return; }
      for (const c of cats) console.log(`${chalk.cyan(c.key)}  ${c.label}  ${chalk.dim(c.project)}`);
    });

  idea
    .command('comment')
    .description('给想法追加评论/修正（写入 md 文档，原始记录不变）')
    .argument('<id>', 'Idea id or identifier')
    .argument('<body...>', 'Comment body')
    .option('--json', 'JSON output')
    .action(async (id: string, bodyParts: string[], opts) => {
      const store = new IdeaStore();
      try {
        const i = await store.addComment(id, bodyParts.join(' '));
        if (opts.json) console.log(formatJson({ idea: i }));
        else console.log(chalk.green(`✓ 已评论 ${i.identifier}`) + chalk.dim(`（共 ${i.comments.length} 条）`));
      } catch (err) { fail(err); }
    });

  idea
    .command('show')
    .description('查看想法详情（含评论）')
    .argument('<id>', 'Idea id or identifier')
    .option('--json', 'JSON output')
    .action(async (id: string, opts) => {
      const store = new IdeaStore();
      try {
        const i = await store.get(id);
        if (opts.json) { console.log(formatJson({ idea: i })); return; }
        console.log(`${chalk.bold(i.identifier)}  ${STATUS_LABEL[i.status]}${i.category ? `  ${i.category}` : ''}`);
        console.log(chalk.dim(`创建: ${i.createdAt}${i.docPath ? `  文档: ${i.docPath}` : ''}`));
        console.log(`\n## 原始记录\n\n${i.content}`);
        if (i.comments.length) {
          console.log('\n## 评论与修正');
          for (const c of i.comments) console.log(`\n### ${c.at}\n${c.body}`);
        }
        if (i.promotedIssueIdentifier) console.log(chalk.green(`\n→ 已转任务 ${i.promotedIssueIdentifier}（${i.issueStatus ?? '?'}）`));
      } catch (err) { fail(err); }
    });

  idea
    .command('promote')
    .description('想法成熟后转为正式任务（md 文档成为任务原始需求文档）')
    .argument('<id>', 'Idea id or identifier')
    .option('--title <title>', '任务标题（默认想法标题）')
    .option('--project <path>', '任务归属项目（默认分类项目）')
    .option('--priority <priority>', 'urgent|high|medium|low|none')
    .option('--json', 'JSON output')
    .action(async (id: string, opts) => {
      const store = new IdeaStore();
      try {
        const result = await store.promote(id, {
          title: opts.title,
          project: opts.project,
          priority: opts.priority as IssuePriority | undefined,
        });
        if (opts.json) console.log(formatJson(result));
        else console.log(chalk.green(`✓ ${result.idea.identifier} → ${result.issueIdentifier}`));
      } catch (err) { fail(err); }
    });

  idea
    .command('abandon')
    .description('放弃想法（保留文档，可回顾）')
    .argument('<id>', 'Idea id or identifier')
    .action(async (id: string) => {
      const store = new IdeaStore();
      try {
        await store.setStatus(id, 'abandoned');
        console.log(chalk.green(`✓ 已放弃 ${id}`));
      } catch (err) { fail(err); }
    });

  idea
    .command('restore')
    .description('恢复已放弃/已归档的想法（有分类回孵化中，无分类回待分类）')
    .argument('<id>', 'Idea id or identifier')
    .action(async (id: string) => {
      const store = new IdeaStore();
      try {
        const i = await store.get(id);
        await store.setStatus(id, i.docPath ? 'incubating' : 'draft');
        console.log(chalk.green(`✓ 已恢复 ${id}`));
      } catch (err) { fail(err); }
    });

  idea
    .command('archive')
    .description('归档想法（可恢复到孵化中/待分类）')
    .argument('<id>', 'Idea id or identifier')
    .action(async (id: string) => {
      const store = new IdeaStore();
      try {
        await store.setStatus(id, 'archived');
        console.log(chalk.green(`✓ 已归档 ${id}`));
      } catch (err) { fail(err); }
    });

  program.addCommand(idea);
}
