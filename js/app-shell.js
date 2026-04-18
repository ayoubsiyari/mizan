// App shell: auth gate, sidebar + header, global toast, api helper.
// Each page calls AppShell.mount({ page, title, subtitle, render }).

(function () {
  const NAV = [
    { key: 'dashboard', label: 'لوحة التحكم',  href: 'dashboard.html', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
    { key: 'reception', label: 'الاستقبال',     href: 'reception.html', icon: 'M3 12l2-2 4 4 8-8 4 4M3 21h18' },
    { key: 'clients',   label: 'الموكلون',     href: 'clients.html',   icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { key: 'cases',     label: 'القضايا',       href: 'cases.html',     icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8' },
    { key: 'hearings',  label: 'الجلسات',       href: 'hearings.html',  icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10' },
    { key: 'documents', label: 'المستندات',     href: 'documents.html', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6' },
    { key: 'calendar',  label: 'التقويم',        href: 'calendar.html',  icon: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18' },
    { key: 'tasks',     label: 'المهام',         href: 'tasks.html',     icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
    { key: 'deadlines', label: 'المواعيد النهائية', href: 'deadlines.html', icon: 'M12 2v10l4 4M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z' },
    { key: 'time',      label: 'الساعات',         href: 'time.html',      icon: 'M12 6v6l4 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z' },
    { key: 'notes',     label: 'الملاحظات',     href: 'notes.html',     icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8' },
    { key: 'contracts', label: 'العقود',         href: 'contracts.html', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6' },
    { key: 'billing',   label: 'الفواتير',       href: 'billing.html',   icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    { key: 'trust',     label: 'حساب الأمانات',   href: 'trust.html',     icon: 'M3 10h18M5 6l7-4 7 4M5 6v12h14V6M9 10v8M15 10v8' },
    { key: 'courts',    label: 'المحاكم والقضاة', href: 'courts.html',    icon: 'M3 21h18M5 21V10M19 21V10M3 10h18M12 3L3 10h18z' },
    { key: 'reports',   label: 'التقارير',       href: 'reports.html',   icon: 'M18 20V10M12 20V4M6 20v-6' },
    { key: 'settings',  label: 'الإعدادات',     href: 'settings.html',  icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }
  ];

  const ROLE_LABELS = { admin: 'المسؤول', lawyer: 'محامي', assistant: 'مساعد', paralegal: 'مساعد قانوني' };

  // ---------- API helper ----------
  async function api(path, { method = 'GET', body, params, signal } = {}) {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (localStorage.getItem('authToken') || '')
      },
      signal
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`/api${path}${qs}`, opts);
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
      throw new Error('Unauthorized');
    }
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data.success === false) {
      const msg = data.error || data.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  async function apiUpload(path, file, extra = {}) {
    const form = new FormData();
    form.append('file', file);
    Object.entries(extra).forEach(([k, v]) => v !== undefined && v !== null && form.append(k, v));
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('authToken') || '') },
      body: form
    });
    if (res.status === 401) { window.location.href = 'login.html'; throw new Error('Unauthorized'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // ---------- Document preview ----------
  // Opens a modal preview for a document. Supports PDFs (iframe), images, text
  // and video/audio. Unsupported types fall back to a download CTA.
  async function previewDocument(doc) {
    if (!doc || !doc.id) return;
    const token = localStorage.getItem('authToken') || '';
    // Fetch with auth, then build an in-memory blob URL so <iframe>/<img>/... work.
    const resp = await fetch(`/api/documents/${doc.id}/download`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!resp.ok) { toast('تعذر تحميل الملف', 'error'); return; }
    const mime = doc.file_mime_type || resp.headers.get('content-type') || '';
    const blob = await resp.blob();
    // Force the blob's mime (some browsers derive preview from blob.type).
    const typed = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
    const url = URL.createObjectURL(typed);

    const name = doc.file_name || doc.title || 'ملف';
    let viewer;
    if (mime.startsWith('image/')) {
      viewer = `<img src="${url}" alt="" style="max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:6px">`;
    } else if (mime === 'application/pdf') {
      viewer = `<iframe src="${url}" style="width:100%;height:75vh;border:1px solid var(--border);border-radius:6px" title="PDF"></iframe>`;
    } else if (mime.startsWith('video/')) {
      viewer = `<video src="${url}" controls style="max-width:100%;max-height:70vh;display:block;margin:0 auto"></video>`;
    } else if (mime.startsWith('audio/')) {
      viewer = `<audio src="${url}" controls style="width:100%"></audio>`;
    } else if (mime.startsWith('text/') || /\.(txt|csv|md|json|xml|log)$/i.test(name)) {
      const text = await typed.text();
      viewer = `<pre style="background:#f9fafb;padding:12px;border:1px solid var(--border);border-radius:6px;max-height:70vh;overflow:auto;white-space:pre-wrap;direction:ltr;text-align:left">${esc(text)}</pre>`;
    } else {
      viewer = `
        <div style="text-align:center;padding:30px">
          <div style="font-size:3rem;margin-bottom:10px">📄</div>
          <div style="color:var(--muted);margin-bottom:14px">لا يمكن معاينة هذا النوع من الملفات مباشرةً</div>
          <a href="${url}" download="${esc(name)}" class="btn btn-primary">تحميل الملف</a>
        </div>`;
    }

    const meta = [
      doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : null,
      mime || null
    ].filter(Boolean).join(' • ');

    const modal = openModal({
      title: esc(name),
      contentHTML: `
        ${meta ? `<div style="color:var(--muted);font-size:.85rem;margin-bottom:10px">${esc(meta)}</div>` : ''}
        ${viewer}
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <a href="${url}" download="${esc(name)}" class="btn btn-secondary btn-sm">⬇ تحميل</a>
          <a href="${url}" target="_blank" class="btn btn-secondary btn-sm">فتح في نافذة جديدة</a>
        </div>`,
      okText: 'إغلاق',
      cancelText: null
    });
    // Release the blob URL when modal closes
    const release = () => setTimeout(() => URL.revokeObjectURL(url), 200);
    modal.body.closest('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop') || e.target.classList.contains('close') || e.target.classList.contains('ok')) release();
    }, { once: false });
  }

  // ---------- Toasts ----------
  function ensureToastHost() {
    let host = document.querySelector('.toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    return host;
  }
  function toast(message, kind = 'info', ttl = 3000) {
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 200); }, ttl);
  }

  // ---------- Modal ----------
  function openModal({ title, contentHTML, onOk, okText = 'حفظ', cancelText = 'إلغاء' }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <header>
          <h3>${title}</h3>
          <button class="close" type="button" aria-label="إغلاق">×</button>
        </header>
        <div class="body"></div>
        <footer>
          <button class="btn btn-primary ok" type="button">${okText}</button>
          ${cancelText ? `<button class="btn btn-secondary cancel" type="button">${cancelText}</button>` : ''}
        </footer>
      </div>`;
    document.body.appendChild(backdrop);
    const body = backdrop.querySelector('.body');
    if (typeof contentHTML === 'string') body.innerHTML = contentHTML;
    else if (contentHTML instanceof Node) body.appendChild(contentHTML);

    const close = () => backdrop.remove();
    backdrop.querySelector('.close').addEventListener('click', close);
    const cancelBtn = backdrop.querySelector('.cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.ok').addEventListener('click', async () => {
      try {
        const result = onOk ? await onOk(body) : true;
        if (result !== false) close();
      } catch (err) { toast(err.message || 'حدث خطأ', 'error'); }
    });
    return { close, body };
  }

  function confirmModal(message) {
    return new Promise((resolve) => {
      const m = openModal({
        title: 'تأكيد',
        contentHTML: `<p>${message}</p>`,
        okText: 'تأكيد',
        onOk: () => { resolve(true); return true; }
      });
      m.body.parentElement.querySelector('.cancel').addEventListener('click', () => resolve(false));
      m.body.parentElement.querySelector('.close').addEventListener('click', () => resolve(false));
    });
  }

  // ---------- Helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function fmtDate(v) {
    if (!v) return '';
    try { return new Date(v.replace(' ', 'T') + (v.includes('Z') ? '' : 'Z')).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return esc(v); }
  }
  function fmtDateTime(v) {
    if (!v) return '';
    try { return new Date(v.replace(' ', 'T') + (v.includes('Z') ? '' : 'Z')).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return esc(v); }
  }
  function fmtMoney(n, currency = 'SAR') {
    const v = Number(n || 0);
    // Use Arabic locale but force Latin (Western) digits via the 'nu-latn' extension,
    // so amounts render as "1,234.50 ر.س" instead of "١٬٢٣٤٫٥٠ ر.س".
    try { return new Intl.NumberFormat('ar-SA-u-nu-latn', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v); }
    catch { return v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ر.س'; }
  }

  // Hijri date: defaults to localStorage preference 'mizan_cal' ('gregorian' | 'hijri').
  function getCalendar() { return localStorage.getItem('mizan_cal') || 'gregorian'; }
  function setCalendar(c) { localStorage.setItem('mizan_cal', c); }
  function fmtHijri(v, opts = { year: 'numeric', month: 'long', day: 'numeric' }) {
    if (!v) return '';
    try {
      const d = new Date(v.replace(' ', 'T') + (v.includes('Z') ? '' : 'Z'));
      return d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', opts) + ' هـ';
    } catch { return esc(v); }
  }
  function fmtDateSmart(v) {
    return getCalendar() === 'hijri' ? fmtHijri(v) : fmtDate(v);
  }

  // Filter NAV by the user's nav_permissions (admin/null = all).
  // Always keep 'settings' so every user can edit profile / password.
  function navForUser(user) {
    if (!user) return NAV;
    if (user.role === 'admin') return NAV;
    const perms = Array.isArray(user.nav_permissions) ? user.nav_permissions : null;
    if (!perms) return NAV; // null = full access by default
    return NAV.filter((n) => perms.includes(n.key) || n.key === 'settings');
  }

  // ---------- Mount ----------
  function mount(cfg) {
    // Auth gate
    const token = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!token || !user) {
      window.location.href = 'login.html';
      return;
    }

    // Enforce page access: if the user isn't allowed to see the page they're on,
    // bounce them to the first item they can see (or dashboard).
    const visibleNav = navForUser(user);
    if (cfg.page && !visibleNav.some((n) => n.key === cfg.page) && user.role !== 'admin') {
      const fallback = visibleNav[0];
      if (fallback && fallback.href !== location.pathname.split('/').pop()) {
        window.location.replace(fallback.href);
        return;
      }
    }

    const sidebarHTML = `
      <aside class="shell-sidebar">
        <div class="brand">
          <img src="../assets/images/logo.svg" alt="ميزان" onerror="this.style.display='none'">
          <span class="brand-title">ميزان</span>
        </div>
        <nav>
          <ul>
            ${visibleNav.map(n => `
              <li>
                <a href="${n.href}" data-nav="${n.key}" class="${cfg.page === n.key ? 'active' : ''}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${n.icon}"></path></svg>
                  <span>${n.label}</span>
                </a>
              </li>
            `).join('')}
          </ul>
        </nav>
      </aside>`;

    const initials = ((user.first_name || '?')[0] + (user.last_name || '')[0] || '?').toUpperCase();
    const headerHTML = `
      <header class="shell-header">
        <button class="hamburger" id="menuToggle" aria-label="القائمة">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <h1>${esc(cfg.title || '')}</h1>
        <div class="spacer"></div>
        <div class="search-container">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" class="search-input" placeholder="بحث عام... (Ctrl+K)" id="globalSearch">
          <div class="search-results" style="display:none"></div>
        </div>
        <div class="user-menu">
          <div class="user-info">
            <div class="name">${esc((user.first_name || '') + ' ' + (user.last_name || ''))}</div>
            <div class="role">${ROLE_LABELS[user.role] || user.role || ''}</div>
          </div>
          <div class="user-avatar">${esc(initials)}</div>
          <button class="icon-btn" id="calToggle" title="تبديل التقويم (هجري/ميلادي)" aria-label="تبديل التقويم">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span id="calLabel" style="margin-inline-start:4px;font-size:.75rem">${getCalendar() === 'hijri' ? 'هـ' : 'م'}</span>
          </button>
          <button class="icon-btn" id="logoutBtn" title="تسجيل الخروج" aria-label="تسجيل الخروج">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>`;

    document.body.innerHTML = `
      <div class="shell">
        ${sidebarHTML}
        <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
        <div class="shell-main">
          ${headerHTML}
          <div class="page" id="pageRoot"></div>
        </div>
      </div>`;

    // ---- Mobile sidebar toggle ----
    const sidebarEl = document.querySelector('.shell-sidebar');
    const backdropEl = document.getElementById('sidebarBackdrop');
    function closeSidebar() {
      sidebarEl.classList.remove('open');
      backdropEl.classList.remove('open');
    }
    function openSidebar() {
      sidebarEl.classList.add('open');
      backdropEl.classList.add('open');
    }
    document.getElementById('menuToggle').addEventListener('click', () => {
      sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    backdropEl.addEventListener('click', closeSidebar);
    // Auto-close when a nav link is tapped (mobile)
    sidebarEl.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeSidebar();
    }));
    // Close with Esc
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

    // Calendar toggle
    document.getElementById('calToggle').addEventListener('click', () => {
      const next = getCalendar() === 'hijri' ? 'gregorian' : 'hijri';
      setCalendar(next);
      location.reload();
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try { await api('/auth/logout', { method: 'POST' }); } catch {}
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
    });

    // Global search (simple dropdown)
    wireGlobalSearch();

    // Let the page render itself
    if (typeof cfg.render === 'function') {
      Promise.resolve(cfg.render(document.getElementById('pageRoot'), { api, apiUpload, previewDocument, toast, openModal, confirmModal, esc, fmtDate, fmtDateTime, fmtMoney, fmtHijri, fmtDateSmart, getCalendar, setCalendar, user }))
        .catch((err) => {
          console.error(err);
          toast('فشل تحميل الصفحة: ' + (err.message || 'خطأ'), 'error', 5000);
        });
    }
  }

  function wireGlobalSearch() {
    const input = document.getElementById('globalSearch');
    const results = document.querySelector('.shell-header .search-results');
    if (!input || !results) return;

    Object.assign(results.style, {
      position: 'absolute', top: '40px', right: 0, width: '360px', maxHeight: '420px',
      overflowY: 'auto', background: '#fff', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', zIndex: 20
    });

    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { results.style.display = 'none'; return; }
      t = setTimeout(async () => {
        try {
          const { data } = await api('/search', { params: { q } });
          if (!data.length) { results.innerHTML = '<div style="padding:12px;color:var(--muted)">لا توجد نتائج</div>'; }
          else {
            const urls = { client: 'clients.html', case: 'cases.html', document: 'documents.html', note: 'notes.html' };
            results.innerHTML = data.map(r => `
              <a href="${urls[r.type] || '#'}?focus=${r.id}" style="display:block;padding:10px 12px;border-bottom:1px solid var(--border)">
                <strong>${escHtml(r.title || r.case_number || '')}</strong>
                <div style="font-size:.8rem;color:var(--muted)">${r.type} ${r.email ? '• ' + escHtml(r.email) : ''}</div>
              </a>`).join('');
          }
          results.style.display = 'block';
        } catch (err) { /* 401 handled */ }
      }, 250);
    });
    input.addEventListener('blur', () => setTimeout(() => results.style.display = 'none', 200));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); }
    });
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  window.AppShell = { mount, api, apiUpload, previewDocument, toast, openModal, confirmModal, NAV, esc, fmtDate, fmtDateTime, fmtMoney, fmtHijri, fmtDateSmart, getCalendar, setCalendar };
})();
