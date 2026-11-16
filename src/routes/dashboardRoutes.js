/**
 * Dashboard Routes (Chỉ Số & Báo Cáo)
 * ─────────────────────────────────────
 * Implements endpoints from Addendum A (Section A6 & A2):
 * - GET /api/dashboard/summary
 * - GET /api/dashboard/funnel
 * - GET /api/dashboard/sales-by-period
 * - GET /api/dashboard/work-queue
 * - Scoped to user's own metrics if SALES / CUSTOMER_CARE
 */

import { Router } from 'express';
import { getOrders } from '../models/order.js';
import { getLeads } from '../models/lead.js';
import { getTickets } from '../models/ticket.js';
import { getFollowUps } from '../models/followUp.js';
import { requirePermission } from '../middleware/rbac.js';
import { ORDER_STATES, LEAD_STATES, TICKET_STATES } from '../utils/stateMachines.js';

const router = Router();

// ── GET /summary ─ Overall KPIs ─────────────────────────────
router.get('/summary', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const isRestricted = req.permissionScope === 'Own';
    const userId = req.user.uid;

    const orders = await getOrders(isRestricted ? { assignedSalesUserId: userId } : {});
    const leads = await getLeads(isRestricted ? { assignedSalesUserId: userId } : {});
    const tickets = await getTickets(isRestricted ? { assigneeUserId: userId } : {});

    const completedOrders = orders.filter((o) => o.status === ORDER_STATES.COMPLETED);
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total) || Number(o.totalAmount) || 0), 0);

    const activeLeads = leads.filter((l) => l.status !== LEAD_STATES.WON && l.status !== LEAD_STATES.LOST).length;
    const wonLeads = leads.filter((l) => l.status === LEAD_STATES.WON).length;
    const openTickets = tickets.filter((t) => t.status !== TICKET_STATES.CLOSED && t.status !== TICKET_STATES.RESOLVED).length;

    return res.json({
      success: true,
      data: {
        totalRevenue,
        completedOrdersCount: completedOrders.length,
        totalOrdersCount: orders.length,
        activeLeadsCount: activeLeads,
        wonLeadsCount: wonLeads,
        openTicketsCount: openTickets,
        isOwnMetrics: isRestricted,
      },
    });
  } catch (error) {
    console.error('GET /dashboard/summary error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /funnel ─ Sales conversion funnel ───────────────────
router.get('/funnel', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const isRestricted = req.permissionScope === 'Own';
    const leads = await getLeads(isRestricted ? { assignedSalesUserId: req.user.uid } : {});

    const counts = {
      NEW: leads.filter((l) => l.status === LEAD_STATES.NEW).length,
      CONTACTED: leads.filter((l) => l.status === LEAD_STATES.CONTACTED).length,
      INTERESTED: leads.filter((l) => l.status === LEAD_STATES.INTERESTED).length,
      QUOTATION: leads.filter((l) => l.status === LEAD_STATES.QUOTATION).length,
      WON: leads.filter((l) => l.status === LEAD_STATES.WON).length,
      LOST: leads.filter((l) => l.status === LEAD_STATES.LOST).length,
      TOTAL: leads.length,
    };

    return res.json({ success: true, data: counts });
  } catch (error) {
    console.error('GET /dashboard/funnel error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /sales-by-period ─ Sales timeline ───────────────────
router.get('/sales-by-period', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const isRestricted = req.permissionScope === 'Own';
    const orders = await getOrders(isRestricted ? { assignedSalesUserId: req.user.uid } : {});
    const completed = orders.filter((o) => o.status === ORDER_STATES.COMPLETED);

    // Group by last 7 days
    const dailyMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      dailyMap[dateKey] = 0;
    }

    completed.forEach((o) => {
      const dateKey = (o.createdAt || '').slice(0, 10);
      if (dailyMap[dateKey] !== undefined) {
        dailyMap[dateKey] += Number(o.total) || Number(o.totalAmount) || 0;
      }
    });

    const series = Object.entries(dailyMap).map(([date, revenue]) => ({ date, revenue }));
    return res.json({ success: true, data: series });
  } catch (error) {
    console.error('GET /dashboard/sales-by-period error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /work-queue ─ Agent daily operational task list ─────
router.get('/work-queue', async (req, res) => {
  try {
    const userId = req.user.uid;
    const [leads, followUps, tickets] = await Promise.all([
      getLeads({ assignedSalesUserId: userId }),
      getFollowUps({ assigneeUserId: userId, status: 'PENDING' }),
      getTickets({ assigneeUserId: userId }),
    ]);

    const activeLeads = leads.filter(
      (l) => l.status !== LEAD_STATES.WON && l.status !== LEAD_STATES.LOST
    );
    const pendingTickets = tickets.filter(
      (t) => t.status !== TICKET_STATES.CLOSED && t.status !== TICKET_STATES.RESOLVED
    );

    return res.json({
      success: true,
      data: {
        activeLeads,
        pendingFollowUps: followUps,
        pendingTickets,
      },
    });
  } catch (error) {
    console.error('GET /dashboard/work-queue error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
