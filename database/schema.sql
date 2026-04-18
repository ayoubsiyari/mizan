-- Mizan Law - SQLite schema
-- Keep everything SQLite-compatible: TEXT ids (uuid v4), ISO datetime strings,
-- JSON stored as TEXT, booleans as INTEGER (0/1).

PRAGMA foreign_keys = ON;

-- Firms (multi-tenant container)
CREATE TABLE IF NOT EXISTS firms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT,
    license_number TEXT UNIQUE,
    cr_number TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    logo_url TEXT,
    is_active INTEGER DEFAULT 1,
    subscription_plan TEXT DEFAULT 'basic',
    subscription_expires_at TEXT,
    settings TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    firm_id TEXT REFERENCES firms(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    national_id TEXT,
    role TEXT NOT NULL DEFAULT 'lawyer'
        CHECK (role IN ('admin','lawyer','assistant','paralegal')),
    avatar_url TEXT,
    is_active INTEGER DEFAULT 1,
    is_verified INTEGER DEFAULT 0,
    last_login_at TEXT,
    nav_permissions TEXT,        -- JSON array of allowed sidebar keys (NULL = all)
    job_title TEXT,              -- free-form display label (e.g. 'سكرتير', 'مستقبل')
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Reception / visitor log (walk-ins, inquiries)
CREATE TABLE IF NOT EXISTS visitors (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    national_id TEXT,
    reason TEXT,
    assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting','in_meeting','done','cancelled','no_show')),
    checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
    checked_out_at TEXT,
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_visitors_firm ON visitors(firm_id);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(status);
CREATE INDEX IF NOT EXISTS idx_visitors_checked_in ON visitors(checked_in_at);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    national_id TEXT,
    passport_number TEXT,
    date_of_birth TEXT,
    gender TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    country TEXT,
    company_name TEXT,
    company_cr TEXT,
    client_type TEXT DEFAULT 'individual' CHECK (client_type IN ('individual','company')),
    notes TEXT,
    tags TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Cases
CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    case_number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    case_type TEXT NOT NULL
        CHECK (case_type IN ('civil','criminal','commercial','family','labor','real_estate','other')),
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active','pending','closed','archived','suspended')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
    assigned_lawyer_id TEXT REFERENCES users(id),
    court_name TEXT,
    judge_name TEXT,
    opponent_name TEXT,
    opponent_lawyer TEXT,
    case_value REAL,
    currency TEXT DEFAULT 'SAR',
    filing_date TEXT,
    expected_resolution_date TEXT,
    actual_resolution_date TEXT,
    outcome TEXT,
    tags TEXT DEFAULT '[]',
    is_confidential INTEGER DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    UNIQUE(firm_id, case_number)
);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    document_type TEXT NOT NULL
        CHECK (document_type IN ('contract','evidence','court_filing','correspondence','research','other')),
    category TEXT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_mime_type TEXT NOT NULL,
    file_hash TEXT,
    is_public INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    parent_document_id TEXT REFERENCES documents(id),
    tags TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    uploaded_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Hearings
CREATE TABLE IF NOT EXISTS hearings (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    hearing_type TEXT NOT NULL
        CHECK (hearing_type IN ('initial','follow_up','evidence','judgment','other')),
    title TEXT,
    description TEXT,
    scheduled_at TEXT NOT NULL,
    duration INTEGER DEFAULT 60,
    court_name TEXT,
    court_room TEXT,
    judge_name TEXT,
    status TEXT DEFAULT 'scheduled'
        CHECK (status IN ('scheduled','completed','cancelled','postponed')),
    outcome TEXT,
    next_hearing_id TEXT REFERENCES hearings(id),
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Calendar events
CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_all_day INTEGER DEFAULT 0,
    location TEXT,
    attendees TEXT DEFAULT '[]',
    status TEXT DEFAULT 'scheduled',
    priority TEXT DEFAULT 'medium',
    reminder_minutes INTEGER DEFAULT 60,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    invoice_date TEXT NOT NULL DEFAULT (date('now')),
    due_date TEXT NOT NULL,
    status TEXT DEFAULT 'draft'
        CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
    subtotal REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'SAR',
    tax_rate REAL DEFAULT 15.00,
    discount_rate REAL DEFAULT 0,
    payment_terms TEXT,
    notes TEXT,
    sent_at TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT,
    UNIQUE(firm_id, invoice_number)
);

-- Invoice items
CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    discount_rate REAL DEFAULT 0,
    tax_rate REAL DEFAULT 15.00,
    total_amount REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL
        CHECK (payment_method IN ('cash','bank_transfer','credit_card','check','other')),
    payment_date TEXT NOT NULL DEFAULT (date('now')),
    reference_number TEXT,
    notes TEXT,
    status TEXT DEFAULT 'completed',
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'SAR',
    expense_date TEXT NOT NULL DEFAULT (date('now')),
    payment_method TEXT,
    receipt_number TEXT,
    vendor TEXT,
    notes TEXT,
    is_billable INTEGER DEFAULT 0,
    billed_to_client_id TEXT REFERENCES clients(id),
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
    assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending','in_progress','completed','cancelled')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
    due_date TEXT,
    completed_at TEXT,
    estimated_hours INTEGER,
    actual_hours INTEGER,
    tags TEXT DEFAULT '[]',
    completion_percentage INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Task comments
CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT DEFAULT '[]',
    is_private INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Contracts
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    contract_type TEXT NOT NULL,
    template_id TEXT REFERENCES contracts(id),
    content TEXT NOT NULL,
    status TEXT DEFAULT 'draft'
        CHECK (status IN ('draft','pending_signature','signed','expired','terminated','template')),
    start_date TEXT,
    end_date TEXT,
    value REAL,
    currency TEXT DEFAULT 'SAR',
    signed_by_client INTEGER DEFAULT 0,
    signed_by_firm INTEGER DEFAULT 0,
    client_signature_url TEXT,
    firm_signature_url TEXT,
    signed_at TEXT,
    expires_at TEXT,
    tags TEXT DEFAULT '[]',
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('info','warning','error','success')),
    channel TEXT NOT NULL DEFAULT 'in_app',
    priority TEXT DEFAULT 'medium',
    is_read INTEGER DEFAULT 0,
    read_at TEXT,
    data TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Settings (firm/user key-value store)
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    firm_id TEXT REFERENCES firms(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('firm','user')),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(firm_id, user_id, scope, key)
);

-- Courts registry
CREATE TABLE IF NOT EXISTS courts (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    court_type TEXT,         -- ابتدائية / استئناف / عليا / تجارية / عمالية ...
    city TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Judges registry
CREATE TABLE IF NOT EXISTS judges (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    court_id TEXT REFERENCES courts(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    title TEXT,               -- قاضي / رئيس دائرة / مستشار ...
    specialization TEXT,
    phone TEXT,
    email TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Time entries (billable hours)
CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
    client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    hourly_rate REAL,
    amount REAL,               -- duration_minutes/60 * hourly_rate (computed client-side / server-side)
    currency TEXT DEFAULT 'SAR',
    is_billable INTEGER DEFAULT 1,
    is_billed INTEGER DEFAULT 0,
    invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
    entry_date TEXT NOT NULL DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Deadlines (statute of limitations / court deadlines)
CREATE TABLE IF NOT EXISTS deadlines (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
    assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_at TEXT NOT NULL,
    reminder_days TEXT DEFAULT '[7,3,1]',   -- JSON array of days-before
    priority TEXT DEFAULT 'high' CHECK (priority IN ('low','medium','high','urgent')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open','completed','missed','cancelled')),
    completed_at TEXT,
    last_reminder_at TEXT,                  -- ISO; bumps as reminders fire
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Trust / client-funds transactions (escrow ledger)
CREATE TABLE IF NOT EXISTS trust_transactions (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal','fee','refund','adjustment')),
    amount REAL NOT NULL,                   -- always positive; kind determines sign
    currency TEXT DEFAULT 'SAR',
    description TEXT,
    reference_number TEXT,
    bank_name TEXT,
    invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
    transaction_date TEXT NOT NULL DEFAULT (date('now')),
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_courts_firm ON courts(firm_id);
CREATE INDEX IF NOT EXISTS idx_judges_firm ON judges(firm_id);
CREATE INDEX IF NOT EXISTS idx_judges_court ON judges(court_id);
CREATE INDEX IF NOT EXISTS idx_time_firm ON time_entries(firm_id);
CREATE INDEX IF NOT EXISTS idx_time_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_case ON time_entries(case_id);
CREATE INDEX IF NOT EXISTS idx_time_date ON time_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_time_invoice ON time_entries(invoice_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_firm ON deadlines(firm_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_case ON deadlines(case_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines(due_at);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status);
CREATE INDEX IF NOT EXISTS idx_trust_firm ON trust_transactions(firm_id);
CREATE INDEX IF NOT EXISTS idx_trust_client ON trust_transactions(client_id);

-- Public signing links for e-signature
CREATE TABLE IF NOT EXISTS signing_links (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    party TEXT NOT NULL CHECK (party IN ('client','firm')),
    signer_name TEXT,
    signer_email TEXT,
    signature_data_url TEXT,      -- base64 PNG of signature
    signer_ip TEXT,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_signing_contract ON signing_links(contract_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_firm ON users(firm_id);
CREATE INDEX IF NOT EXISTS idx_clients_firm ON clients(firm_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_cases_firm ON cases(firm_id);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_documents_firm ON documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_hearings_firm ON hearings(firm_id);
CREATE INDEX IF NOT EXISTS idx_hearings_case ON hearings(case_id);
CREATE INDEX IF NOT EXISTS idx_hearings_scheduled ON hearings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_events_firm ON calendar_events(firm_id);
CREATE INDEX IF NOT EXISTS idx_events_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_invoices_firm ON invoices(firm_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_payments_firm ON payments(firm_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tasks_firm ON tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_notes_firm ON notes(firm_id);
CREATE INDEX IF NOT EXISTS idx_notes_case ON notes(case_id);
CREATE INDEX IF NOT EXISTS idx_contracts_firm ON contracts(firm_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_firm ON notifications(firm_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_settings_firm ON settings(firm_id);
CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id);
