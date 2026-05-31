import type { FastifyInstance } from 'fastify';
import type { SessionIndex } from '../../core/session-index.js';

export function registerRefreshRoute(app: FastifyInstance, index: SessionIndex): void {
  app.post('/api/refresh', async () => {
    index.invalidateCache();
    return { success: true };
  });
}
