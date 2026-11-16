/**
 * TrendScheduler Service
 * ───────────────────────
 * Automatically schedules and executes daily trend collection, AI market analysis,
 * 7-day predictive forecasting, and executive email dispatch at 6:00 AM (Vietnam timezone).
 */

import TrendCollector from './trendCollector.js';
import AIAnalyst from './aiAnalyst.js';
import EmailService from './emailService.js';
import {
  saveTrendData,
  saveDailyReport,
  saveForecast,
  getTrendsByDate,
  getReportsByDateRange,
  formatDate,
} from '../models/trend.js';
import { SCHEDULER } from '../config/trends.js';

class TrendScheduler {
  constructor() {
    this.collector = new TrendCollector();
    this.analyst = new AIAnalyst();
    this.emailService = new EmailService();
    this.isRunning = false;
    this.timer = null;
    this.scheduledHour = SCHEDULER.hour || 6; // 6:00 AM
    this.scheduledMinute = SCHEDULER.minute || 0;
  }

  /**
   * Khởi động scheduler
   * Lập lịch chạy hằng ngày lúc 6:00 AM theo giờ Việt Nam (UTC+7)
   */
  start() {
    if (this.isRunning) {
      console.log('⏰ TrendScheduler is already running.');
      return;
    }

    this.isRunning = true;
    console.log(`⏰ TrendScheduler started. Target daily run: ${this.scheduledHour}:00 AM (Vietnam Time, UTC+7)`);

    this.scheduleNextRun();

    // Check if today already has data; if not, execute initial pipeline after short startup delay
    if (SCHEDULER.autoRunOnStartup) {
      setTimeout(async () => {
        try {
          const today = formatDate();
          const existingData = await getTrendsByDate(today);
          if (!existingData || existingData.length === 0) {
            console.log('🚀 No trend data found for today. Executing initial startup pipeline...');
            await this.runDailyPipeline();
          } else {
            console.log(`✅ Trend data for today (${today}) already exists (${existingData.length} items).`);
          }
        } catch (err) {
          console.error('Error during scheduler startup check:', err.message);
        }
      }, 5000);
    }
  }

  /**
   * Tính toán thời gian còn lại đến 6:00 AM giờ Việt Nam (UTC+7) tiếp theo
   * @returns {number} Số mili-giây
   */
  getMillisecondsUntilNextRun() {
    const now = new Date();
    // Convert current time to Vietnam timezone (UTC+7)
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    const vnTime = new Date(utcTime + 7 * 3600000);

    const nextRun = new Date(vnTime);
    nextRun.setHours(this.scheduledHour, this.scheduledMinute, 0, 0);

    if (vnTime.getTime() >= nextRun.getTime()) {
      // If 6:00 AM has already passed today, schedule for 6:00 AM tomorrow
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const diffMs = nextRun.getTime() - vnTime.getTime();
    return Math.max(1000, diffMs);
  }

  /**
   * Đặt lịch cho lượt chạy tiếp theo
   */
  scheduleNextRun() {
    if (!this.isRunning) return;

    const delayMs = this.getMillisecondsUntilNextRun();
    const hoursRemaining = (delayMs / 3600000).toFixed(2);
    console.log(`⏳ Next scheduled trend run in ~${hoursRemaining} hours.`);

    this.timer = setTimeout(async () => {
      try {
        console.log('🌅 [6:00 AM VN] Triggering daily automated Trend & AI Pipeline...');
        await this.runDailyPipeline();
      } catch (err) {
        console.error('❌ Daily pipeline failed:', err);
      } finally {
        this.scheduleNextRun();
      }
    }, delayMs);
  }

  /**
   * Chạy pipeline thu thập + phân tích + gửi báo cáo
   * @param {object} options
   * @returns {Promise<object>}
   */
  async runDailyPipeline(options = {}) {
    const startTime = Date.now();
    const today = formatDate();
    console.log(`\n======================================================`);
    console.log(`🚀 RUNNING TREND PIPELINE [${today}]`);
    console.log(`======================================================`);

    try {
      // 1. Collect trending data from all multi-channel sources
      console.log('1️⃣ Collecting trending data from Google Trends, TikTok, Shopee, Lazada...');
      const trendingData = await this.collector.collectAll();
      console.log(`   Collected ${trendingData.length} normalized items.`);

      // 2. Save raw data to Firestore or local cache
      console.log('2️⃣ Saving trend data to database...');
      await saveTrendData(today, trendingData);

      // 3. Load historical data (last 30 days) for trend trajectory
      console.log('3️⃣ Loading historical reports for context...');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const historicalReports = await getReportsByDateRange(formatDate(thirtyDaysAgo), today);

      // 4. Run AI Trend Analysis with Gemini
      console.log('4️⃣ Executing AI trend analysis...');
      const analysis = await this.analyst.analyzeTrends(trendingData);

      // 5. Run AI Forecast
      console.log('5️⃣ Executing 7-day predictive forecast...');
      const forecast = await this.analyst.forecast(historicalReports);
      await saveForecast(forecast);

      // 6. Generate comprehensive daily report
      console.log('6️⃣ Synthesizing daily executive report...');
      const report = {
        date: today,
        summary: analysis.summary,
        topTrends: analysis.topTrends,
        categoryInsights: analysis.categoryInsights,
        opportunities: analysis.opportunities,
        warnings: analysis.warnings,
        forecast,
        itemCount: trendingData.length,
        createdAt: new Date().toISOString(),
        sentVia: options.manual ? 'manual_trigger' : 'scheduled_pipeline',
      };

      // 7. Save report to Firestore or local file cache
      console.log('7️⃣ Saving daily report to storage...');
      const savedReport = await saveDailyReport(report);

      // 8. Send email report to stakeholders
      console.log('8️⃣ Dispatching executive email report...');
      let emailResult = { success: false, skipped: true };
      if (options.skipEmail !== true) {
        emailResult = await this.emailService.sendDailyReport(report);
      }

      // 9. Log completion summary
      const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Daily Trend Pipeline completed in ${elapsedSeconds}s!`);
      console.log(`======================================================\n`);

      return {
        success: true,
        date: today,
        durationSeconds: parseFloat(elapsedSeconds),
        itemCount: trendingData.length,
        reportId: savedReport.id,
        emailStatus: emailResult,
        report,
      };
    } catch (error) {
      console.error('❌ Pipeline execution error:', error);
      throw error;
    }
  }

  /**
   * Chạy thủ công (trigger từ API admin)
   * @param {object} options
   * @returns {Promise<object>}
   */
  async runManual(options = {}) {
    console.log('⚡ Manual pipeline trigger initiated by administrator.');
    return this.runDailyPipeline({ manual: true, ...options });
  }

  /**
   * Dừng scheduler
   */
  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('🛑 TrendScheduler stopped.');
  }
}

export default TrendScheduler;

