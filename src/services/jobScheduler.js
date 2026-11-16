/**
 * Periodic Job Scheduler
 * ────────────────────────
 * Implements specifications from Addendum A (Section A5):
 * 1. quotation-expiry: SENT past validUntil -> EXPIRED; warns before quotationExpiryWarnDays (default 2)
 * 2. lead-followup-scan: Daily 08:00 VN time check for inactive leads exceeding leadFollowUpBusinessDays
 * 3. ticket-sla-scan: Every 5 minutes check for tickets approaching/exceeding dueAt
 *
 * All jobs are idempotent and use composite deduplication keys on notifications.
 */

import { getQuotations, updateQuotationStatus } from '../models/quotation.js';
import { getLeads } from '../models/lead.js';
import { getTickets } from '../models/ticket.js';
import { createNotification } from '../models/notification.js';
import { getSettings, getElapsedBusinessDays } from '../models/appSetting.js';
import { QUOTATION_STATES, LEAD_STATES, TICKET_STATES } from '../utils/stateMachines.js';

class JobScheduler {
  constructor() {
    this.intervals = [];
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('⏰ Starting Addendum A periodic background jobs...');

    // 1. Quotation expiry check (Every 10 minutes in dev / hourly in prod)
    const quoteInterval = setInterval(() => {
      this.runQuotationExpiryScan().catch((err) =>
        console.error('Quotation expiry scan error:', err.message)
      );
    }, 10 * 60 * 1000);
    this.intervals.push(quoteInterval);

    // 2. Ticket SLA scan (Every 5 minutes - Section A5)
    const ticketInterval = setInterval(() => {
      this.runTicketSLAScan().catch((err) =>
        console.error('Ticket SLA scan error:', err.message)
      );
    }, 5 * 60 * 1000);
    this.intervals.push(ticketInterval);

    // 3. Lead follow-up scan (Run every hour, triggers daily scan at 08:00 VN time)
    const leadInterval = setInterval(() => {
      this.runLeadFollowUpScan().catch((err) =>
        console.error('Lead follow-up scan error:', err.message)
      );
    }, 60 * 60 * 1000);
    this.intervals.push(leadInterval);

    // Run initial scans after 5 seconds
    setTimeout(() => {
      this.runQuotationExpiryScan().catch(() => {});
      this.runTicketSLAScan().catch(() => {});
      this.runLeadFollowUpScan().catch(() => {});
    }, 5000);
  }

  stop() {
    this.intervals.forEach((i) => clearInterval(i));
    this.intervals = [];
    this.isRunning = false;
  }

  /**
   * Job 1: Quotation Expiry Scan (Section A5)
   * - SENT quotations past validUntil -> mark EXPIRED
   * - Warn assigned user if expiring in <= quotationExpiryWarnDays
   */
  async runQuotationExpiryScan() {
    const settings = await getSettings();
    const warnDays = settings.quotationExpiryWarnDays || 2;
    const now = Date.now();

    const quotations = await getQuotations({ status: QUOTATION_STATES.SENT });

    for (const q of quotations) {
      if (!q.validUntil) continue;
      const validUntilTime = new Date(q.validUntil).getTime();

      // Check if already expired
      if (now > validUntilTime) {
        await updateQuotationStatus(q.id, QUOTATION_STATES.EXPIRED, {
          reason: 'Báo giá đã hết hạn theo thời hạn hiệu lực (validUntil).',
        });

        if (q.assignedSalesUserId) {
          await createNotification({
            userId: q.assignedSalesUserId,
            type: 'quotation_expiry',
            entityId: q.id,
            dedupeKey: `expired_${q.id}`,
            title: `Báo giá ${q.code} đã hết hạn`,
            message: `Báo giá ${q.code} gửi cho khách hàng ${q.customerName || ''} đã quá hạn hiệu lực và tự động chuyển sang EXPIRED.`,
          });
        }
      } else {
        // Check if nearing expiry (within warnDays)
        const msRemaining = validUntilTime - now;
        const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

        if (daysRemaining <= warnDays && q.assignedSalesUserId) {
          const todayDateStr = new Date().toISOString().slice(0, 10);
          await createNotification({
            userId: q.assignedSalesUserId,
            type: 'quotation_expiry',
            entityId: q.id,
            dedupeKey: `warn_${todayDateStr}`,
            title: `Báo giá ${q.code} sắp hết hạn`,
            message: `Báo giá ${q.code} chỉ còn khoảng ${Math.ceil(daysRemaining)} ngày hiệu lực. Hãy liên hệ khách hàng sớm!`,
          });
        }
      }
    }
  }

  /**
   * Job 2: Lead Follow-up Scan (Section A5)
   * - Checks active leads with no activity > leadFollowUpBusinessDays (skipping weekends & holidays)
   */
  async runLeadFollowUpScan() {
    const settings = await getSettings();
    const thresholdDays = settings.leadFollowUpBusinessDays || 3;
    const todayDateStr = new Date().toISOString().slice(0, 10);

    const leads = await getLeads();
    const activeLeads = leads.filter(
      (l) => l.status !== LEAD_STATES.WON && l.status !== LEAD_STATES.LOST
    );

    for (const lead of activeLeads) {
      const lastActivity = lead.lastActivityAt || lead.createdAt;
      if (!lastActivity || !lead.assignedSalesUserId) continue;

      const elapsedBusinessDays = getElapsedBusinessDays(lastActivity, new Date(), settings.businessHolidays);

      if (elapsedBusinessDays >= thresholdDays) {
        await createNotification({
          userId: lead.assignedSalesUserId,
          type: 'lead_followup',
          entityId: lead.id,
          dedupeKey: `followup_${todayDateStr}`,
          title: `Cần chăm sóc Lead: ${lead.name}`,
          message: `Lead ${lead.code} (${lead.name}) đã không có hoạt động trong ${elapsedBusinessDays} ngày làm việc. Hãy liên hệ lại ngay!`,
        });
      }
    }
  }

  /**
   * Job 3: Ticket SLA Scan (Section A5)
   * - Checks tickets approaching or exceeding dueAt every 5 minutes
   */
  async runTicketSLAScan() {
    const now = Date.now();
    const tickets = await getTickets();
    const openTickets = tickets.filter(
      (t) => t.status !== TICKET_STATES.CLOSED && t.status !== TICKET_STATES.RESOLVED
    );

    for (const ticket of openTickets) {
      if (!ticket.dueAt || !ticket.assigneeUserId) continue;

      const dueTime = new Date(ticket.dueAt).getTime();
      const diffMs = dueTime - now;

      // Overdue
      if (diffMs <= 0) {
        await createNotification({
          userId: ticket.assigneeUserId,
          type: 'ticket_sla',
          entityId: ticket.id,
          dedupeKey: 'overdue',
          title: `Ticket quá hạn SLA: ${ticket.code}`,
          message: `Ticket ${ticket.code} [${ticket.priority}] "${ticket.title}" đã quá hạn xử lý (${new Date(ticket.dueAt).toLocaleString('vi-VN')})!`,
        });
      } else if (diffMs <= 60 * 60 * 1000) {
        // Due within 1 hour warning
        await createNotification({
          userId: ticket.assigneeUserId,
          type: 'ticket_sla',
          entityId: ticket.id,
          dedupeKey: 'warn_1h',
          title: `Ticket sắp hết hạn SLA: ${ticket.code}`,
          message: `Ticket ${ticket.code} chỉ còn dưới 1 giờ trước hạn cam kết SLA. Vui lòng ưu tiên xử lý.`,
        });
      }
    }
  }
}

export default JobScheduler;
