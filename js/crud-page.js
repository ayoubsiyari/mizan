// Reusable CRUD page controller.
// Usage:
//   CrudPage.render(root, ctx, {
//     resource: '/clients',
//     columns: [{ key, label, render? }, ...],
//     filters: [{ key, label, type, options? }],  // type: 'text' | 'select'
//     form: [{ key, label, type, required?, options?, width? }],  // type: text, email, tel, number, date, datetime-local, select, textarea
//     title: 'الموكلون',
//     addLabel: 'إضافة موكل',
//     stats: async (ctx) => [{ value, label }],
//     onBeforeSubmit?: (values) => values,
//     rowActions?: [{ label, onClick(row, ctx) }]
//   });
(function () {
  async function render(root, ctx, opts) {
    const { api, esc, openModal, toast, confirmModal } = ctx;
    let page = 1, query = '', filterValues = {};

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">${esc(opts.title)}</h2>
          ${opts.subtitle ? `<p class="page-subtitle">${esc(opts.subtitle)}</p>` : ''}
        </div>
        <button class="btn btn-primary" id="crudAddBtn">+ ${esc(opts.addLabel || 'إضافة')}</button>
      </div>
      <div class="stats-row" id="crudStats" style="display:none"></div>
      <div class="filters card" style="padding:12px">
        <input type="text" id="crudSearch" placeholder="بحث..." style="flex:1;min-width:200px">
        ${(opts.filters || []).map(f => renderFilter(f)).join('')}
        <button class="btn btn-secondary btn-sm" id="crudClear">مسح الفلاتر</button>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>${opts.columns.map(c => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
          <tbody id="crudTbody"><tr><td class="empty" colspan="${opts.columns.length + 1}">جارِ التحميل...</td></tr></tbody>
        </table>
      </div>
      <div class="pagination" id="crudPagination"></div>`;

    // Stats
    if (opts.stats) {
      try {
        const items = await opts.stats(ctx);
        const host = root.querySelector('#crudStats');
        host.style.display = 'grid';
        host.innerHTML = items.map(s => `
          <div class="stat-card">
            <div class="stat-value">${esc(s.value)}</div>
            <div class="stat-label">${esc(s.label)}</div>
          </div>`).join('');
      } catch (e) { /* non-fatal */ }
    }

    function renderFilter(f) {
      if (f.type === 'select') {
        return `<select data-filter="${f.key}">
          <option value="">${esc(f.label)}</option>
          ${f.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
        </select>`;
      }
      return `<input type="${f.type || 'text'}" data-filter="${f.key}" placeholder="${esc(f.label)}">`;
    }

    async function load() {
      const tbody = root.querySelector('#crudTbody');
      tbody.innerHTML = `<tr><td class="empty" colspan="${opts.columns.length + 1}">جارِ التحميل...</td></tr>`;
      try {
        const { data, pagination } = await api(opts.resource, { params: { page, limit: 20, q: query, ...filterValues } });
        if (!data.length) {
          tbody.innerHTML = `<tr><td class="empty" colspan="${opts.columns.length + 1}">لا توجد نتائج</td></tr>`;
        } else {
          tbody.innerHTML = data.map(row => `
            <tr data-id="${row.id}" class="crud-row">
              ${opts.columns.map(c => `<td>${c.render ? c.render(row, ctx) : esc(row[c.key])}</td>`).join('')}
              <td class="actions">
                ${(opts.rowActions || []).map((a, i) => `<button class="btn btn-sm btn-secondary" data-action="custom" data-index="${i}">${esc(a.label)}</button>`).join('')}
                <button class="btn btn-sm btn-secondary" data-action="edit">تعديل</button>
                <button class="btn btn-sm btn-danger" data-action="delete">حذف</button>
              </td>
            </tr>`).join('');
          // Make rows look clickable
          root.querySelectorAll('#crudTbody tr.crud-row').forEach((tr) => {
            tr.style.cursor = 'pointer';
          });
        }
        renderPagination(pagination);
      } catch (err) {
        tbody.innerHTML = `<tr><td class="empty" colspan="${opts.columns.length + 1}">خطأ: ${esc(err.message)}</td></tr>`;
      }
    }

    function renderPagination(p) {
      const host = root.querySelector('#crudPagination');
      if (!p || p.totalPages <= 1) { host.innerHTML = ''; return; }
      const pages = [];
      for (let i = 1; i <= p.totalPages; i++) pages.push(i);
      host.innerHTML = `
        <button ${p.page <= 1 ? 'disabled' : ''} data-page="${p.page - 1}">السابق</button>
        ${pages.map(i => `<button data-page="${i}" class="${i === p.page ? 'active' : ''}">${i}</button>`).join('')}
        <button ${p.page >= p.totalPages ? 'disabled' : ''} data-page="${p.page + 1}">التالي</button>`;
    }

    // Interactions
    root.querySelector('#crudSearch').addEventListener('input', debounce((e) => { query = e.target.value; page = 1; load(); }, 300));
    root.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('change', () => {
        filterValues = {};
        root.querySelectorAll('[data-filter]').forEach((x) => { if (x.value) filterValues[x.dataset.filter] = x.value; });
        page = 1; load();
      });
    });
    root.querySelector('#crudClear').addEventListener('click', () => {
      root.querySelectorAll('[data-filter]').forEach((x) => (x.value = ''));
      root.querySelector('#crudSearch').value = '';
      query = ''; filterValues = {}; page = 1; load();
    });
    root.querySelector('#crudPagination').addEventListener('click', (e) => {
      const p = e.target.closest('button[data-page]');
      if (p && !p.disabled) { page = parseInt(p.dataset.page, 10); load(); }
    });
    root.querySelector('#crudAddBtn').addEventListener('click', () => openForm(null));
    root.querySelector('#crudTbody').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      const tr = e.target.closest('tr.crud-row');
      if (!btn && tr) {
        // Row click (not on an action button) -> open detail view
        const id = tr.dataset.id;
        try {
          const { data } = await api(`${opts.resource}/${id}`);
          openDetail(data);
        } catch (err) { toast(err.message, 'error'); }
        return;
      }
      if (!btn) return;
      const id = btn.closest('tr').dataset.id;
      if (btn.dataset.action === 'edit') {
        const { data } = await api(`${opts.resource}/${id}`);
        openForm(data);
      } else if (btn.dataset.action === 'delete') {
        if (!(await confirmModal('هل أنت متأكد من الحذف؟'))) return;
        try { await api(`${opts.resource}/${id}`, { method: 'DELETE' }); toast('تم الحذف', 'success'); load(); }
        catch (err) { toast(err.message, 'error'); }
      } else if (btn.dataset.action === 'custom') {
        const action = opts.rowActions[parseInt(btn.dataset.index, 10)];
        const { data: row } = await api(`${opts.resource}/${id}`);
        await action.onClick(row, ctx);
      }
    });

    // ---- Detail view ----
    async function openDetail(row) {
      // Build label list from union of columns + form fields (forms have richer labels).
      const formFields = opts.form
        ? (typeof opts.form === 'function' ? await opts.form(ctx, row) : opts.form)
        : [];
      const byKey = new Map();
      // Use column labels first (shorter), then fill in form-only fields.
      (opts.columns || []).forEach(c => byKey.set(c.key, { key: c.key, label: c.label, render: c.render }));
      formFields.forEach(f => {
        if (!byKey.has(f.key)) byKey.set(f.key, { key: f.key, label: f.label, type: f.type, options: f.options });
      });

      // Hidden/internal fields we never want to show
      const HIDE = new Set(['id','firm_id','deleted_at','password_hash','settings']);
      const SYSTEM_DATE_KEYS = ['created_at','updated_at'];

      // Resolve a value for display
      function fmtValue(meta, value) {
        if (value == null || value === '') return '—';
        if (meta.render) {
          try { return meta.render(row, ctx); } catch { /* fall through */ }
        }
        if (meta.options) {
          const opt = meta.options.find(o => String(o.value) === String(value));
          if (opt) return esc(opt.label);
        }
        if (meta.type === 'date' || /(_date|_at)$/.test(meta.key)) {
          return esc(ctx.fmtDateSmart ? ctx.fmtDateSmart(value) : ctx.fmtDate(value));
        }
        if (meta.type === 'datetime-local') {
          return esc(ctx.fmtDateTime(value));
        }
        if (meta.type === 'textarea' || (typeof value === 'string' && value.length > 80)) {
          return `<div style="white-space:pre-wrap">${esc(value)}</div>`;
        }
        return esc(value);
      }

      const rows = [];
      byKey.forEach((meta) => {
        if (HIDE.has(meta.key)) return;
        if (!(meta.key in row)) return;
        rows.push(`
          <div class="detail-row">
            <div class="detail-label">${esc(meta.label || meta.key)}</div>
            <div class="detail-value">${fmtValue(meta, row[meta.key])}</div>
          </div>`);
      });

      // System timestamps at the end if present
      SYSTEM_DATE_KEYS.forEach(k => {
        if (row[k]) {
          rows.push(`
            <div class="detail-row sys">
              <div class="detail-label">${k === 'created_at' ? 'أنشئ في' : 'آخر تحديث'}</div>
              <div class="detail-value">${esc(ctx.fmtDateTime(row[k]))}</div>
            </div>`);
        }
      });

      // Pick a modal title: prefer title > name > first_name+last_name > first column value
      const title = row.title
        || row.name
        || (row.first_name ? `${row.first_name} ${row.last_name || ''}`.trim() : null)
        || row.invoice_number
        || row.case_number
        || (opts.columns[0] && row[opts.columns[0].key])
        || 'التفاصيل';

      const style = `
        <style>
          .detail-grid { display: grid; gap: 0; max-height: 60vh; overflow: auto; }
          .detail-row { display: grid; grid-template-columns: 180px 1fr; gap: 16px; padding: 10px 4px; border-bottom: 1px solid var(--border); }
          .detail-row:last-child { border-bottom: 0; }
          .detail-label { color: var(--muted); font-weight: 600; font-size: .9rem; }
          .detail-value { color: #111827; word-break: break-word; }
          .detail-row.sys { background: #fafafa; }
          @media (max-width: 600px) {
            .detail-row { grid-template-columns: 1fr; gap: 2px; }
          }
        </style>`;
      const contentHTML = `${style}<div class="detail-grid">${rows.join('')}</div>`;

      openModal({
        title: esc(title),
        contentHTML,
        okText: 'تعديل',
        cancelText: 'إغلاق',
        onOk: async () => {
          openForm(row);
          return true;
        }
      });
    }

    async function openForm(existing) {
      const values = existing || {};
      const fields = typeof opts.form === 'function' ? await opts.form(ctx, existing) : opts.form;
      const content = `<form id="crudForm" class="form-grid" onsubmit="event.preventDefault()">
        ${fields.map(f => fieldHTML(f, values[f.key])).join('')}
      </form>`;
      const modal = openModal({
        title: existing ? 'تعديل' : 'إضافة',
        contentHTML: content,
        okText: 'حفظ',
        onOk: async (body) => {
          const form = body.querySelector('#crudForm');
          let data = formValues(form, fields);
          if (opts.onBeforeSubmit) data = (await opts.onBeforeSubmit(data, existing, ctx)) || data;
          try {
            if (existing) await api(`${opts.resource}/${existing.id}`, { method: 'PUT', body: data });
            else await api(opts.resource, { method: 'POST', body: data });
            toast('تم الحفظ', 'success');
            load();
            return true;
          } catch (err) { toast(err.message, 'error'); return false; }
        }
      });
      // Optional hook: lets pages add interactive behaviour (e.g. dependent dropdowns)
      if (typeof opts.onFormReady === 'function') {
        const form = modal.body.querySelector('#crudForm');
        try { await opts.onFormReady(form, ctx, existing || null); }
        catch (err) { console.error('onFormReady error', err); }
      }
    }

    function fieldHTML(f, value) {
      const id = `f_${f.key}`;
      const width = f.width === 'full' ? ' full' : '';
      const common = `id="${id}" name="${f.key}" ${f.required ? 'required' : ''}`;
      let input;
      if (f.type === 'textarea') {
        input = `<textarea ${common}>${esc(value == null ? '' : value)}</textarea>`;
      } else if (f.type === 'select') {
        input = `<select ${common}>
          ${f.options.map(o => `<option value="${esc(o.value)}" ${String(value) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>`;
      } else {
        let v = value == null ? '' : value;
        if ((f.type === 'date' || f.type === 'datetime-local') && v) {
          v = String(v).slice(0, f.type === 'date' ? 10 : 16).replace(' ', 'T');
        }
        input = `<input type="${f.type || 'text'}" ${common} value="${esc(v)}">`;
      }
      return `<div class="form-field${width}"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
    }

    function formValues(form, fields) {
      const out = {};
      for (const f of fields) {
        const el = form.elements[f.key];
        if (!el) continue;
        let v = el.value;
        if (v === '') v = null;
        else if (f.type === 'number') v = Number(v);
        else if (f.type === 'datetime-local' && v) v = new Date(v).toISOString();
        out[f.key] = v;
      }
      return out;
    }

    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

    load();
  }

  window.CrudPage = { render };
})();
