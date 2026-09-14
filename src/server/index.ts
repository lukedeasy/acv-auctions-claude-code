import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';

const host = process.env.INSPECTION_DESK_HOST ?? '127.0.0.1';
const port = Number(process.env.INSPECTION_DESK_API_PORT ?? process.env.PORT ?? 4100);
const here = path.dirname(fileURLToPath(import.meta.url));
// When running from dist/server/server/index.js the client build is at dist/client.
// When running from src/server/index.ts via tsx the client is served by Vite instead.
const staticDir = process.env.INSPECTION_DESK_STATIC_DIR ?? path.resolve(here, '..', '..', 'client');

const { app } = createApp({ staticDir });

const server = app.listen(port, host, () => {
  console.log(`[inspection-desk] API listening on http://${host}:${port}  (in-memory data; restarting the server restores the seed data)`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
