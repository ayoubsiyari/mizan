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
            <tr data-id="${row.id}">
              ${opts.columns.map(c => `<td>${c.render ? c.render(row, ctx) : esc(row[c.key])}</td>`).join('')}
              <td class="actions">
                ${(opts.rowActions || []).map((a, i) => `<button class="btn btn-sm btn-secondary" data-action="custom" data-index="${i}">${esc(a.label)}</button>`).join('')}
                <button class="btn btn-sm btn-secondary" data-action="edit">تعديل</button>
                <button class="btn btn-sm btn-danger" data-action="delete">حذف</button>
              </td>
            </tr>`).join('');
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
      if (!btn) return;
      const tr = btn.closest('tr');
      const id = tr.dataset.id;
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
