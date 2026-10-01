#!/usr/bin/env node
// bankbalance.cjs — checks the real RCCG portal bank balance and reports it to the clerk-watchdog
// Worker, so the app's Dashboard/Bank pages and the /balance bot command show the real figure.
// Reuses rccg-portal/portal-api.js's login(): no "switch active role" step is needed — the FIN v3
// getAccountBalance call works directly off the login token, the same as the box's other FIN calls.
//
//   node bankbalance.cjs check   fetch the real balance and report it to the Worker; prints one JSON line
"use strict";
const fs = require("fs");
const path = require("path");

const PORTAL_API = process.env.CLERK_PORTAL_API || path.join(__dirname, "..", "rccg-portal", "portal-api.js");
const WORKER = process.env.CLERK_WORKER || "https://clerk-watchdog.decan-inv.workers.dev";
const TOKEN_FILE = process.env.CLERK_TOKEN_FILE || "/workspace/.secrets/watchdog-token";
const ACCOUNT_NUMBER = process.env.CLERK_BANK_ACCOUNT || "1473624487"; // RCCG Kingdom Parish, Access Bank PLC

async function reportBalance(balance) {
  const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  if (!token) throw new Error("no watchdog token");
  const res = await fetch(WORKER + "/bank-balance", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-watchdog-token": token },
    body: JSON.stringify({ balance }),
  });
  if (!res.ok) throw new Error(`watchdog POST /bank-balance failed: HTTP ${res.status}`);
}

async function checkBalance() {
  const portal = require(PORTAL_API);
  await portal.login();
  const { status, body } = await portal.get("/transaction/getAccountBalance", { accountNumber: ACCOUNT_NUMBER });
  const raw = body && body.response && body.response.availableBalance;
  const balance = raw === undefined ? NaN : Number(raw);
  if (status !== 200 || !Number.isFinite(balance)) {
    throw new Error(`balance check failed: HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return balance;
}

async function main() {
  if (process.argv[2] !== "check") {
    console.error("usage: bankbalance.cjs check");
    process.exit(2);
  }
  const balance = await checkBalance();
  await reportBalance(balance);
  console.log(JSON.stringify({ ok: true, balance, checked_at: new Date().toISOString() }));
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
  process.exit(1);
});
