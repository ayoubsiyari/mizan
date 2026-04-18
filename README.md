# ميزان — Mizan Law Office Management

Full-stack Arabic/RTL law-office management system. Node.js + Express + SQLite backend, static HTML/CSS/JS frontend.

## Quick start

```bash
npm install
cp .env.example .env
# edit .env and set a strong JWT_SECRET
npm start
```

Then open: http://localhost:3000

The server serves both the API (under `/api`) and the static frontend from the same port. The SQLite database file is created automatically at `./database/mizan.db` on first run using `database/schema.sql`.

## First use

There are **no seed accounts**. Register the first firm admin via the UI (`/pages/register.html`) or via the API:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email":"admin@example.com",
    "password":"your-password",
    "firstName":"Admin",
    "lastName":"User",
    "firmName":"My Law Firm"
  }'
```

The first user of a firm is created with the `admin` role. Admins can invite other users (`lawyer`, `assistant`, `paralegal`) from `POST /api/settings/users`.

## Project layout

```
mizan-law/
├── backend/
│   ├── server.js            # Entry point: API + static frontend
│   ├── config.js            # Env-backed configuration
│   ├── db.js                # SQLite connection, promise helpers
│   ├── middleware/
│   │   ├── auth.js          # JWT auth + role guard
│   │   └── errorHandler.js  # asyncHandler, HttpError, notFound
│   ├── utils/
│   │   └── crud.js          # Generic firm-scoped CRUD router factory
│   └── routes/              # One file per resource (auth, clients, cases, ...)
├── database/
│   ├── schema.sql           # SQLite schema (applied on startup)
│   └── mizan.db             # Runtime database (gitignored)
├── assets/                  # Logos, images, uploads
├── css/                     # Stylesheets
├── js/                      # Frontend JS (api.js, auth.js, modules/…)
├── pages/                   # HTML pages (login, register, dashboard, ...)
├── index.html               # Landing page
├── .env.example
└── package.json
```

## API overview

All endpoints except the auth ones require `Authorization: Bearer <token>` and are firm-scoped.

| Resource        | Base path                  |
|-----------------|----------------------------|
| Auth            | `/api/auth`                |
| Clients         | `/api/clients`             |
| Cases           | `/api/cases`               |
| Documents       | `/api/documents`           |
| Hearings        | `/api/hearings`            |
| Calendar        | `/api/calendar`            |
| Tasks           | `/api/tasks`               |
| Notes           | `/api/notes`               |
| Contracts       | `/api/contracts`           |
| Billing         | `/api/billing/{invoices,payments,expenses,reports}` |
| Reports         | `/api/reports`             |
| Settings        | `/api/settings`            |
| Search          | `/api/search`              |
| Notifications   | `/api/notifications`       |

Each resource supports `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` (soft delete) with `?q=`, `?page=`, `?limit=`, and filterable query parameters where applicable.

## Tech stack

- Backend: Node.js (>=18), Express, SQLite (sqlite3), JWT, bcryptjs, Multer
- Frontend: Vanilla HTML/CSS/JS, Arabic RTL layout

## License

MIT
