#!/usr/bin/env node
// Test fixture: the part of the Clerk box's /workspace/rccg-remit/api-fill.js that the month-end patch changes.
'use strict';
const r2 = x => Math.round(x * 100) / 100;
function weekEntries(map, c) {
  const entries = [];
  for (const [k, nm] of map.weekly) if (c[k]) entries.push([nm, c[k]]);
  return entries;
}
module.exports = { weekEntries, r2 };
