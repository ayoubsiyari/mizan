// HTML renderers for printable (→ Browser PDF) views.
// Arabic/RTL rendering is delegated to the browser — no font shaping needed.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const COMMON_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Amiri', 'Noto Naskh Arabic', 'Tajawal', 'Arial', sans-serif; direction: rtl; color: #111; margin: 0; padding: 24px; background: #fff; }
  .wrap { max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a472a; padding-bottom: 12px; margin-bottom: 20px; }
  .firm { font-size: 1.6rem; font-weight: 700; color: #1a472a; }
  .firm .sub { font-size: .85rem; color: #555; font-weight: 400; margin-top: 4px; }
  .meta { text-align: left; font-size: .85rem; color: #555; line-height: 1.8; }
  .title { text-align: center; font-size: 1.5rem; font-weight: 700; margin: 20px 0 10px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; }
  .parties .box { border: 1px solid #e5e7eb; padding: 12px 16px; border-radius: 8px; background: #f9fafb; }
  .parties .label { color: #6b7280; font-size: .8rem; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: .95rem; }
  table th, table td { padding: 10px; border: 1px solid #d1d5db; text-align: right; }
  table th { background: #f3f4f6; }
  .totals { margin-inline-start: auto; width: 320px; }
  .totals td { padding: 8px 10px; }
  .totals .grand { font-weight: 700; font-size: 1.1rem; background: #1a472a; color: #fff; }
  .content { white-space: pre-wrap; line-height: 2; font-size: 1rem; text-align: justify; margin: 20px 0; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 40px; }
  .sig-box { border-top: 1px solid #333; padding-top: 10px; text-align: center; }
  .sig-img { max-width: 200px; max-height: 80px; margin-bottom: 6px; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: .8rem; }
  .btn-print { position: fixed; top: 16px; left: 16px; padding: 10px 16px; background: #1a472a; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-family: inherit; }
  @media print { .btn-print { display: none !important; } }
`;

function formatArabicDate(v) {
  if (!v) return '';
  try {
    const d = new Date(v.includes(' ') ? v.replace(' ', 'T') + 'Z' : v);
    return d.toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return esc(v); }
}

function formatMoney(n, currency = 'SAR') {
  const v = Number(n || 0);
  // Latin digits in Arabic layout: "1,234.50 ر.س"
  try { return new Intl.NumberFormat('ar-SA-u-nu-latn', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v); }
  catch { return v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ر.س'; }
}

function renderInvoiceHTML(invoice, items = []) {
  const rows = items.map((it) => `
    <tr>
      <td>${esc(it.description)}</td>
      <td>${Number(it.quantity || 0).toLocaleString('en-US')}</td>
      <td>${formatMoney(it.unit_price, invoice.currency)}</td>
      <td>${formatMoney(it.total_amount, invoice.currency)}</td>
    </tr>`).join('');

  const hasItems = items.length > 0;

  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><title>فاتورة ${esc(invoice.invoice_number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
<style>${COMMON_CSS}</style>
</head><body onload="setTimeout(()=>window.print(), 400)">
<button class="btn-print" onclick="window.print()">🖨️ طباعة</button>
<div class="wrap">
  <div class="header">
    <div>
      <div class="firm">${esc(invoice.firm_name_ar || invoice.firm_name || '')}</div>
      ${invoice.license_number ? `<div class="sub">رقم الترخيص: ${esc(invoice.license_number)}</div>` : ''}
      ${invoice.firm_phone ? `<div class="sub">الهاتف: ${esc(invoice.firm_phone)}</div>` : ''}
      ${invoice.firm_email ? `<div class="sub">البريد: ${esc(invoice.firm_email)}</div>` : ''}
    </div>
    <div class="meta">
      <div><strong>فاتورة رقم:</strong> ${esc(invoice.invoice_number)}</div>
      <div><strong>تاريخ الإصدار:</strong> ${formatArabicDate(invoice.invoice_date)}</div>
      <div><strong>تاريخ الاستحقاق:</strong> ${formatArabicDate(invoice.due_date)}</div>
    </div>
  </div>

  <div class="title">فاتورة ضريبية</div>

  <div class="parties">
    <div class="box">
      <div class="label">المُصدِر</div>
      <div>${esc(invoice.firm_name_ar || invoice.firm_name || '')}</div>
      ${invoice.firm_address ? `<div>${esc(invoice.firm_address)}</div>` : ''}
    </div>
    <div class="box">
      <div class="label">الموكل</div>
      <div>${esc((invoice.client_first || '') + ' ' + (invoice.client_last || ''))}</div>
      ${invoice.client_nid ? `<div>رقم الهوية: ${esc(invoice.client_nid)}</div>` : ''}
    </div>
  </div>

  <h3 style="margin:20px 0 8px">${esc(invoice.title)}</h3>
  ${invoice.description ? `<p>${esc(invoice.description)}</p>` : ''}

  ${hasItems ? `
  <table>
    <thead><tr><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>` : ''}

  <table class="totals">
    <tr><td>المبلغ قبل الضريبة</td><td>${formatMoney(invoice.subtotal, invoice.currency)}</td></tr>
    <tr><td>الضريبة (${Number(invoice.tax_rate || 0)}%)</td><td>${formatMoney(invoice.tax_amount, invoice.currency)}</td></tr>
    ${Number(invoice.discount_amount) ? `<tr><td>الخصم</td><td>- ${formatMoney(invoice.discount_amount, invoice.currency)}</td></tr>` : ''}
    <tr class="grand"><td>الإجمالي</td><td>${formatMoney(invoice.total_amount, invoice.currency)}</td></tr>
    ${Number(invoice.paid_amount) ? `<tr><td>المدفوع</td><td>${formatMoney(invoice.paid_amount, invoice.currency)}</td></tr>` : ''}
    ${Number(invoice.total_amount) - Number(invoice.paid_amount || 0) > 0 ? `<tr><td>المستحق</td><td>${formatMoney(Number(invoice.total_amount) - Number(invoice.paid_amount || 0), invoice.currency)}</td></tr>` : ''}
  </table>

  ${invoice.payment_terms ? `<p style="margin-top:20px"><strong>شروط الدفع:</strong> ${esc(invoice.payment_terms)}</p>` : ''}
  ${invoice.notes ? `<p><strong>ملاحظات:</strong> ${esc(invoice.notes)}</p>` : ''}

  <div class="footer">شكراً لتعاملكم معنا — ${esc(invoice.firm_name_ar || invoice.firm_name || '')}</div>
</div>
</body></html>`;
}

function renderContractHTML(contract) {
  const clientSig = contract.client_signature_url
    ? `<img class="sig-img" src="${esc(contract.client_signature_url)}" alt="توقيع الموكل">`
    : '';
  const firmSig = contract.firm_signature_url
    ? `<img class="sig-img" src="${esc(contract.firm_signature_url)}" alt="توقيع المكتب">`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><title>${esc(contract.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
<style>${COMMON_CSS}</style>
</head><body onload="setTimeout(()=>window.print(), 400)">
<button class="btn-print" onclick="window.print()">🖨️ طباعة</button>
<div class="wrap">
  <div class="header">
    <div>
      <div class="firm">${esc(contract.firm_name_ar || contract.firm_name || '')}</div>
      ${contract.license_number ? `<div class="sub">رقم الترخيص: ${esc(contract.license_number)}</div>` : ''}
      ${contract.firm_phone ? `<div class="sub">الهاتف: ${esc(contract.firm_phone)}</div>` : ''}
    </div>
    <div class="meta">
      <div>${formatArabicDate(contract.created_at)}</div>
      ${contract.contract_type ? `<div>${esc(contract.contract_type)}</div>` : ''}
    </div>
  </div>

  <div class="title">${esc(contract.title)}</div>

  <div class="content">${esc(contract.content)}</div>

  <div class="signatures">
    <div class="sig-box">
      ${firmSig}
      <div>توقيع المكتب</div>
      ${contract.signed_by_firm ? `<div style="color:#16a34a;font-size:.85rem">✓ موقّع</div>` : ''}
    </div>
    <div class="sig-box">
      ${clientSig}
      <div>توقيع الموكل: ${esc((contract.client_first || '') + ' ' + (contract.client_last || ''))}</div>
      ${contract.signed_by_client ? `<div style="color:#16a34a;font-size:.85rem">✓ موقّع</div>` : ''}
    </div>
  </div>

  <div class="footer">${esc(contract.firm_name_ar || contract.firm_name || '')}${contract.firm_email ? ' — ' + esc(contract.firm_email) : ''}</div>
</div>
</body></html>`;
}

module.exports = { renderInvoiceHTML, renderContractHTML };
