# RCCG Kingdom Parish, Aguleri — Finance & Accounting App

A comprehensive church accounting and reporting system for the RCCG Kingdom Parish Admin Team.

## Tech Stack

- **Frontend:** Vanilla HTML / CSS / JavaScript (single-page app)
- **Backend:** Cloudflare Pages Functions
- **Database:** Cloudflare D1 (SQLite)
- **Hosting:** Cloudflare Pages

---

## One-Time Setup After Deployment

After deploying to Cloudflare Pages, visit this URL once in your browser to create all database tables:

```
https://your-app.pages.dev/api/init
```

You should see: `{"success":true,"message":"Database initialised successfully."}`

That's it — the app is live and ready.

---

## Default Login PINs

| Role | PIN |
|---|---|
| IT Administrator | 0000 |
| Parish Pastor | 1111 |
| Church Accountant | 2222 |
| Admin Officer | 3333 |
| Bank Signatory (Elder) | 4444 |
| Read-Only Viewer | 9999 |

**Change all PINs after first login** via IT Admin → Users & Roles.

---

## App Modules

| Module | Who Can Access |
|---|---|
| Dashboard | All roles |
| Record Income | IT Admin, Accountant |
| Remittances | IT Admin, Pastor, Accountant, Signatory |
| Expenses | IT Admin, Accountant, Admin Officer |
| Petty Cash | IT Admin, Accountant, Admin Officer, Signatory |
| Reports | IT Admin, Pastor, Accountant |
| Audit Log | IT Admin, Pastor, Accountant |
| IT Admin Panel | IT Admin only |

---

## RCCG Remittance Rates

### Tithes
| Type | National HQ | Local |
|---|---|---|
| Members' Tithe | 58% | 42% |
| Ministers' Tithe | 62% | 38% |
| Province Rebate | 20% of local retained | — |

### Thanksgiving (TG) Split
| Recipient | % |
|---|---|
| National | 75% |
| Area | 5% |
| Pastor | 10% |
| Ministers | 9% |
| Pastors' Seed | 1% |

### Offerings
| Type | National | Local |
|---|---|---|
| Sunday Love Offering (SLO) | 30% | 70% |
| CRM (Weekly Activities) | 60% | 40% |
| Workers' Offering | 25% | 75% |
| Sunday School | 100% | 0% |
| Children's Offering | 35% | 65% (Children's Dept) |

---

## Petty Cash (Imprest) Workflow

1. **Admin Officer** submits a request (purpose, amount, category)
2. **Accountant** verifies float is sufficient
3. **Signatory (Elder)** approves → float is deducted automatically
4. **Admin Officer** makes the purchase
5. **Admin Officer** submits receipt within **48 hours**
6. **System** automatically creates a matching Expense record
7. **Accountant** refills float (bank transfer, authorized by Signatories)

---

## Database Tables

- `users` — roles, PINs, emails
- `income` — Sunday collections by type
- `expenses` — all spending by category
- `petty_cash` — full imprest cycle
- `petty_config` — float balance and max
- `remittances` — HQ payments recorded
- `audit_log` — every action timestamped
- `settings` — church name, bank details, monthly quotas
- `notifications` — in-app alerts

---

## Branch Strategy

- `main` — production (auto-deploys to Cloudflare Pages)
- `dev` — active development
