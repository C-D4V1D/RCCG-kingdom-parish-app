# RCCG Kingdom Parish, Aguleri — Finance & Accounting App

A comprehensive church accounting and reporting system built for the RCCG Kingdom Parish Admin Team.

## Features

- **Income Recording** — Log all Sunday collections (Tithes, Thanksgiving, SLO, CRM, Workers' Offering, Sunday School, Children's Offering)
- **RCCG Remittance Calculator** — Auto-computes all HQ percentages and fixed quotas
- **Petty Cash / Imprest System** — Admin Officer requests, Accountant verifies, Signatories approve
- **Expense Tracking** — Categorised by Power, Facility, Repairs, Transport, Communication, etc.
- **Monthly Reports** — Auto-generated statements for the Pastor to submit to RCCG authorities
- **Role-Based Access** — Parish Pastor, Church Accountant, Admin Officer, Bank Signatories

## Roles

| Role | Access |
|------|--------|
| Parish Pastor | Full view, report sign-off, final approvals |
| Church Accountant | Record income, calculate remittances, manage ledger |
| Admin Officer | Submit petty cash requests, view operational budget |
| Bank Signatories | Approve and authorise transactions |

## Project Structure

```
rccg-kingdom-parish-app/
├── index.html          # App entry point
├── src/
│   ├── css/
│   │   └── styles.css  # Global styles
│   ├── js/
│   │   ├── app.js      # Main app logic
│   │   ├── remittance.js  # RCCG remittance calculations
│   │   └── reports.js  # Report generation
│   └── pages/
│       ├── dashboard.html
│       ├── income.html
│       ├── expenses.html
│       ├── remittances.html
│       └── reports.html
└── README.md
```

## RCCG Remittance Reference

### Tithes
- Members' Tithe → National: 58% | Local: 42%
- Ministers' Tithe → National: 62% | Local: 38%
- Province Rebate → 20% of total local retained share

### Thanksgiving
- National: 75% | Area: 5% | Pastor: 10% | Ministers: 9% | Pastors' Seed: 1%

### Offerings
- Sunday Love Offering (SLO) → National: 30% | Local: 70%
- CRM → National: 60% | Local: 40%
- Workers' Offering → National: 25% | Local: 75%
- Sunday School → National: 100%
- Children's Offering → National: 35% | Local Children's Dept: 65%

## Branch Strategy

- `main` — stable, production-ready code
- `dev` — active development branch
- Feature branches → PR → merge to `dev` → merge to `main`

## Built With

- HTML5 / CSS3 / Vanilla JavaScript
- Chart.js for data visualisation
- Google Gemini API (AI features via Google AI Studio)
