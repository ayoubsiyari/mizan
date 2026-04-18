// Background worker: scans deadlines and hearings, creates in-app notifications
// for reminder windows that just opened. Runs on an interval inside the API process.
const { all, run, get } = require('./db');
const { uuid } = require('./utils/crud');

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function notify(firmId, userId, title, message, data = {}, type = 'warning') {
  // De-dupe: if an identical unread notification already exists, skip.
  const existing = await get(
    `SELECT id FROM notifications WHERE firm_id = ? AND user_id = ? AND title = ? AND message = ? AND is_read = 0`,
    [firmId, userId || null, title, message]
  );
  if (existing) return;
  await run(
    `INSERT INTO notifications (id, firm_id, user_id, title, message, type, channel, data)
     VALUES (?, ?, ?, ?, ?, ?, 'in_app', ?)`,
    [uuid(), firmId, userId || null, title, message, type, JSON.stringify(data)]
  );
}

async function scanDeadlines() {
  const rows = await all(
    `SELECT * FROM deadlines WHERE deleted_at IS NULL AND status = 'open'`
  );
  const now = Date.now();
  for (const d of rows) {
    let reminderDays = [];
    try { reminderDays = JSON.parse(d.reminder_days || '[]'); } catch {}
    const due = new Date(d.due_at.replace(' ', 'T') + (d.due_at.includes('Z') ? '' : 'Z')).getTime();
    const deltaDays = Math.floor((due - now) / 86400000);

    // Mark missed
    if (due < now) {
      await run(`UPDATE deadlines SET status = 'missed', updated_at = datetime('now') WHERE id = ?`, [d.id]);
      await notify(
        d.firm_id, d.assigned_to || d.created_by,
        `⚠️ موعد نهائي فائت: ${d.title}`,
        `فات الموعد النهائي. يجب المراجعة فوراً.`,
        { deadlineId: d.id, caseId: d.case_id }, 'error'
      );
      continue;
    }

    // Fire when delta matches (or is less than) a reminder window and we haven't fired for this window yet
    const last = d.last_reminder_at ? new Date(d.last_reminder_at).getTime() : 0;
    for (const win of reminderDays.sort((a, b) => b - a)) {
      if (deltaDays <= win && last < due - win * 86400000) {
        await notify(
          d.firm_id, d.assigned_to || d.created_by,
          `⏰ موعد نهائي قادم: ${d.title}`,
          `${deltaDays === 0 ? 'اليوم' : `خلال ${deltaDays} ${deltaDays === 1 ? 'يوم' : 'أيام'}`} — ${new Date(due).toLocaleDateString('ar-SA-u-nu-latn')}`,
          { deadlineId: d.id, caseId: d.case_id }, 'warning'
        );
        await run(`UPDATE deadlines SET last_reminder_at = datetime('now') WHERE id = ?`, [d.id]);
        break;
      }
    }
  }
}

async function scanHearings() {
  const rows = await all(
    `SELECT h.*, c.assigned_lawyer_id FROM hearings h
     LEFT JOIN cases c ON c.id = h.case_id
     WHERE h.deleted_at IS NULL AND h.status = 'scheduled'
       AND datetime(h.scheduled_at) BETWEEN datetime('now') AND datetime('now', '+2 days')
       AND h.reminder_sent = 0`
  );
  for (const h of rows) {
    const when = new Date(h.scheduled_at.replace(' ', 'T') + (h.scheduled_at.includes('Z') ? '' : 'Z'));
    const userId = h.assigned_lawyer_id || h.created_by;
    await notify(
      h.firm_id, userId,
      `🏛️ جلسة قادمة: ${h.title || 'جلسة'}`,
      `${when.toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })}${h.court_name ? ' • ' + h.court_name : ''}`,
      { hearingId: h.id, caseId: h.case_id }, 'info'
    );
  }
}

async function tick() {
  try { await scanDeadlines(); } catch (e) { console.error('[reminder] deadlines:', e.message); }
  try { await scanHearings(); }  catch (e) { console.error('[reminder] hearings:', e.message);  }
}

async function ensureHearingsFlag() {
  // Schema originally doesn't have reminder_sent on hearings in the new SQLite schema;
  // add it lazily if missing.
  try {
    const cols = await all(`PRAGMA table_info(hearings)`);
    if (!cols.some((c) => c.name === 'reminder_sent')) {
      await run(`ALTER TABLE hearings ADD COLUMN reminder_sent INTEGER DEFAULT 0`);
    }
  } catch (e) { /* ignore */ }
}

function start() {
  ensureHearingsFlag().then(() => {
    setTimeout(tick, 5000);           // run once shortly after startup
    setInterval(tick, INTERVAL_MS);
    console.log(`[reminder] worker started (every ${INTERVAL_MS / 1000}s)`);
  });
}

module.exports = { start, tick };
