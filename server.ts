import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase } from './src/server/db.ts';
import { apiRouter } from './src/server/routes.ts';

async function startServer() {
  // Initialize SQLite relational database & synthetic KSRCE demo seed
  initializeDatabase();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '5mb' }));

  // Mount REST API routes
  app.use('/api', apiRouter);

  // Global Problem Details error handler for /api/*
  app.use('/api', (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API Error]', err);
    res.status(500).json({
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred while processing the library request.',
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KSR College of Engineering LMS running on http://localhost:${PORT}`);
  });
}

startServer();
