import { createServer } from 'http';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';

import upsertHandler from './api/upsert.js';
import dbStatusHandler from './api/db-status.js';
import loginHandler from './api/login.js';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API endpoint to handle login authentication directly against user_settings DB
  app.all('/api/login', async (req, res) => {
    try {
      await loginHandler(req, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  });

  // API endpoint to test Neon PostgreSQL database connection
  app.all('/api/db-status', async (req, res) => {
    try {
      await dbStatusHandler(req, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ connected: false, error: err.message });
      }
    }
  });

  // API endpoint proxying upsert logic
  app.all('/api/upsert', async (req, res) => {
    try {
      await upsertHandler(req, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ connected: false, error: err.message });
      }
    }
  });

  // Vite middleware for development vs production static serve
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
