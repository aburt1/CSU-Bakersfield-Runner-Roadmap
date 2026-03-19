import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './db/init.js';
import stepsRouter from './routes/steps.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import adminAuthRouter from './routes/adminAuth.js';
import integrationsRouter from './routes/integrations.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
let db = null;

process.on('unhandledRejection', (error) => {
  console.error('[unhandledRejection]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production'
    ? true  // allow same-origin in production (served from same Express server)
    : 'http://localhost:3000'),
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());

// Initialize database and start server
async function startServer() {
  try {
    db = await initDatabase();

    // Make db available to routes
    app.use((req, res, next) => {
      req.db = db;
      next();
    });

    // API routes
    app.use('/api/auth', authRouter);
    app.use('/api/steps', stepsRouter);
    app.use('/api/admin/auth', adminAuthRouter);
    app.use('/api/admin', adminRouter);
    app.use('/api/integrations/v1', integrationsRouter);

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        db: db ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
      });
    });

    // Serve static files in production (or whenever NODE_ENV !== 'development')
    if (process.env.NODE_ENV !== 'development') {
      const distPath = join(__dirname, '../client/dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(join(distPath, 'index.html'));
      });
    }

    app.use((err, req, res, next) => {
      if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      console.error('[request-error]', err);
      return res.status(err.status || 500).json({ error: 'Internal server error' });
    });

    const server = app.listen(PORT, () => {
      console.log(`CSUB Admissions API running on port ${PORT}`);
    });

    server.on('error', (error) => {
      console.error('[server-error]', error);
    });
  } catch (error) {
    console.error('[startup-error] Failed to start server', error);
    process.exit(1);
  }
}

startServer();
