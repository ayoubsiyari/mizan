const express = require('express');
const { authRequired } = require('../middleware/auth');
const { get, all } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authRequired);

router.get('/overview', asyncHandler(async (req, res) => {
  const firmId = req.user.firm_id;

  const q = (sql) => get(sql, [firmId]);

  const clients = await q(`SELECT COUNT(*) AS n FROM clients WHERE firm_id = ? AND deleted_at IS NULL`);
  const activeCases = await q(`SELECT COUNT(*) AS n FROM cases WHERE firm_id = ? AND deleted_at IS NULL AND status = 'active'`);
  const pendingTasks = await q(`SELECT COUNT(*) AS n FROM tasks WHERE firm_id = ? AND deleted_at IS NULL AND status IN ('pending','in_progress')`);
  const overdueTasks = await q(`SELECT COUNT(*) AS n FROM tasks WHERE firm_id = ? AND deleted_at IS NULL AND status != 'completed' AND due_date < datetime('now')`);
  const documents = await q(`SELECT COUNT(*) AS n FROM documents WHERE firm_id = ? AND deleted_at IS NULL`);
  const upcomingHearings = await q(`SELECT COUNT(*) AS n FROM hearings WHERE firm_id = ? AND deleted_at IS NULL AND scheduled_at >= datetime('now') AND status = 'scheduled'`);
  const unreadNotifications = await get(
    `SELECT COUNT(*) AS n FROM notifications WHERE firm_id = ? AND user_id = ? AND is_read = 0`,
    [firmId, req.user.id]
  );

  const monthRevenue = await q(
    `SELECT COALESCE(SUM(paid_amount), 0) AS total FROM invoices
     WHERE firm_id = ? AND deleted_at IS NULL AND strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')`
  );
  const newClientsThisMonth = await q(
    `SELECT COUNT(*) AS n FROM clients WHERE firm_id = ? AND deleted_at IS NULL
     AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
  );
  const closedCasesThisMonth = await q(
    `SELECT COUNT(*) AS n FROM cases WHERE firm_id = ? AND deleted_at IS NULL
     AND status IN ('closed','archived')
     AND strftime('%Y-%m', updated_at) = strftime('%Y-%m', 'now')`
  );

  res.json({
    success: true,
    data: {
      totalClients: clients.n,
      activeCases: activeCases.n,
      pendingTasks: pendingTasks.n,
      overdueTasks: overdueTasks.n,
      documentsCount: documents.n,
      upcomingHearings: upcomingHearings.n,
      unreadNotifications: unreadNotifications.n,
      thisMonthRevenue: monthRevenue.total,
      newClientsThisMonth: newClientsThisMonth.n,
      closedCasesThisMonth: closedCasesThisMonth.n
    }
  });
}));

router.get('/cases', asyncHandler(async (req, res) => {
  const firmId = req.user.firm_id;
  const byStatus = await all(
    `SELECT status, COUNT(*) AS count FROM cases WHERE firm_id = ? AND deleted_at IS NULL GROUP BY status`,
    [firmId]
  );
  const byType = await all(
    `SELECT case_type, COUNT(*) AS count FROM cases WHERE firm_id = ? AND deleted_at IS NULL GROUP BY case_type`,
    [firmId]
  );
  res.json({ success: true, data: { byStatus, byType } });
}));

router.get('/financial', asyncHandler(async (req, res) => {
  const firmId = req.user.firm_id;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const monthly = await all(
    `SELECT strftime('%m', invoice_date) AS month,
            COALESCE(SUM(paid_amount), 0) AS revenue
     FROM invoices WHERE firm_id = ? AND deleted_at IS NULL AND strftime('%Y', invoice_date) = ?
     GROUP BY month ORDER BY month`,
    [firmId, String(year)]
  );
  res.json({ success: true, data: { year, monthly } });
}));

router.get('/clients', asyncHandler(async (req, res) => {
  const firmId = req.user.firm_id;
  const rows = await all(
    `SELECT c.id, c.first_name, c.last_name,
            (SELECT COUNT(*) FROM cases WHERE client_id = c.id AND deleted_at IS NULL) AS cases_count,
            (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE client_id = c.id AND deleted_at IS NULL) AS total_billed
     FROM clients c WHERE c.firm_id = ? AND c.deleted_at IS NULL
     ORDER BY total_billed DESC LIMIT 50`,
    [firmId]
  );
  res.json({ success: true, data: rows });
}));

router.get('/productivity', asyncHandler(async (req, res) => {
  const firmId = req.user.firm_id;
  const rows = await all(
    `SELECT u.id, u.first_name, u.last_name,
            (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND status = 'completed' AND deleted_at IS NULL) AS completed_tasks,
            (SELECT COUNT(*) FROM cases WHERE assigned_lawyer_id = u.id AND deleted_at IS NULL) AS active_cases
     FROM users u WHERE u.firm_id = ? AND u.deleted_at IS NULL
     ORDER BY completed_tasks DESC`,
    [firmId]
  );
  res.json({ success: true, data: rows });
}));

module.exports = router;
