import { Command } from 'commander';
import { SessionIndex } from '../../core/session-index.js';
import { SessionReader } from '../../core/session-reader.js';
import { formatSessionDetail, formatJson } from '../output.js';
import chalk from 'chalk';
import type { SessionMessage } from '../../core/types.js';

export function registerShowCommand(program: Command): void {
  program
    .command('show <session-id>')
    .description('Show session details')
    .option('--summary', 'Show metadata only')
    .option('--messages', 'Show conversation messages')
    .option('--tools', 'Show tool usage breakdown')
    .option('--json', 'Output as JSON')
    .action(async (sessionId: string, opts) => {
      const index = new SessionIndex();
      const meta = await index.findSessionByPrefix(sessionId);

      if (!meta) {
        console.error(chalk.red(`Session not found: ${sessionId}`));
        process.exit(1);
      }

      if (opts.summary || (!opts.messages && !opts.tools)) {
        console.log(formatSessionDetail(meta, { json: opts.json }));
        return;
      }

      const reader = new SessionReader();
      const messages = await reader.readSession(meta.projectEncoded, meta.sessionId);

      if (opts.tools) {
        const tools = extractToolUsage(messages);
        if (opts.json) {
          console.log(formatJson(tools));
        } else {
          console.log(chalk.bold('Tool Usage:'));
          for (const [name, count] of Object.entries(tools)) {
            console.log(`  ${chalk.cyan(name)}: ${count}`);
          }
        }
        return;
      }

      if (opts.messages) {
        if (opts.json) {
          const conversationMessages = messages.filter(m => m.type === 'user' || m.type === 'assistant');
          console.log(formatJson(conversationMessages));
          return;
        }
        printConversation(messages);
      }
    });
}

function extractToolUsage(messages: SessionMessage[]): Record<string, number> {
  const tools: Record<string, number> = {};
  for (const msg of messages) {
    if (msg.type !== 'assistant' || !msg.message?.content) continue;
    const content = msg.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_use' && block.name) {
        tools[block.name] = (tools[block.name] ?? 0) + 1;
      }
    }
  }
  return Object.fromEntries(Object.entries(tools).sort((a, b) => b[1] - a[1]));
}

function printConversation(messages: SessionMessage[]): void {
  for (const msg of messages) {
    if (msg.type !== 'user' && msg.type !== 'assistant') continue;
    if (!msg.message?.content) continue;

    const role = msg.type === 'user' ? chalk.green.bold('User') : chalk.blue.bold('Assistant');
    const time = msg.timestamp ? chalk.dim(` [${new Date(msg.timestamp).toLocaleString()}]`) : '';
    console.log(`\n${role}${time}`);

    const content = msg.message.content;
    if (typeof content === 'string') {
      console.log(content.slice(0, 500));
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          console.log(block.text.slice(0, 500));
        } else if (block.type === 'tool_use') {
          console.log(chalk.yellow(`  [Tool: ${block.name}]`));
        }
      }
    }
  }
}
