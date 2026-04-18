const express = require('express');
const crypto = require('crypto');
const { authRequired, requireRole } = require('../middleware/auth');
const { crudRouter, uuid } = require('../utils/crud');
const { all, get, run } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { renderContractHTML } = require('../utils/print');

const router = express.Router();
router.use(authRequired);

// Starter Saudi templates, in Arabic with merge fields.
const STARTER_TEMPLATES = [
  {
    title: 'عقد وكالة عامة',
    contract_type: 'وكالة',
    description: 'قالب توكيل عام قابل للتعديل.',
    content: `بسم الله الرحمن الرحيم\n\nعقد وكالة\n\nأقر أنا الموكّل: {{client_name}}، الحامل لرقم الهوية: {{client_national_id}}،\nبأنني قد وكّلت السيد/ {{lawyer_name}} — المحامي، بصفته وكيلاً عني في:\n\n{{subject}}\n\nوللوكيل الحق في تمثيلي أمام المحاكم وإدارات الحقوق والإدعاء العام وكل الجهات الرسمية ذات العلاقة، وله حق الإقرار والإنكار والصلح والمخاصمة والاستلام والتسليم.\n\nحُرّر هذا العقد في مدينة {{city}} بتاريخ {{date}}.\n\nالموكّل: ________________________\nالوكيل: ________________________`
  },
  {
    title: 'عقد إيجار سكني',
    contract_type: 'إيجار',
    description: 'قالب عقد إيجار سكني سنوي.',
    content: `عقد إيجار سكني\n\nالطرف الأول (المؤجّر): {{landlord_name}}\nالطرف الثاني (المستأجر): {{client_name}}\n\nالعقار المؤجّر: {{property}}\nالمدة: سنة هجرية/ميلادية تبدأ من {{start_date}} وتنتهي في {{end_date}}\nالأجرة السنوية: {{annual_rent}} ريال سعودي، تُدفع على دفعات حسب الاتفاق.\n\nالتزامات المستأجر:\n1. المحافظة على العين المؤجّرة.\n2. عدم التأجير من الباطن دون إذن.\n3. سداد فواتير الخدمات.\n\nحُرّر هذا العقد من نسختين، بيد كل طرف نسخة، وذلك في {{city}} بتاريخ {{date}}.\n\nالمؤجّر: ________________________    المستأجر: ________________________`
  },
  {
    title: 'عقد عمل',
    contract_type: 'عمل',
    description: 'قالب عقد عمل وفق نظام العمل السعودي.',
    content: `عقد عمل\n\nالطرف الأول (صاحب العمل): {{firm_name}}\nالطرف الثاني (العامل): {{client_name}}\n\nالمسمّى الوظيفي: {{job_title}}\nتاريخ المباشرة: {{start_date}}\nمدة التجربة: 90 يوماً\nالراتب الأساسي: {{salary}} ريال سعودي شهرياً.\n\nساعات العمل: 8 ساعات يومياً / 48 ساعة أسبوعياً، مع يوم راحة أسبوعي.\n\nتسري على هذا العقد أحكام نظام العمل السعودي.\n\nصاحب العمل: ________________________    العامل: ________________________\nالتاريخ: {{date}}`
  },
  {
    title: 'مذكرة دفاع',
    contract_type: 'مذكرة',
    description: 'قالب مذكرة دفاع قضائية.',
    content: `بسم الله الرحمن الرحيم\n\nفضيلة القاضي المحترم / ناظر الدعوى رقم: {{case_number}}\nالمدعي: {{plaintiff}}\nالمدعى عليه: {{client_name}}\n\nمذكرة دفاع\n\nبعد التحية،\nأتشرف بأن أقدّم لفضيلتكم مذكرة الدفاع التالية عن موكّلي:\n\n1. الدفع الأول: {{defense_1}}\n2. الدفع الثاني: {{defense_2}}\n3. الدفع الثالث: {{defense_3}}\n\nبناءً عليه، نلتمس من فضيلتكم:\n- الحكم برد الدعوى\n- إلزام المدعي بالرسوم والمصاريف\n\nوتقبّلوا فائق الاحترام،\nالمحامي: {{lawyer_name}}\nالتاريخ: {{date}}`
  }
];

// Admin: seed starter templates (idempotent: skips existing titles).
router.post('/seed-templates', requireRole('admin'), asyncHandler(async (req, res) => {
  let inserted = 0;
  for (const t of STARTER_TEMPLATES) {
    const exists = await get(
      `SELECT id FROM contracts WHERE firm_id = ? AND title = ? AND status = 'template' AND deleted_at IS NULL`,
      [req.user.firm_id, t.title]
    );
    if (exists) continue;
    const id = uuid();
    // template contracts use a synthetic client (first client of firm) or a placeholder id pattern.
    // We relax the schema: client_id is NOT NULL — use any existing client, else bail on seed.
    const anyClient = await get(`SELECT id FROM clients WHERE firm_id = ? AND deleted_at IS NULL LIMIT 1`, [req.user.firm_id]);
    if (!anyClient) {
      throw new HttpError('أضف موكلاً واحداً على الأقل قبل تهيئة القوالب', 400);
    }
    await run(
      `INSERT INTO contracts (id, firm_id, client_id, title, description, contract_type, content, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'template', ?)`,
      [id, req.user.firm_id, anyClient.id, t.title, t.description, t.contract_type, t.content, req.user.id]
    );
    inserted++;
  }
  res.json({ success: true, data: { inserted, total: STARTER_TEMPLATES.length } });
}));

// Printable HTML view (browser → Ctrl+P → PDF). Arabic RTL renders perfectly in the browser.
router.get('/:id/print', asyncHandler(async (req, res) => {
  const contract = await get(
    `SELECT c.*, cl.first_name AS client_first, cl.last_name AS client_last, cl.national_id AS client_nid,
            f.name AS firm_name, f.name_ar AS firm_name_ar, f.license_number, f.phone AS firm_phone,
            f.email AS firm_email, f.address AS firm_address
     FROM contracts c
     LEFT JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN firms   f  ON f.id  = c.firm_id
     WHERE c.id = ? AND c.firm_id = ? AND c.deleted_at IS NULL`,
    [req.params.id, req.user.firm_id]
  );
  if (!contract) throw new HttpError('Not Found', 404);
  res.type('html').send(renderContractHTML(contract));
}));

// Issue an e-signature link (auth required to create)
router.post('/:id/signing-link', asyncHandler(async (req, res) => {
  const { party = 'client', signer_name = null, signer_email = null, ttl_hours = 72 } = req.body || {};
  const contract = await get(
    `SELECT id FROM contracts WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [req.params.id, req.user.firm_id]
  );
  if (!contract) throw new HttpError('Not Found', 404);

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires = new Date(Date.now() + ttl_hours * 3600 * 1000).toISOString();
  await run(
    `INSERT INTO signing_links (id, firm_id, contract_id, token_hash, party, signer_name, signer_email, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), req.user.firm_id, req.params.id, tokenHash, party, signer_name, signer_email, expires, req.user.id]
  );
  const origin = `${req.protocol}://${req.get('host')}`;
  res.status(201).json({
    success: true,
    data: { token: rawToken, url: `${origin}/pages/sign.html?token=${rawToken}`, expires_at: expires }
  });
}));

router.get('/templates', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT * FROM contracts WHERE firm_id = ? AND status = 'template' AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.user.firm_id]
  );
  res.json({ success: true, data: rows });
}));

router.post('/generate', asyncHandler(async (req, res) => {
  const { templateId, data, client_id, case_id } = req.body || {};
  if (!templateId || !client_id) throw new HttpError('templateId and client_id required', 400);
  const tpl = await get(
    `SELECT * FROM contracts WHERE id = ? AND firm_id = ? AND deleted_at IS NULL`,
    [templateId, req.user.firm_id]
  );
  if (!tpl) throw new HttpError('Template not found', 404);

  // Simple {{key}} interpolation
  let content = tpl.content || '';
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      content = content.split(`{{${k}}}`).join(String(v));
    }
  }

  const id = uuid();
  await run(
    `INSERT INTO contracts (id, firm_id, client_id, case_id, title, description, contract_type,
       template_id, content, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      id, req.user.firm_id, client_id, case_id || null,
      tpl.title, tpl.description, tpl.contract_type, tpl.id, content, req.user.id
    ]
  );
  const row = await get(`SELECT * FROM contracts WHERE id = ?`, [id]);
  res.status(201).json({ success: true, data: row });
}));

router.post('/:id/sign', asyncHandler(async (req, res) => {
  const { party = 'client' } = req.body || {};
  const col = party === 'firm' ? 'signed_by_firm' : 'signed_by_client';
  const r = await run(
    `UPDATE contracts SET ${col} = 1,
       status = CASE WHEN signed_by_client = 1 AND signed_by_firm = 1 THEN 'signed' ELSE status END,
       signed_at = CASE WHEN signed_by_client = 1 AND signed_by_firm = 1 THEN datetime('now') ELSE signed_at END,
       updated_at = datetime('now')
     WHERE id = ? AND firm_id = ?`,
    [req.params.id, req.user.firm_id]
  );
  if (r.changes === 0) throw new HttpError('Not Found', 404);
  const row = await get(`SELECT * FROM contracts WHERE id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
}));

const base = crudRouter({
  table: 'contracts',
  allowedFields: [
    'client_id', 'case_id', 'title', 'description', 'contract_type', 'template_id',
    'content', 'status', 'start_date', 'end_date', 'value', 'currency',
    'expires_at', 'tags'
  ],
  searchable: ['title', 'description', 'contract_type'],
  filterable: ['status', 'contract_type', 'client_id', 'case_id'],
  beforeCreate: (req, data) => ({ ...data, created_by: req.user.id })
});

router.use('/', base);
module.exports = router;
