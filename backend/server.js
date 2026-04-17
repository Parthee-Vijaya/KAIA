import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import aiRoutes from './routes/ai.js';
import proxyRoutes from './routes/proxy.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(
  cors({
    origin: isProduction
      ? true
      : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

app.use('/api/ai', aiRoutes);
app.use('/api/proxy', proxyRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ---------------------------------------------------------------------------
// Serve frontend in production
// ---------------------------------------------------------------------------

if (isProduction) {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));

  // SPA fallback — all non-API routes serve index.html
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // 404 handler (dev only — in prod the SPA fallback handles this)
  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}

// ---------------------------------------------------------------------------
// Global error handling middleware
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.stack || err.message || err);

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: 'Internal server error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'Der opstod en uventet fejl.'
        : err.message,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\n  BudgetIndsigt backend kører på http://localhost:${PORT}`);
  console.log(`  Health check:  http://localhost:${PORT}/api/health`);
  console.log(
    `  OpenAI API:    ${process.env.OPENAI_API_KEY ? 'Konfigureret' : 'Ikke konfigureret (mock-tilstand)'}\n`
  );
});
