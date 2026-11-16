/**
 * Trend Routes
 * ────────────
 * REST API endpoints for AI Trend Research & Forecasting (Phase 5).
 *
 * Base path: /api/trends
 * All routes require authentication (mounted with verifyToken).
 */

import { Router } from 'express';
import TrendCollector from '../services/trendCollector.js';
import AIAnalyst from '../services/aiAnalyst.js';
import TrendScheduler from '../services/trendScheduler.js';
import {
  getTrendsByDate,
  getLatestReport,
  getReportsByDateRange,
  getTrendHistory,
  getLatestForecast,
  saveTrendData,
  formatDate,
} from '../models/trend.js';

const router = Router();
const collector = new TrendCollector();
const analyst = new AIAnalyst();
let schedulerInstance = null;

// Helper to get or create scheduler instance for manual triggers
function getScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new TrendScheduler();
  }
  return schedulerInstance;
}

// Admin-only middleware helper
const requireAdmin = (req, res, next) => {
  const user = req.user;
  if (!user || (user.role !== 'admin' && !user.admin)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden – admin role required to execute this operation.',
    });
  }
  next();
};

/**
 * ── GET /api/trends/latest ─────────────────────────────────────
 * Get latest trending product items.
 * Query params: ?category=...&limit=20&minScore=50
 */
router.get('/latest', async (req, res) => {
  try {
    const { category, limit = 20, minScore = 0 } = req.query;
    const today = formatDate();

    let items = await getTrendsByDate(today);

    if (category) {
      items = items.filter((item) => item.category === category);
    }

    if (minScore) {
      items = items.filter((item) => item.trendScore >= Number(minScore));
    }

    const limitedItems = items.slice(0, Number(limit));

    return res.json({
      success: true,
      count: limitedItems.length,
      totalAvailable: items.length,
      data: limitedItems,
    });
  } catch (error) {
    console.error('GET /api/trends/latest error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ── GET /api/trends/report ─────────────────────────────────────
 * Retrieve the latest daily AI market analysis report.
 */
router.get('/report', async (req, res) => {
  try {
    const report = await getLatestReport();
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'No trend report found. You can generate one via POST /api/trends/analyze.',
      });
    }

    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('GET /api/trends/report error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ── GET /api/trends/report/:date ───────────────────────────────
 * Retrieve a specific daily report by date (YYYY-MM-DD).
 */
router.get('/report/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const reports = await getReportsByDateRange(date, date);

    if (!reports || reports.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No trend report found for date ${date}.`,
      });
    }

    return res.json({
      success: true,
      data: reports[0],
    });
  } catch (error) {
    console.error(`GET /api/trends/report/${req.params.date} error:`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ── GET /api/trends/history/:productName ───────────────────────
 * Retrieve historical trend metrics for a product over the last N days.
 * Query params: ?days=30
 */
router.get('/history/:productName', async (req, res) => {
  try {
    const { productName } = req.params;
    const days = parseInt(req.query.days || '30', 10);

    const history = await getTrendHistory(productName, days);

    return res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error(`GET /api/trends/history/${req.params.productName} error:`, error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ── GET /api/trends/categories ─────────────────────────────────
 * Retrieve top trending categories with aggregated scores.
 * Query params: ?limit=10
 */
router.get('/categories', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    const topCategories = await collector.getTopCategories(limit);

    return res.json({
      success: true,
      count: topCategories.length,
      data: topCategories,
    });
  } catch (error) {
    console.error('GET /api/trends/categories error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ── POST /api/trends/analyze ───────────────────────────────────
 * Manually trigger complete AI analysis & daily report generation (Admin only).
 * Body: { skipEmail: false }
 */
router.post('/analyze', requireAdmin, async (req, res) => {
  try {
    const { skipEmail } = req.body || {};
    const scheduler = getScheduler();

    const result = await scheduler.runManual({ skipEmail: Boolean(skipEmail) });

    return res.status(200).json({
      success: true,
      message: 'Trend analysis and report generation triggered successfully.',
      data: result,
    });
  } catch (error) {
    console.error('POST /api/trends/analyze error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ── POST /api/trends/collect ───────────────────────────────────
 * Manually trigger data collection from all sources (Admin only).
 */
router.post('/collect', requireAdmin, async (_req, res) => {
  try {
    const items = await collector.collectAll();
    const today = formatDate();
    const saveResult = await saveTrendData(today, items);

    return res.status(200).json({
      success: true,
      message: `Collected ${items.length} trending items across all sources.`,
      date: today,
      count: items.length,
      storage: saveResult,
      sample: items.slice(0, 5),
    });
  } catch (error) {
    console.error('POST /api/trends/collect error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ── GET /api/trends/forecast ───────────────────────────────────
 * Retrieve the latest 7-day predictive trend forecast.
 */
router.get('/forecast', async (_req, res) => {
  try {
    const forecast = await getLatestForecast();
    if (!forecast) {
      return res.status(404).json({
        success: false,
        message: 'No forecast data available yet.',
      });
    }

    return res.json({
      success: true,
      data: forecast,
    });
  } catch (error) {
    console.error('GET /api/trends/forecast error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ── POST /api/trends/analyze-product ───────────────────────────
 * Perform deep business viability analysis on a specific product.
 * Body: { productName: string, marketData?: object }
 */
router.post('/analyze-product', async (req, res) => {
  try {
    const { productName, marketData } = req.body;

    if (!productName || typeof productName !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'productName string is required in request body.',
      });
    }

    const analysis = await analyst.analyzeProduct(productName, marketData || {});

    return res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('POST /api/trends/analyze-product error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

