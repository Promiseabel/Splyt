import { env } from './config/env';
import app from './app';
import { prisma } from './lib/prisma';

async function main() {
  const server = app.listen(env.PORT, () => {
    console.log(`[server] Splyt API running on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received — shutting down gracefully`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('[server] Database disconnected. Goodbye.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
