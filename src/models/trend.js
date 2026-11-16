/**
 * Trend Model
 * ────────────
 * Firestore and local file cache persistence for:
 * - Collected multi-source trend items (trends collection)
 * - Daily AI market reports (daily_reports collection)
 * - 7-day trend forecasts (forecasts collection)
 *
 * In DEMO mode (when Firebase credentials are not provided), all methods
 * transparently read from and write to local JSON files in src/data/trend-cache/.
 */

import fs from 'fs/promises';
import path from 'path';
import { db, isFirebaseReady } from '../config/firebase.js';
import { CACHE_DIR } from '../config/trends.js';

const COLLECTION_NAME = 'trends';
const REPORTS_COLLECTION = 'daily_reports';
const FORECASTS_COLLECTION = 'forecasts';

// Ensure the cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create cache directory:', err.message);
  }
}

// Load sample data fallback
async function getSampleTrendsFile() {
  try {
    const samplePath = path.join(CACHE_DIR, 'sample-trends.json');
    const content = await fs.readFile(samplePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return { products: [], sampleDailyReport: null };
  }
}

/**
 * Format date to YYYY-MM-DD
 * @param {Date|string} d
 * @returns {string}
 */
export function formatDate(d = new Date()) {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  return dateObj.toISOString().slice(0, 10);
}

/**
 * Save trend items collected on a specific date.
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {Array<object>} items - Normalized trending items
 * @returns {Promise<object>} Status and saved count
 */
export async function saveTrendData(date, items = []) {
  const targetDate = date || formatDate();

  // If Firebase is available, persist to Firestore
  if (isFirebaseReady && db) {
    try {
      const batch = db.batch();
      const dailyDocRef = db.collection(COLLECTION_NAME).doc(targetDate);

      batch.set(
        dailyDocRef,
        {
          date: targetDate,
          totalItems: items.length,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const itemsSubCol = dailyDocRef.collection('items');
      items.forEach((item, index) => {
        const id = item.id || `item_${index}_${Date.now()}`;
        const itemRef = itemsSubCol.doc(id);
        batch.set(
          itemRef,
          {
            ...item,
            date: targetDate,
            savedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      });

      await batch.commit();
      return { success: true, mode: 'firestore', date: targetDate, count: items.length };
    } catch (err) {
      console.warn('Firestore write failed, falling back to local cache:', err.message);
    }
  }

  // Demo / local cache mode
  await ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `trends-${targetDate}.json`);
  const payload = {
    date: targetDate,
    savedAt: new Date().toISOString(),
    count: items.length,
    items,
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');

  // Also update latest-trends.json
  const latestPath = path.join(CACHE_DIR, 'latest-trends.json');
  await fs.writeFile(latestPath, JSON.stringify(payload, null, 2), 'utf8');

  return { success: true, mode: 'local_cache', date: targetDate, count: items.length };
}

/**
 * Retrieve trending items for a given date.
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array<object>>}
 */
export async function getTrendsByDate(date) {
  const targetDate = date || formatDate();

  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .doc(targetDate)
        .collection('items')
        .get();

      if (!snapshot.empty) {
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }
    } catch (err) {
      console.warn('Firestore read failed, falling back to cache:', err.message);
    }
  }

  // Local cache mode
  await ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `trends-${targetDate}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.items || [];
  } catch {
    // If not found, try latest-trends.json or sample-trends.json
    try {
      const latestPath = path.join(CACHE_DIR, 'latest-trends.json');
      const rawLatest = await fs.readFile(latestPath, 'utf8');
      const parsedLatest = JSON.parse(rawLatest);
      return parsedLatest.items || [];
    } catch {
      const sample = await getSampleTrendsFile();
      return sample.products || [];
    }
  }
}

/**
 * Retrieve historical trend data for a specific product.
 * @param {string} productName - Name or partial name of product
 * @param {number} days - Number of days to look back
 * @returns {Promise<object>}
 */
export async function getTrendHistory(productName, days = 30) {
  return getProductTrendHistory(productName, days);
}

/**
 * Deep product trend history analysis across multiple dates.
 * @param {string} productName
 * @param {number} days
 * @returns {Promise<object>}
 */
export async function getProductTrendHistory(productName, days = 30) {
  const queryLower = (productName || '').toLowerCase().trim();
  const historyPoints = [];

  const today = new Date();
  const dateList = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateList.push(formatDate(d));
  }

  // Load sample data baseline for consistent curves
  const sample = await getSampleTrendsFile();
  const sampleMatch = sample.products.find((p) =>
    p.name.toLowerCase().includes(queryLower)
  );

  for (const dateStr of dateList) {
    const items = await getTrendsByDate(dateStr);
    const matched = items.find((item) =>
      item.name.toLowerCase().includes(queryLower)
    );

    if (matched) {
      historyPoints.push({
        date: dateStr,
        trendScore: matched.trendScore,
        avgPrice: matched.avgPrice,
        salesVelocity: matched.salesVelocity,
        sources: matched.sources || [],
      });
    } else if (sampleMatch) {
      // Synthesize realistic historical trajectory in demo mode
      const dayOffset = dateList.indexOf(dateStr) - days;
      const variation = Math.sin(dayOffset * 0.4) * 6;
      const simulatedScore = Math.max(
        40,
        Math.min(100, Math.round(sampleMatch.trendScore + variation - (days - dateList.indexOf(dateStr)) * 0.4))
      );
      historyPoints.push({
        date: dateStr,
        trendScore: simulatedScore,
        avgPrice: sampleMatch.avgPrice,
        salesVelocity: Math.max(100, Math.round(sampleMatch.salesVelocity + variation * 40)),
        sources: sampleMatch.sources || ['shopee', 'tiktok_shop'],
      });
    }
  }

  const latestScore = historyPoints.length > 0 ? historyPoints[historyPoints.length - 1].trendScore : 0;
  const initialScore = historyPoints.length > 0 ? historyPoints[0].trendScore : 0;
  const growthRate = initialScore > 0 ? Math.round(((latestScore - initialScore) / initialScore) * 100) : 0;

  return {
    productName,
    days,
    growthRatePercent: growthRate,
    history: historyPoints,
    latestMetrics: historyPoints.length > 0 ? historyPoints[historyPoints.length - 1] : null,
  };
}

/**
 * Save an AI-generated daily market report.
 * @param {object} report
 * @returns {Promise<object>}
 */
export async function saveDailyReport(report) {
  const reportDate = report.date || formatDate();
  const payload = {
    ...report,
    date: reportDate,
    createdAt: report.createdAt || new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(REPORTS_COLLECTION).add(payload);
      return { id: docRef.id, ...payload, mode: 'firestore' };
    } catch (err) {
      console.warn('Firestore report write failed, falling back to cache:', err.message);
    }
  }

  // Local file mode
  await ensureCacheDir();
  const allReportsFile = path.join(CACHE_DIR, 'daily-reports.json');
  let reports = [];
  try {
    const raw = await fs.readFile(allReportsFile, 'utf8');
    reports = JSON.parse(raw);
  } catch {
    reports = [];
  }

  // Upsert report for this date
  const index = reports.findIndex((r) => r.date === reportDate);
  const id = `report_${reportDate}_${Date.now()}`;
  const record = { id, ...payload, mode: 'local_cache' };

  if (index >= 0) {
    reports[index] = record;
  } else {
    reports.unshift(record);
  }

  await fs.writeFile(allReportsFile, JSON.stringify(reports, null, 2), 'utf8');

  // Also save latest-report.json
  const latestReportFile = path.join(CACHE_DIR, 'latest-report.json');
  await fs.writeFile(latestReportFile, JSON.stringify(record, null, 2), 'utf8');

  return record;
}

/**
 * Retrieve the most recent daily report.
 * @returns {Promise<object|null>}
 */
export async function getLatestReport() {
  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(REPORTS_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
    } catch (err) {
      console.warn('Firestore read latest report failed, falling back to cache:', err.message);
    }
  }

  // Local cache mode
  await ensureCacheDir();
  const latestReportFile = path.join(CACHE_DIR, 'latest-report.json');
  try {
    const raw = await fs.readFile(latestReportFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    const sample = await getSampleTrendsFile();
    return sample.sampleDailyReport || null;
  }
}

/**
 * Retrieve daily reports within a specific date range.
 * @param {string} start - Start date (YYYY-MM-DD)
 * @param {string} end - End date (YYYY-MM-DD)
 * @returns {Promise<Array<object>>}
 */
export async function getReportsByDateRange(start, end) {
  const startDate = start || '1970-01-01';
  const endDate = end || formatDate();

  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(REPORTS_COLLECTION)
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .orderBy('date', 'desc')
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn('Firestore range query failed, falling back to cache:', err.message);
    }
  }

  // Local cache mode
  await ensureCacheDir();
  const allReportsFile = path.join(CACHE_DIR, 'daily-reports.json');
  try {
    const raw = await fs.readFile(allReportsFile, 'utf8');
    const reports = JSON.parse(raw);
    return reports.filter((r) => r.date >= startDate && r.date <= endDate);
  } catch {
    const sample = await getSampleTrendsFile();
    return sample.sampleDailyReport ? [sample.sampleDailyReport] : [];
  }
}

/**
 * Save an AI trend forecast document.
 * @param {object} forecast
 * @returns {Promise<object>}
 */
export async function saveForecast(forecast) {
  const payload = {
    ...forecast,
    forecastedAt: forecast.forecastedAt || new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(FORECASTS_COLLECTION).add(payload);
      return { id: docRef.id, ...payload, mode: 'firestore' };
    } catch (err) {
      console.warn('Firestore forecast save failed:', err.message);
    }
  }

  await ensureCacheDir();
  const filePath = path.join(CACHE_DIR, 'latest-forecast.json');
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ...payload, mode: 'local_cache' };
}

/**
 * Retrieve the latest forecast.
 * @returns {Promise<object|null>}
 */
export async function getLatestForecast() {
  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(FORECASTS_COLLECTION)
        .orderBy('forecastedAt', 'desc')
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
    } catch (err) {
      console.warn('Firestore read latest forecast failed:', err.message);
    }
  }

  await ensureCacheDir();
  const filePath = path.join(CACHE_DIR, 'latest-forecast.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    const sample = await getSampleTrendsFile();
    return sample.sampleDailyReport?.forecast || null;
  }
}

export const TrendModel = {
  saveTrendData,
  getTrendsByDate,
  getTrendHistory,
  getProductTrendHistory,
  saveDailyReport,
  getLatestReport,
  getReportsByDateRange,
  saveForecast,
  getLatestForecast,
};

export default TrendModel;

