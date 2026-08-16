# RCCG Kingdom Parish, Aguleri — Finance & Accounting App

A comprehensive church accounting and reporting system built for the RCCG Kingdom Parish Admin Team.

## Features

- **Authentication** — PIN-based login (4–6 digits, SHA-256 hashed) with role-based access control and in-app PIN change
- **Dashboard** — Monthly summary cards showing income, expenses, remittance status, and petty cash float
- **Transactions** — Unified ledger view of all income, expense, remittance, petty cash, and bank movements with filtering, sorting, and pagination
- **Income Recording** — Log Sunday collections (Tithes, Thanksgiving, SLO, CRM, Gospel Fund, Sunday School, First Fruit, Teen/Children's Offering, Weekend Offering, Holy Communion Offering) plus Other Income types (midweek offerings, donations, bank transfers, building fund, etc.)
- **RCCG Remittance Calculator** — Auto-computes all HQ percentages, fixed quotas (RMF, CSR, Education, Camp, Mummy Stipend, Volunteer, Regional), province rebate, and payment tracking with cut-off date management
- **Expense Tracking** — Categorised by Power & Energy, Facility & Cleaning, Repairs & Maintenance, Sound & Media, Communication, Office & Stationery, Bank Charges, Transportation, RCCG Special Projects, Hospitality, Security, Church Welfare, Property & Projects, Events & Departments; with subcategory suggestions and approval workflow
- **Bank Module** — Bank account balance tracking, deposits, withdrawals, bank charges, and monthly reconciliation
- **Petty Cash / Imprest System** — Float management with Admin Officer requests, Accountant verification, Signatory approval, and bank top-up tracking
- **Monthly Reports** — Auto-generated financial statements with Pastor sign-off workflow
- **Audit Log** — Timestamped activity log of the last 100 system actions
- **Notifications** — In-app notification centre with unread badge
- **Committee SMS (KPSC portal)** — One-screen composer for messaging the KPSC committee roster: ready-made meeting-reminder templates that fit two GSM-7 pages, per-group recipient picker, live page/cost estimate, one-click emoji→GSM-7 conversion, and optional scheduling. Numbers come from the roster, falling back to the phone already registered against the same person as a partner; messages go out under the Members & Staff Termii sender ID and land in the SMS Logs with delivery status
- **IT Admin Panel** — User management, church settings, monthly quota configuration, remittance rate overrides, role permission editor, and backup & restore

## Roles

| Role | Access |
|------|--------|
| IT Administrator | Full system access including admin panel, user management, and all financial modules |
| Parish Pastor | Full view, report sign-off, remittance cut-off editing, final approvals |
| Church Accountant | Record income, calculate remittances, manage ledger, approve petty cash, generate reports |
| Admin Officer | Log expenses, submit petty cash requests, view income and petty cash |
| Bank Signatory | View income and remittances, approve petty cash, authorise bank transactions |
| Read-Only Viewer | View-only access to dashboard, transactions, income, remittances, expenses, and petty cash |

## Project Structure

```
rccg-kingdom-parish-app/
├── index.html                    # SPA shell: login screen + app chrome
├── _redirects                    # Cloudflare Pages routing (SPA fallback)
├── wrangler.toml                 # Cloudflare Pages / D1 configuration
├── package.json
├── src/
│   ├── css/
│   │   └── styles.css            # Global styles
│   └── js/
│       ├── app.js                # Main SPA logic (all pages & UI)
│       └── remittance.js         # RCCG remittance calculation module
├── functions/
│   └── api/
│       └── [[route]].js          # Cloudflare Pages Function (REST API)
└── tests/
    ├── api-route.test.js         # API endpoint unit tests
    └── remittance.test.js        # Remittance calculation unit tests
```

## RCCG Remittance Reference

### Tithes
- Members' Tithe → National: 58% | Local: 42%
- Ministers' Tithe → National: 62% | Local: 38%
- Province Rebate → 20% of the combined local retained tithes (42% of Members' Tithe + 38% of Ministers' Tithe)

### Thanksgiving
- National: 75% | Area: 5% | Pastor: 10% | Ministers: 9% | Pastors' Seed: 1%

### Offerings
- Sunday Love Offering (SLO) → National: 30% | Local: 70%
- CRM (Weekly Activities) → National: 60% | Local: 40%
- Gospel Fund (Workers' Offering) → National: 25% | Local: 75%
- Sunday School → National: 100%
- First Fruit → National: 100%
- Teen/Children's Offering → National: 35% | Local Children's Dept: 65%
- Weekend Offering → National: 100%
- Holy Communion Offering → National: 100%

## Branch Strategy

- `main` — stable, production-ready code
- `dev` — active development branch
- Feature branches → PR → merge to `dev` → merge to `main`

## Built With

- HTML5 / CSS3 / Vanilla JavaScript (no framework)
- Cloudflare Pages — hosting and routing
- Cloudflare Pages Functions — serverless REST API
- Cloudflare D1 — SQLite database (production + preview environments)
- Node.js built-in test runner (`node:test`) for unit tests
