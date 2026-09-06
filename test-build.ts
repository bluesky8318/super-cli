import { SessionIndex } from './src/core/session-index.js';

async function main() {
  const index = new SessionIndex();
  console.time('buildIndex');
  await index.buildIndex({ forceRefresh: true });
  console.timeEnd('buildIndex');
}
main();
