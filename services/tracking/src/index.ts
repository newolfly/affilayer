/**
 * @affilayer/tracking — Fastify tracking service.
 * Run directly (`tsx src/index.ts` / `node dist/index.js`) to listen;
 * import buildApp() for tests / embedding.
 */
import { fileURLToPath } from 'node:url';
import { buildApp } from './routes.js';
import { InMemoryStore } from './store.js';
import { createPgStore } from './pg-store.js';

export { buildApp } from './routes.js';
export { InMemoryStore, DEMO_OFFERS } from './store.js';
export { createPgStore } from './pg-store.js';
export { computeSignature, verifySignature, deliverPostbacks } from './postbacks.js';

export async function start(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  const databaseUrl = process.env.DATABASE_URL;
  // Postgres adapter is only constructed (and `pg` only imported) when
  // DATABASE_URL is set; otherwise the seeded in-memory store is used.
  const store = databaseUrl ? createPgStore(databaseUrl) : new InMemoryStore();
  const app = await buildApp({ store });
  await app.listen({ port, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`AffiLayer tracking listening on http://localhost:${port} (store: ${databaseUrl ? 'postgres' : 'in-memory demo'})`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
