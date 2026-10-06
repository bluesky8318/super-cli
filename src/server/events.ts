import type { FastifyReply } from 'fastify';

export type IssueEventType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.moved'
  | 'issue.archived'
  | 'issue.restored'
  | 'issue.deleted'
  | 'issue.relation.updated'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted';

export class EventHub {
  private clients = new Set<FastifyReply['raw']>();
  private keepAlive: NodeJS.Timeout;

  constructor() {
    this.keepAlive = setInterval(() => {
      for (const res of this.clients) {
        res.write(': keep-alive\n\n');
      }
    }, 20_000);
    this.keepAlive.unref();
  }

  subscribe(reply: FastifyReply): void {
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  emit(type: IssueEventType, payload: Record<string, unknown>): void {
    const frame = `event: ${type}\ndata: ${JSON.stringify({ ...payload, at: new Date().toISOString() })}\n\n`;
    for (const res of this.clients) {
      res.write(frame);
    }
  }

  close(): void {
    clearInterval(this.keepAlive);
    for (const res of this.clients) {
      res.end();
    }
    this.clients.clear();
  }
}
