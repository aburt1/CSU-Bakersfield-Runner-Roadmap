import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './db/init.js';
import type { Db } from './types/db.js';
import { zodErrorHandler } from './middleware/zodError.js';
import stepsRouter from './routes/steps.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import adminAuthRouter from './routes/adminAuth.js';
import integrationsRouter from './routes/integrations.js';
import studentApiChecksRouter from './routes/studentApiChecks.js';
import apiChecksRouter from './routes/apiChecks.js';
import mockApiChecksRouter from './routes/mockApiChecks.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the first proxy (needed behind reverse proxies like Nginx, Traefik, etc.)
app.set('trust proxy', 1);
let db: Db | null = null;

process.on('unhandledRejection', (error) => {
  console.error('[unhandledRejection]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));

const corsOrigin = process.env.CORS_ORIGIN
  || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000');
app.use(cors({
  origin: corsOrigin,
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
async function startServer(): Promise<void> {
  try {
    db = await initDatabase();

    // Make db available to routes
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.db = db!;
      next();
    });

    // API routes
    app.use('/api/auth', authRouter);
    app.use('/api/steps', stepsRouter);
    app.use('/api/admin/auth', adminAuthRouter);
    app.use('/api/admin', adminRouter);
    app.use('/api/integrations/v1', integrationsRouter);
    app.use('/api/roadmap', studentApiChecksRouter);
    app.use('/api/admin', apiChecksRouter);
    if (process.env.NODE_ENV !== 'production') {
      app.use('/api/mock', mockApiChecksRouter);
    }

    // Health check
    app.get('/api/health', (_req: Request, res: Response) => {
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
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(join(distPath, 'index.html'));
      });
    }

    // Zod validation error handler
    app.use(zodErrorHandler);

    // General error handler
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const error = err as { type?: string; status?: number; message?: string };
      if (error?.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }

      console.error('[request-error]', err);
      res.status(error.status || 500).json({ error: 'Internal server error' });
    });

    const server = app.listen(PORT, () => {
      console.log(`CSUB Admissions API running on port ${PORT}`);

      // Start live activity simulator (disable with DISABLE_SIMULATOR=1)
      if (!process.env.DISABLE_SIMULATOR) {
        import('./utils/simulator.js').then(({ startSimulator }) => startSimulator(db!));
      }
    });

    server.on('error', (error: Error) => {
      console.error('[server-error]', error);
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n[shutdown] Received ${signal}, closing...`);
      server.close();
      if (db) await db.end();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[startup-error] Failed to start server', error);
    process.exit(1);
  }
}

startServer();
