# Local demo harness

Runs the whole platform on your machine, against a throwaway SQLite database filled
with **synthetic data**, and regenerates the screenshots in `docs/screenshots/`.

It runs the *real* edge worker (`functions/api/[[route]].js`) unmodified — a small
D1-compatible adapter over Node's built-in SQLite stands in for the Cloudflare binding —
so what you see locally is what the parish sees in production.

## Usage

```bash
node scripts/demo/seed.mjs        # creates scripts/demo/demo.sqlite (deletes any existing one)
node scripts/demo/serve.mjs       # http://localhost:8788
```

Sign in with:

| Portal | URL | Who | PIN |
|---|---|---|---|
| Finance | `/` | IT Administrator | `0000` |
| Committee | `/kpsc/` | Elder Paul Okafor | `1234` |

Other seeded finance PINs: Pastor `1111`, Accountant `2222`, Admin Officer `3333`,
Signatory `4444`, Viewer `9999`. All KPSC accounts use `1234`.

## Regenerating the screenshots

```bash
npx playwright install chromium     # once
node scripts/demo/seed.mjs
node scripts/demo/serve.mjs &
node scripts/demo/capture-screenshots.mjs
```

Raw captures land in `scripts/demo/.shots/` (git-ignored); optimised versions are written
to `docs/screenshots/`.

## Requirements

Node 22+ (for `node:sqlite`). `sharp` comes from the existing devDependencies;
Playwright is resolved at run time and is not a dependency of the app.

## A note on the data

Every name, phone number, amount, reference and meeting in `seed.mjs` is invented for
documentation. No real member, partner, financial or bank data is committed to this
repository.
