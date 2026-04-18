// Public e-signature endpoints. No auth required — authentication is by single-use token.
const express = require('express');
const crypto = require('crypto');
const { get, run } = require('../db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const router = express.Router();

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function loadLink(token) {
  const link = await get(
    `SELECT * FROM signing_links WHERE token_hash = ?`,
    [hashToken(token)]
  );
  if (!link) throw new HttpError('رابط توقيع غير صالح', 404);
  if (link.used_at) throw new HttpError('تم استخدام رابط التوقيع من قبل', 410);
  if (new Date(link.expires_at) < new Date()) throw new HttpError('انتهت صلاحية رابط التوقيع', 410);
  return link;
}

// GET — fetch the contract tied to a signing token (for the public signing page)
router.get('/contracts/sign/:token', asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  const contract = await get(
    `SELECT c.id, c.title, c.description, c.contract_type, c.content, c.status,
            c.start_date, c.end_date, c.value, c.currency,
            c.signed_by_client, c.signed_by_firm,
            cl.first_name AS client_first, cl.last_name AS client_last,
            f.name AS firm_name, f.name_ar AS firm_name_ar
     FROM contracts c
     LEFT JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN firms f ON f.id = c.firm_id
     WHERE c.id = ? AND c.deleted_at IS NULL`,
    [link.contract_id]
  );
  if (!contract) throw new HttpError('العقد غير موجود', 404);
  res.json({
    success: true,
    data: {
      contract,
      party: link.party,
      signer_name: link.signer_name,
      signer_email: link.signer_email,
      expires_at: link.expires_at
    }
  });
}));

// POST — capture the signature
router.post('/contracts/sign/:token', asyncHandler(async (req, res) => {
  const { signature_data_url, signer_name } = req.body || {};
  if (!signature_data_url || !signature_data_url.startsWith('data:image/')) {
    throw new HttpError('توقيع غير صالح', 400);
  }
  if (signature_data_url.length > 500000) { // ~500KB cap
    throw new HttpError('حجم التوقيع كبير جداً', 413);
  }
  const link = await loadLink(req.params.token);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

  // Apply to contract first so we don't burn the token on failure
  if (link.party === 'client') {
    await run(
      `UPDATE contracts SET signed_by_client = 1, client_signature_url = ?,
         status = CASE WHEN signed_by_firm = 1 THEN 'signed' ELSE status END,
         signed_at = CASE WHEN signed_by_firm = 1 THEN datetime('now') ELSE signed_at END,
         updated_at = datetime('now')
       WHERE id = ?`,
      [signature_data_url, link.contract_id]
    );
  } else {
    await run(
      `UPDATE contracts SET signed_by_firm = 1, firm_signature_url = ?,
         status = CASE WHEN signed_by_client = 1 THEN 'signed' ELSE status END,
         signed_at = CASE WHEN signed_by_client = 1 THEN datetime('now') ELSE signed_at END,
         updated_at = datetime('now')
       WHERE id = ?`,
      [signature_data_url, link.contract_id]
    );
  }

  await run(
    `UPDATE signing_links SET used_at = datetime('now'), signature_data_url = ?, signer_name = COALESCE(?, signer_name), signer_ip = ?
     WHERE id = ?`,
    [signature_data_url, signer_name || null, ip, link.id]
  );

  res.json({ success: true });
}));

module.exports = router;
