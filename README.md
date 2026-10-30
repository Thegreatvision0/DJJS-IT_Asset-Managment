# DJJS IT Asset Management — MERN Stack

IT asset, data-centre, network, CCTV and repair management for the DJJS IT Department.

- **M**ongoDB — database (MongoDB Atlas or a local MongoDB)
- **E**xpress + **N**ode.js — REST API with login, role permissions, validation and workflows
- **R**eact — web interface (built with Vite)

## Folder structure

```
djjs-itam/
├── shared/            Rules used by BOTH server and client
│   ├── core.js        Item categories, specification fields, statuses, relationship helpers
│   ├── modules.js     Every module's fields (assets, repairs, AMC visits, links…) and permissions list
│   ├── engine.js      Validation, business rules, workflow actions (return, handover, receive back…)
│   ├── insights.js    Alerts and the 22 reports
│   └── seed.js        Default roles, sample data, upgrade of old backups
├── server/            Express API
│   ├── src/index.js           Start-up (connects to MongoDB, creates the first admin)
│   ├── src/app.js             Express app, security headers, serves the built React app
│   ├── src/routes/auth.js     Login, logout, change password
│   ├── src/routes/data.js     All data endpoints (CRUD, actions, settings, roles, audit, backup)
│   ├── src/service.js         Runs every change through shared/engine.js and saves it
│   ├── src/security.js        Password hashing (scrypt), signed login tokens, login throttling
│   ├── src/store/mongoStore.js  MongoDB / Mongoose storage
│   ├── src/seed.js            Loads sample data
│   └── .env.example
├── client/            React frontend
│   ├── dist/                  ← READY-BUILT frontend (index.html + assets) served by the server
│   ├── src/App.jsx            Layout, menu, routing
│   ├── src/lib.jsx            API calls, app state, modal, toast
│   ├── src/components/        Form engine (Field, RecordForm), asset history, ports editor
│   └── src/pages/             List pages, Dashboard, Alerts, Reports, Rack Layout, Settings, Roles, Audit
├── Dockerfile, docker-compose.yml
└── package.json       Helper scripts
```

## Requirements

- Node.js 20.12 or newer
- MongoDB 6/7 — either [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier works) or MongoDB Community Server on Windows

## Quick start (uses the ready-built frontend in client/dist)

```bash
cd server
npm install
copy .env.example .env        # edit MONGODB_URI, JWT_SECRET, ADMIN_PASSWORD
npm run seed                  # optional sample data
npm start                     # open http://localhost:5000
```

## Development setup (edit the React code)

```bash
# 1. install packages
npm run install:all

# 2. configure the server
cd server
copy .env.example .env        # Linux/macOS: cp .env.example .env
#   edit .env → MONGODB_URI, JWT_SECRET (long random text), ADMIN_PASSWORD
cd ..

# 3. (optional) load the fictional sample data
npm run seed

# 4. run in development (two terminals)
npm run dev:server            # API on http://localhost:5000
npm run dev:client            # React on http://localhost:5173  ← open this
```

Sign in with **admin** and the `ADMIN_PASSWORD` from `.env` (created automatically on an empty database).
If you loaded the sample data, the logins are `admin / admin123`, `manager / manager123`, `support / support123`, `coordinator / coord123`, `auditor / audit123` — change them.

### Production (one server)

```bash
npm run build                 # rebuilds React into client/dist (replaces the ready-built copy)
set NODE_ENV=production       # Linux: export NODE_ENV=production
npm start                     # Express serves the API and the React app on PORT (default 5000)
```

Or with Docker (MongoDB included): create a `.env` next to `docker-compose.yml` with `JWT_SECRET=...` and run `docker compose up -d --build`.

Lost the admin password? `npm run create-admin -- admin NewPassword123`

## How it works

- Every save goes to the API. The server **re-validates everything** (required fields, formats, duplicate tag / serial / IP / MAC, rack U overlap, NVR channel use, fibre core use, status rules) and runs the workflow rules, then writes to MongoDB and the audit log. The React form uses the same `shared/` rules to show errors instantly.
- Writes are processed one at a time, so record numbers (RJ-0001, GP-0001…) and cross-record checks stay consistent. Run a **single** API instance.
- Permissions (View / Add / Edit / Delete / Approve per module) are checked by the server on every request; the menu and buttons follow them.
- Passwords are hashed with scrypt; login tokens are signed (HS256) and expire after `TOKEN_HOURS`. Changing a password signs out old sessions. Five wrong passwords lock that username for 15 minutes.
- Settings (categories, field rules, dropdown lists) are stored in MongoDB (`settings` collection) and apply to all users immediately.

## MongoDB collections

`assets, assignments, tempAssignments, repairJobs, repairDispatches, maintenance, amcVisits, installations, networkLinks, contracts, licences, certificates, vendors, purchases, employees, locations, users, roles, audits, settings`

Records use readable string ids. Indexes: unique `assets.assetTag`, unique `users.username`, plus lookups on status, serial, IP and references.

## API summary

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → `{token, user}` |
| POST | `/api/auth/change-password` | `{old, pw}` |
| GET | `/api/bootstrap` | Everything the signed-in user may see + settings |
| POST / PUT / DELETE | `/api/:module[/:id]` | Create / update / delete (`{data, confirmed}`) |
| POST | `/api/:module/:id/action/:action` | Workflow actions: `return`, `approve`, `issue`, `extend`, `ready`, `handover`, `ber`, `quote`, `followup`, `receive`, `savePorts`, `mount`, `unmount`, `addHistory`, `resetPassword` |
| PATCH | `/api/settings` | Masters, categories, category fields |
| POST | `/api/settings/combo` | Add a value to a growing dropdown (technicians, staff, brands…) |
| POST / PUT / DELETE | `/api/roles[/:id]` | Roles & permissions |
| GET | `/api/audit` | Audit log |
| GET / POST | `/api/backup`, `/api/restore` | JSON backup / restore (System Administrator) |

A save that needs confirmation (e.g. sending an item to a vendor without wiping data) returns **409** with `confirm`; the client asks and resends with `confirmed: true`.

## Trying it without MongoDB

Set `DATA_STORE=memory` and `DATA_FILE=./data/demo-data.json` in `.env` to keep data in a JSON file instead. This is only for a quick trial — use MongoDB for real data.
