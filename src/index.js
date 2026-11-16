/**
 * Mini Pancake – Main Server Entry Point
 * ────────────────────────────────────────
 * Multi-channel sales management SaaS backend.
 * Initializes Express, mounts all route modules, serves static frontend,
 * and handles SPA catch-all and error states.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env (must be called before any config imports).
dotenv.config();

// ── Route imports ───────────────────────────────────
import customerRoutes from './routes/customerRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import shippingRoutes from './routes/shippingRoutes.js';
import trendRoutes from './routes/trendRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import followUpRoutes from './routes/followUpRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import productRoutes from './routes/productRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// ── Schedulers ──────────────────────────────────────
import TrendScheduler from './services/trendScheduler.js';
import JobScheduler from './services/jobScheduler.js';

// ── Auth middleware ─────────────────────────────────
import { verifyToken } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Global middleware ───────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve static files ──────────────────────────────
app.use(express.static('src/frontend'));

// ── Health check (public) ───────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Mini Pancake API is running 🥞',
    timestamp: new Date().toISOString(),
  });
});

// ── Webhooks (public – external services call these) ─
app.use('/api/webhooks', webhookRoutes);

// ── Protected routes (require Firebase auth token) ──
app.use('/api/customers', verifyToken, customerRoutes);
app.use('/api/orders', verifyToken, orderRoutes);
app.use('/api/messages', verifyToken, messageRoutes);
app.use('/api/conversations', verifyToken, messageRoutes);
app.use('/api/shipping', verifyToken, shippingRoutes);
app.use('/api/trends', verifyToken, trendRoutes);
app.use('/api/leads', verifyToken, leadRoutes);
app.use('/api/quotations', verifyToken, quotationRoutes);
app.use('/api/tickets', verifyToken, ticketRoutes);
app.use('/api/follow-ups', verifyToken, followUpRoutes);
app.use('/api/notifications', verifyToken, notificationRoutes);
app.use('/api/dashboard', verifyToken, dashboardRoutes);
app.use('/api/products', verifyToken, productRoutes);
app.use('/api/admin', verifyToken, adminRoutes);

// ── 404 handler for API routes ──────────────────────
app.all('/api/*', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found.',
  });
});

// ── Catch-all: serve frontend SPA ───────────────────
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'src/frontend' });
});

// ── Global error handler ────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
  });
});

// ── Start server ────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`🥞 Mini Pancake API listening on port ${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/api/health`);

  // Start AI Trend Research & Forecasting Scheduler (Phase 5)
  if (process.env.NODE_ENV !== 'test' && process.env.TREND_ENABLED !== 'false') {
    const trendScheduler = new TrendScheduler();
    trendScheduler.start();
  }

  // Start Addendum A Periodic Jobs Scheduler (Quotation expiry, lead follow-ups, ticket SLA)
  if (process.env.NODE_ENV !== 'test') {
    const jobScheduler = new JobScheduler();
    jobScheduler.start();
  }
});

export default app;
