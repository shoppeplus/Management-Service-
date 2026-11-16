/**
 * EmailService
 * ────────────
 * Sends automated AI trend analysis and market forecast reports via email.
 * Uses nodemailer with SMTP (e.g. Gmail SMTP), with dynamic import and
 * simulation fallback when credentials are not configured or in Demo mode.
 */

import { EMAIL } from '../config/trends.js';
import { formatCurrency } from '../utils/helpers.js';

class EmailService {
  constructor() {
    this.smtpHost = process.env.SMTP_HOST || EMAIL.smtpHost;
    this.smtpPort = parseInt(process.env.SMTP_PORT || String(EMAIL.smtpPort), 10);
    this.smtpUser = process.env.SMTP_USER || EMAIL.smtpUser;
    this.smtpPass = process.env.SMTP_PASS || EMAIL.smtpPass;
    this.recipients = (process.env.REPORT_RECIPIENTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (this.recipients.length === 0) {
      this.recipients = EMAIL.recipients;
    }

    this.transporter = null;
    this.nodemailerLoaded = false;
  }

  /**
   * Lazily initialize nodemailer transport
   */
  async getTransporter() {
    if (this.transporter) return this.transporter;

    if (!this.smtpUser || !this.smtpPass || this.smtpUser.includes('your-email')) {
      return null;
    }

    try {
      const nodemailerModule = await import('nodemailer');
      const nodemailer = nodemailerModule.default || nodemailerModule;
      this.nodemailerLoaded = true;

      this.transporter = nodemailer.createTransport({
        host: this.smtpHost,
        port: this.smtpPort,
        secure: this.smtpPort === 465,
        auth: {
          user: this.smtpUser,
          pass: this.smtpPass,
        },
      });

      return this.transporter;
    } catch (err) {
      console.warn(`[EmailService] Nodemailer not available or failed to load (${err.message}). Using simulation.`);
      return null;
    }
  }

  /**
   * Send daily trend and forecast report via email
   * @param {object} report - Report data
   * @param {Array<string>|string} customRecipients - Optional recipient list
   * @returns {Promise<object>} Status and delivery info
   */
  async sendDailyReport(report = {}, customRecipients = null) {
    let toList = this.recipients;
    if (customRecipients) {
      toList = Array.isArray(customRecipients)
        ? customRecipients
        : customRecipients.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const reportDate = report.date || new Date().toISOString().slice(0, 10);
    const subject = `🥞 [Mini Pancake] Báo Cáo Xu Hướng Thị Trường & Dự Báo Ngày ${reportDate}`;
    const htmlContent = this.buildReportHTML(report);
    const textContent = report.plainText || report.summary || 'Báo cáo xu hướng Mini Pancake';

    const transporter = await this.getTransporter();

    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: `"${EMAIL.fromName}" <${this.smtpUser}>`,
          to: toList.join(', '),
          subject,
          text: textContent,
          html: htmlContent,
        });

        console.log(`📧 Daily report email sent successfully: ${info.messageId}`);
        return {
          success: true,
          messageId: info.messageId,
          recipients: toList,
          simulated: false,
          sentAt: new Date().toISOString(),
        };
      } catch (err) {
        console.error(`[EmailService] SMTP delivery failed (${err.message}). Fallback to simulated delivery.`);
      }
    }

    // Simulated email delivery (Demo mode or SMTP unconfigured)
    console.log(`📨 [DEMO EMAIL SIMULATION] Daily Report Email generated for: ${toList.join(', ')}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Summary snippet: ${report.summary ? report.summary.slice(0, 120) + '...' : 'N/A'}`);

    return {
      success: true,
      messageId: `simulated-${Date.now()}`,
      recipients: toList,
      simulated: true,
      subject,
      sentAt: new Date().toISOString(),
    };
  }

  /**
   * Gửi email cảnh báo khẩn cấp (sản phẩm viral đột biến, biến động giá mạnh,...)
   * @param {object} alert
   * @returns {Promise<object>}
   */
  async sendAlertEmail(alert = {}) {
    const toList = this.recipients;
    const title = alert.title || 'Cảnh báo xu hướng mới';
    const subject = `🚨 [CẢNH BÁO XU HƯỚNG] ${title}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fc; margin: 0; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #fee2e2; overflow: hidden; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.08); }
    .header { background: #ef4444; color: #ffffff; padding: 20px 24px; }
    .body { padding: 24px; color: #1f2937; }
    .alert-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px; }
    .btn { display: inline-block; background: #ef4444; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2 style="margin:0;font-size:20px;">🚨 Cảnh Báo Xu Hướng Khẩn Cấp</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Hệ thống AI Mini Pancake phát hiện biến động quan trọng</p>
    </div>
    <div class="body">
      <h3 style="margin-top:0;color:#991b1b;">${alert.title || 'Phát hiện biến động thị trường'}</h3>
      <div class="alert-box">
        <p style="margin:0;font-size:14px;line-height:1.6;"><strong>Chi tiết:</strong> ${alert.message || alert.issue || 'Không có mô tả'}</p>
      </div>
      <p style="font-size:14px;color:#4b5563;"><strong>Mức độ ưu tiên:</strong> <span style="color:#dc2626;font-weight:700;">${alert.priority || 'CAO'}</span></p>
      <p style="font-size:14px;color:#4b5563;"><strong>Hành động đề xuất:</strong> ${alert.action || alert.suggestion || 'Kiểm tra ngay tồn kho và giá bán trên các kênh.'}</p>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px;">Thời gian ghi nhận: ${new Date().toLocaleString('vi-VN')}</p>
    </div>
  </div>
</body>
</html>
`;

    const transporter = await this.getTransporter();
    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: `"${EMAIL.fromName}" <${this.smtpUser}>`,
          to: toList.join(', '),
          subject,
          text: alert.message || alert.title,
          html: htmlContent,
        });
        return { success: true, messageId: info.messageId, simulated: false };
      } catch (err) {
        console.error(`[EmailService] Alert send failed (${err.message})`);
      }
    }

    console.log(`🚨 [ALERT EMAIL SIMULATION] ${subject}`);
    return { success: true, messageId: `alert-sim-${Date.now()}`, simulated: true };
  }

  /**
   * Xây dựng giao diện HTML email báo cáo chuyên nghiệp, tương thích đa thiết bị
   * @param {object} report
   * @returns {string} HTML string
   */
  buildReportHTML(report = {}) {
    const dateStr = report.date || new Date().toISOString().slice(0, 10);
    const summary = report.summary || 'Không có tóm tắt.';
    const topTrends = report.topTrends || [];
    const categoryInsights = report.categoryInsights || [];
    const opportunities = report.opportunities || [];
    const warnings = report.warnings || [];
    const forecast = report.forecast || {};
    const predictions = forecast.predictions || [];
    const recommendedProducts = forecast.recommendedProducts || [];

    const currencyFmt = (val) => {
      try {
        return formatCurrency(val);
      } catch {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
      }
    };

    // Rows for Top Trends Table
    const topTrendsRows = topTrends
      .slice(0, 6)
      .map((item, index) => {
        const confPercent = Math.round((item.confidence || 0.9) * 100);
        return `
        <tr style="border-bottom: 1px solid #edf2f7;">
          <td style="padding: 12px 14px; font-weight: bold; color: #4a5568; text-align: center;">#${index + 1}</td>
          <td style="padding: 12px 14px;">
            <div style="font-weight: 600; color: #1a202c; font-size: 14px;">${item.name}</div>
            <div style="font-size: 12px; color: #718096; margin-top: 3px;">${item.reason || ''}</div>
          </td>
          <td style="padding: 12px 14px; text-align: center;">
            <span style="display: inline-block; padding: 4px 8px; background: #e6fffa; color: #234e52; border-radius: 9999px; font-size: 12px; font-weight: 600;">
              ${confPercent}%
            </span>
          </td>
          <td style="padding: 12px 14px; font-size: 13px; color: #2d3748;">
            ${item.recommendedAction || 'Theo dõi'}
          </td>
        </tr>`;
      })
      .join('');

    // Category progress bars
    const categoryCards = categoryInsights
      .map((cat) => {
        const isSpike = cat.status && cat.status.includes('đột phá');
        const badgeBg = isSpike ? '#fed7d7' : '#feebc8';
        const badgeColor = isSpike ? '#9b2c2c' : '#744210';
        return `
        <div style="margin-bottom: 14px; padding: 12px 16px; background: #f7fafc; border-radius: 8px; border-left: 4px solid ${isSpike ? '#e53e3e' : '#dd6b20'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 14px; color: #2d3748;">${cat.category}</strong>
            <span style="font-size: 11px; padding: 2px 8px; background: ${badgeBg}; color: ${badgeColor}; border-radius: 4px; font-weight: 600;">${cat.status}</span>
          </div>
          <div style="font-size: 12px; color: #4a5568; line-height: 1.5;">${cat.prediction}</div>
        </div>`;
      })
      .join('');

    // Forecast Predictions
    const forecastRows = predictions
      .map((p) => {
        let actionBadge = `<span style="padding: 3px 8px; background: #e2e8f0; color: #4a5568; border-radius: 4px; font-size: 11px; font-weight: 600;">THEO DÕI</span>`;
        if (p.action === 'stock_up') {
          actionBadge = `<span style="padding: 3px 8px; background: #c6f6d5; color: #22543d; border-radius: 4px; font-size: 11px; font-weight: 600;">NHẬP HÀNG</span>`;
        } else if (p.action === 'reduce') {
          actionBadge = `<span style="padding: 3px 8px; background: #fed7d7; color: #9b2c2c; border-radius: 4px; font-size: 11px; font-weight: 600;">GIẢM TỒN</span>`;
        } else if (p.action === 'new_opportunity') {
          actionBadge = `<span style="padding: 3px 8px; background: #bee3f8; color: #2a4365; border-radius: 4px; font-size: 11px; font-weight: 600;">CƠ HỘI MỚI</span>`;
        }

        return `
        <div style="padding: 10px 0; border-bottom: 1px dashed #e2e8f0;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; font-weight: 600; color: #1a202c;">${p.productOrCategory}</span>
            ${actionBadge}
          </div>
          <div style="font-size: 12px; color: #718096; margin-top: 3px;">
            Dự báo 7 ngày: ${p.predictedTrend} (Độ tin cậy: ${Math.round((p.confidence || 0.9) * 100)}%)
          </div>
        </div>`;
      })
      .join('');

    // Opportunities Cards
    const opportunityCards = opportunities
      .map(
        (opp) => `
      <div style="margin-bottom: 12px; padding: 12px 14px; background: #f0fff4; border: 1px solid #c6f6d5; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #22543d; font-size: 13px;">💡 ${opp.product}</strong>
          <span style="font-size: 11px; background: #9ae6b4; color: #22543d; padding: 2px 6px; border-radius: 4px; font-weight: bold;">ROI: ${opp.potentialROI}</span>
        </div>
        <p style="margin: 6px 0 0; font-size: 12px; color: #276749; line-height: 1.4;">${opp.reason}</p>
      </div>`
      )
      .join('');

    // Warning Cards
    const warningCards = warnings
      .map(
        (w) => `
      <div style="margin-bottom: 12px; padding: 12px 14px; background: #fffaf0; border: 1px solid #feebc8; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #c05621; font-size: 13px;">⚠️ ${w.issue}</strong>
        </div>
        <p style="margin: 6px 0 0; font-size: 12px; color: #7b341e; line-height: 1.4;"><strong>Giải pháp:</strong> ${w.suggestion}</p>
      </div>`
      )
      .join('');

    // Recommended Products Cards
    const recProductsHtml = recommendedProducts
      .map(
        (rp) => `
      <li style="margin-bottom: 8px; font-size: 13px; color: #2d3748;">
        <strong>${rp.name}</strong> - Giá gợi ý: <span style="color: #d69e2e; font-weight: 600;">${currencyFmt(rp.suggestedPrice)}</span>
        <br><span style="font-size: 12px; color: #718096;">Mục tiêu: ${rp.targetAudience} - ${rp.reason}</span>
      </li>`
      )
      .join('');

    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Báo Cáo Xu Hướng Thị Trường Mini Pancake</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 24px 10px; color: #2d3748;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    
    <!-- HEADER -->
    <tr>
      <td style="background: linear-gradient(135deg, #dd6b20 0%, #b7791f 50%, #d69e2e 100%); padding: 28px 24px; text-align: left; color: #ffffff;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">🥞 Mini Pancake Intelligence</h1>
            <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.95;">Báo Cáo Xu Hướng Thị Trường & Dự Báo 7 Ngày</p>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; padding: 4px 12px; background: rgba(255,255,255,0.25); border-radius: 20px; font-size: 12px; font-weight: 700;">
              ${dateStr}
            </span>
          </div>
        </div>
      </td>
    </tr>

    <!-- EXECUTIVE SUMMARY -->
    <tr>
      <td style="padding: 24px;">
        <div style="background: #ebf8ff; border: 1px solid #bee3f8; border-radius: 8px; padding: 18px 20px;">
          <h3 style="margin: 0 0 8px; color: #2b6cb0; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px;">📊 Tóm Tắt Xu Hướng Hôm Nay</h3>
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #2d3748;">${summary}</p>
        </div>
      </td>
    </tr>

    <!-- TOP TRENDING PRODUCTS -->
    <tr>
      <td style="padding: 0 24px 24px;">
        <h3 style="margin: 0 0 14px; font-size: 16px; color: #1a202c; border-bottom: 2px solid #ed8936; padding-bottom: 6px; display: inline-block;">
          🔥 Top Sản Phẩm Đang Bùng Nổ
        </h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #edf2f7; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #f7fafc; color: #4a5568; font-size: 12px; text-transform: uppercase;">
              <th style="padding: 10px 14px; text-align: center; width: 40px;">Hạng</th>
              <th style="padding: 10px 14px; text-align: left;">Sản Phẩm & Phân Tích</th>
              <th style="padding: 10px 14px; text-align: center; width: 70px;">Tin cậy</th>
              <th style="padding: 10px 14px; text-align: left; width: 140px;">Khuyến Nghị</th>
            </tr>
          </thead>
          <tbody>
            ${topTrendsRows || '<tr><td colspan="4" style="padding: 12px; text-align: center;">Chưa có dữ liệu.</td></tr>'}
          </tbody>
        </table>
      </td>
    </tr>

    <!-- CATEGORY INSIGHTS -->
    <tr>
      <td style="padding: 0 24px 24px;">
        <h3 style="margin: 0 0 14px; font-size: 16px; color: #1a202c; border-bottom: 2px solid #3182ce; padding-bottom: 6px; display: inline-block;">
          📈 Xu Hướng Ngành Hàng
        </h3>
        ${categoryCards || '<p style="font-size: 13px; color: #718096;">Đang cập nhật phân tích ngành hàng.</p>'}
      </td>
    </tr>

    <!-- 7-DAY FORECAST -->
    <tr>
      <td style="padding: 0 24px 24px;">
        <div style="background: #faf5ff; border: 1px solid #e9d8fd; border-radius: 8px; padding: 18px 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; color: #6b46c1; font-size: 15px; text-transform: uppercase;">
              🔮 Dự Báo 7 Ngày Tới
            </h3>
            <span style="font-size: 12px; font-weight: bold; color: #553c9a; background: #d6bcfa; padding: 3px 8px; border-radius: 4px;">
              Triển vọng: ${forecast.marketOutlook || 'Tích cực'}
            </span>
          </div>
          ${forecastRows || '<p style="font-size: 13px; color: #718096;">Chưa có dữ liệu dự báo.</p>'}

          ${
            recommendedProducts.length > 0
              ? `
          <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #e9d8fd;">
            <strong style="font-size: 13px; color: #553c9a;">🎯 Gợi Ý Sản Phẩm Nên Nhập Mới:</strong>
            <ul style="margin: 8px 0 0; padding-left: 18px;">
              ${recProductsHtml}
            </ul>
          </div>`
              : ''
          }
        </div>
      </td>
    </tr>

    <!-- OPPORTUNITIES & WARNINGS -->
    <tr>
      <td style="padding: 0 24px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" valign="top" style="padding-right: 10px;">
              <h4 style="margin: 0 0 10px; font-size: 14px; color: #22543d; text-transform: uppercase;">🚀 Cơ Hội Kinh Doanh</h4>
              ${opportunityCards || '<p style="font-size: 12px; color: #718096;">Không có cảnh báo mới.</p>'}
            </td>
            <td width="50%" valign="top" style="padding-left: 10px;">
              <h4 style="margin: 0 0 10px; font-size: 14px; color: #9c4221; text-transform: uppercase;">⚠️ Cảnh Báo Rủi Ro</h4>
              ${warningCards || '<p style="font-size: 12px; color: #718096;">Không có rủi ro lớn.</p>'}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background: #f7fafc; padding: 20px 24px; border-top: 1px solid #edf2f7; text-align: center; color: #718096; font-size: 12px; line-height: 1.6;">
        <p style="margin: 0; font-weight: 600; color: #4a5568;">Mini Pancake - Nền tảng Quản trị Bán lẻ & F&B Đa Kênh Tự Động</p>
        <p style="margin: 4px 0 0;">Báo cáo được khởi tạo tự động bởi AI Trend Analyst vào lúc 06:00 hằng ngày (Giờ Việt Nam).</p>
        <p style="margin: 6px 0 0; font-size: 11px; color: #a0aec0;">
          Dữ liệu tổng hợp từ Google Trends, TikTok Shop, Shopee và Lazada • Độc quyền lưu hành nội bộ.
        </p>
      </td>
    </tr>

  </table>
</body>
</html>
`;
  }
}

export default EmailService;

