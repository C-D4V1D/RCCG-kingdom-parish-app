// clerk-watchdog config: schema, defaults (from the Clerk Box Configuration Inventory,
// 27 Sep 2026) and PUT /config validation. See SPEC.md for the full schema description.

export const MESSAGE_TYPES = [
  "memo_forwarded", "memo_error", "remittance_check", "rrr_generated", "parish_remittance_check",
  "monthly_statement", "statement_error", "attendance_filed", "attendance_nudge",
  "attendance_nudge_fallback", "attendance_error", "source_doc_reminder", "weekly_attendance_reminder",
  "weekly_health", "upload_confirmation", "upload_fyi", "sunday_note", "watchdog_down", "scheduler_fallback",
];

const PEOPLE_KEYS = ["david", "divine", "fabian", "pastor"];

// { telegram, email } per person for a message type. Unlisted keys default to { false, false }.
function route(overrides) {
  const r = {};
  for (const k of PEOPLE_KEYS) r[k] = { telegram: false, email: false };
  for (const k in overrides) r[k] = overrides[k];
  return r;
}

// Used only when the KV "config" key is missing (GET /config then says is_default: true and the box ignores it).
// The real people, chat IDs and emails live in KV, saved from the app; these are placeholders, never real data.
export const DEFAULT_CONFIG = {
  people: [
    { key: "david", name: "Finance Officer", app_role: "it_admin", telegram_chat_id: null,
      email: null, can_upload: true, full_status: true, buttons: true },
    { key: "divine", name: "Accountant", app_role: "accountant", telegram_chat_id: null,
      email: null, can_upload: true, full_status: false, buttons: true },
    { key: "fabian", name: "Admin Officer", app_role: null, telegram_chat_id: null,
      email: null, can_upload: false, full_status: false, buttons: false },
    { key: "pastor", name: "Pastor", app_role: "pastor", telegram_chat_id: null,
      email: null, can_upload: false, full_status: false, buttons: false },
  ],
  parishes: [
    { code: "602757", name: "Kingdom Parish", source_docs: true, attendance: true, remittance: true, statement: true },
    { code: "659840", name: "Sanctuary of Favour Parish", source_docs: true, attendance: false, remittance: false, statement: false },
    { code: "597445", name: "Good Shepherd Parish", source_docs: true, attendance: false, remittance: false, statement: false },
    { code: "761516", name: "God Is Able", source_docs: true, attendance: false, remittance: false, statement: false },
  ],
  routing: {
    // "Telegram + Email" rows: both true for each "Yes". Telegram-only / Email-only rows: the other channel false.
    // Pastor "Skipped (not in contacts)" on memo_forwarded/Telegram => telegram true (intent; box has no chat id for him).
    // Defaults mirror what the box does today (memo-runner.sh, stmt-runner.py, make-att-*.py, tg_msgs.py),
    // so the first save from the app changes nothing unless a switch is changed.
    memo_forwarded: route({
      david: { telegram: true, email: false },
      divine: { telegram: true, email: true },
      fabian: { telegram: true, email: true },
      pastor: { telegram: true, email: true },
    }),
    memo_error: route({ david: { telegram: true, email: false } }),
    remittance_check: route({
      david: { telegram: true, email: true },
      divine: { telegram: true, email: true },
      pastor: { telegram: true, email: true },
    }),
    rrr_generated: route({
      david: { telegram: true, email: true },
      divine: { telegram: true, email: true },
      fabian: { telegram: true, email: true },
    }),
    parish_remittance_check: route({ david: { telegram: true, email: true } }),
    monthly_statement: route({
      david: { telegram: true, email: true },
      divine: { telegram: true, email: true },
      fabian: { telegram: true, email: true },
      pastor: { telegram: true, email: true },
    }),
    statement_error: route({ david: { telegram: true, email: false } }),
    attendance_filed: route({
      david: { telegram: true, email: true },
      divine: { telegram: true, email: true },
      pastor: { telegram: true, email: true },
    }),
    attendance_nudge: route({ david: { telegram: true, email: true } }),
    attendance_nudge_fallback: route({ david: { telegram: true, email: false } }),
    attendance_error: route({ david: { telegram: true, email: false } }),
    // David: all parishes. Divine: Kingdom Parish only (scope tracked outside this schema).
    source_doc_reminder: route({
      david: { telegram: true, email: false },
      divine: { telegram: true, email: false },
    }),
    weekly_attendance_reminder: route({ divine: { telegram: true, email: false } }),
    weekly_health: route({ david: { telegram: true, email: false } }),
    // "Uploader"/"If not uploader" rows: telegram true for david and divine (the only two upload-bot users).
    upload_confirmation: route({
      david: { telegram: true, email: false },
      divine: { telegram: true, email: false },
    }),
    upload_fyi: route({
      david: { telegram: true, email: false },
      divine: { telegram: true, email: false },
    }),
    sunday_note: route({ david: { telegram: true, email: false } }),
    watchdog_down: route({ david: { telegram: true, email: false } }),
    scheduler_fallback: route({ david: { telegram: true, email: false } }),
  },
  automations: {
    memo: { enabled: true, auto_forward: true, check_time: "08:45",
      days: ["mon", "tue", "wed", "thu", "fri", "sat"], stop_after: "2099-12-31" },
    statement: { enabled: true, auto_send: true, check_time: "07:30",
      signature: "God bless." },
    attendance: { enabled: true, auto_file: true, active_from: "08:00", active_until: "22:00",
      check_interval_minutes: 60, first_month: "2026-10",
      reminder1: { days_before_close: 1, time: "18:00" },
      reminder2: { days_before_close: 0, time: "12:00" } },
    source_doc_reminders: { enabled: true, days_before_close: [3, 1], after_time: "10:00" },
    weekly_attendance_reminder: { enabled: true, day: "mon", after_time: "09:00" },
    sunday_note: { enabled: true, after_time: "09:00" },
    health_note: { enabled: true, day: "sat", after_time: "18:00", log_trim_mb: 1, log_trim_lines: 2000 },
    upload_bot: { admin_max_kb: 500, finance_max_kb: 1000, jpeg_quality: 85, max_width_px: 1800 },
    drive_sync: { interval_minutes: 10 },
    supervisor: { interval_seconds: 300, ping_every_cycles: 2, // ping every 10 min so the dashboard stays green
      balance_check_interval_minutes: 15, balance_check_active_from: "06:00", balance_check_active_until: "22:00",
      balance_match_window_days: 7 },
    // WhatsApp posts: the Clerk's short updates to the parish WhatsApp group. Times are the box's own clock.
    whatsapp: {
      enabled: true, to: "+4740944059",
      cutoff_checklist: { enabled: true, time: "06:00" },
      morning_reminders: { enabled: true, time: "09:00" },
      saturday_note: { enabled: true, time: "18:00" },
      sunday_records: { enabled: true, every_minutes: 10 },
      bank_movements: { enabled: true },
      deposit_bank_confirmed: { enabled: true },
      deposit_bank_missing: { enabled: true, days: 3 },
      memo: { enabled: true },
      statement: { enabled: true },
      rrr_reminders: { enabled: true },
    },
    // Telegram bot menu: who sees each command (everyone | kingdom | payers | admin | off). Help is always on.
    telegram_bot: {
      menu: { month: "everyone", upload: "everyone", paid: "payers", statement: "kingdom", balance: "kingdom",
        refresh: "admin", system: "admin", help: "everyone" },
      previous_months: 6, month_portal_check: "button", reply_unknown: true,
      unknown_contact: "the parish IT administrator" },
  },
  // Month-end filing (remittance + attendance on the RCCG portal, check email, Generate RRR).
  // handler: who runs it — "clerk_ai" (the Clerk AI routine, as before) or "box" (the Clerk box scripts).
  // lines: app income category -> RCCG portal weekly line (names exactly as the box's remit_match.py), or NOT_REMITTED for money that stays in the parish.
  // A category with money in it but no line here makes the box hold the filing and ask for one.
  remittance: {
    handler: "clerk_ai",
    lines: {
      membersTithe: "General Tithe",
      ministersTithe: "Ministers Tithe",
      thanksgiving: "Thanksgiving",
      slo: "Sunday Love Offering",
      crm: "CRM",
      workersOffering: "Gospel Fund",
      sundaySchool: "Sunday School",
      childrenOffering: "Children Offering",
      holyCommunionOffering: "Holy Communion Offering",
      firstFruit: "First Fruit",
    },
  },
};

export const NOT_REMITTED = "__not_remitted__";
const LINE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const CODE_RE = /^\d+$/;
const CHAT_ID_RE = /^-?\d+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const isBool = (v) => typeof v === "boolean";
// Telegram bot menu: allowed values per command (help can never be off).
const TG_MENU_ALLOWED = {
  month: ["everyone", "kingdom", "payers", "admin", "off"],
  upload: ["everyone", "kingdom", "payers", "admin", "off"],
  paid: ["everyone", "kingdom", "payers", "admin", "off"],
  statement: ["kingdom", "payers", "admin", "off"],
  balance: ["kingdom", "payers", "admin", "off"],
  refresh: ["kingdom", "payers", "admin", "off"],
  system: ["kingdom", "payers", "admin", "off"],
  help: ["everyone", "kingdom", "payers", "admin"],
};
const TG_MENU_RESTRICTED = new Set(["statement", "balance", "refresh", "system"]);
const isNonNegFinite = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isTime = (v) => typeof v === "string" && TIME_RE.test(v);
const isWeekday = (v) => typeof v === "string" && WEEKDAYS.includes(v);

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return ["config must be an object"];
  }

  // people
  if (!Array.isArray(cfg.people) || cfg.people.length === 0) {
    errors.push("people must be a non-empty array");
  } else {
    const seen = new Set();
    cfg.people.forEach((p, i) => {
      if (!p || typeof p !== "object") { errors.push(`people[${i}] must be an object`); return; }
      if (typeof p.name !== "string" || !p.name.trim()) errors.push(`people[${i}].name must be a non-empty string`);
      if (typeof p.key !== "string" || !KEY_RE.test(p.key)) {
        errors.push(`people[${i}].key must match ^[a-z][a-z0-9_]{0,31}$`);
      } else if (seen.has(p.key)) {
        errors.push(`people[${i}].key "${p.key}" is not unique`);
      } else {
        seen.add(p.key);
      }
      if (!(p.telegram_chat_id === null || (typeof p.telegram_chat_id === "string" && CHAT_ID_RE.test(p.telegram_chat_id)))) {
        errors.push(`people[${i}].telegram_chat_id must be null or a string of digits`);
      }
      if (!(p.email === null || (typeof p.email === "string" && p.email.includes("@")))) {
        errors.push(`people[${i}].email must be null or contain "@"`);
      }
      for (const f of ["can_upload", "full_status", "buttons"]) {
        if (!isBool(p[f])) errors.push(`people[${i}].${f} must be true or false`);
      }
    });
  }
  const peopleKeys = Array.isArray(cfg.people) ? cfg.people.map((p) => p && p.key).filter(Boolean) : [];

  // parishes
  if (!Array.isArray(cfg.parishes) || cfg.parishes.length === 0) {
    errors.push("parishes must be a non-empty array");
  } else {
    const seen = new Set();
    cfg.parishes.forEach((p, i) => {
      if (!p || typeof p !== "object") { errors.push(`parishes[${i}] must be an object`); return; }
      if (typeof p.code !== "string" || !CODE_RE.test(p.code)) {
        errors.push(`parishes[${i}].code must be a string of digits`);
      } else if (seen.has(p.code)) {
        errors.push(`parishes[${i}].code "${p.code}" is not unique`);
      } else {
        seen.add(p.code);
      }
      if (typeof p.name !== "string" || !p.name.trim()) errors.push(`parishes[${i}].name must be a non-empty string`);
      for (const f of ["source_docs", "attendance", "remittance", "statement"]) {
        if (!isBool(p[f])) errors.push(`parishes[${i}].${f} must be true or false`);
      }
    });
  }

  // routing
  if (!cfg.routing || typeof cfg.routing !== "object" || Array.isArray(cfg.routing)) {
    errors.push("routing must be an object");
  } else {
    for (const [type, people] of Object.entries(cfg.routing)) {
      if (!people || typeof people !== "object" || Array.isArray(people)) {
        errors.push(`routing.${type} must be an object`);
        continue;
      }
      for (const [key, channels] of Object.entries(people)) {
        if (!peopleKeys.includes(key)) {
          errors.push(`routing.${type}.${key} references a person key not in people`);
          continue;
        }
        if (!channels || typeof channels !== "object") {
          errors.push(`routing.${type}.${key} must be an object`);
          continue;
        }
        if (!isBool(channels.telegram)) errors.push(`routing.${type}.${key}.telegram must be true or false`);
        if (!isBool(channels.email)) errors.push(`routing.${type}.${key}.email must be true or false`);
      }
    }
  }

  // automations
  const a = cfg.automations;
  if (!a || typeof a !== "object" || Array.isArray(a)) {
    errors.push("automations must be an object");
  } else {
    const memo = a.memo;
    if (!memo || typeof memo !== "object") errors.push("automations.memo must be an object");
    else {
      if (!isBool(memo.enabled)) errors.push("automations.memo.enabled must be true or false");
      if (!isBool(memo.auto_forward)) errors.push("automations.memo.auto_forward must be true or false");
      if (!isTime(memo.check_time)) errors.push("automations.memo.check_time must be HH:MM 24h");
      if (!Array.isArray(memo.days) || memo.days.length === 0 || !memo.days.every(isWeekday)) {
        errors.push("automations.memo.days must be a non-empty array of mon..sun");
      }
      if (typeof memo.stop_after !== "string" || !memo.stop_after.trim()) {
        errors.push("automations.memo.stop_after must be a non-empty string");
      }
    }

    const st = a.statement;
    if (!st || typeof st !== "object") errors.push("automations.statement must be an object");
    else {
      if (!isBool(st.enabled)) errors.push("automations.statement.enabled must be true or false");
      if (!isBool(st.auto_send)) errors.push("automations.statement.auto_send must be true or false");
      if (!isTime(st.check_time)) errors.push("automations.statement.check_time must be HH:MM 24h");
      if (typeof st.signature !== "string") errors.push("automations.statement.signature must be a string");
    }

    const att = a.attendance;
    if (!att || typeof att !== "object") errors.push("automations.attendance must be an object");
    else {
      if (!isBool(att.enabled)) errors.push("automations.attendance.enabled must be true or false");
      if (!isBool(att.auto_file)) errors.push("automations.attendance.auto_file must be true or false");
      if (!isTime(att.active_from)) errors.push("automations.attendance.active_from must be HH:MM 24h");
      if (!isTime(att.active_until)) errors.push("automations.attendance.active_until must be HH:MM 24h");
      if (!isNonNegFinite(att.check_interval_minutes)) errors.push("automations.attendance.check_interval_minutes must be a number >= 0");
      if (typeof att.first_month !== "string" || !att.first_month.trim()) errors.push("automations.attendance.first_month must be a non-empty string");
      for (const rk of ["reminder1", "reminder2"]) {
        const r = att[rk];
        if (!r || typeof r !== "object") { errors.push(`automations.attendance.${rk} must be an object`); continue; }
        if (!isNonNegFinite(r.days_before_close)) errors.push(`automations.attendance.${rk}.days_before_close must be a number >= 0`);
        if (!isTime(r.time)) errors.push(`automations.attendance.${rk}.time must be HH:MM 24h`);
      }
    }

    const sdr = a.source_doc_reminders;
    if (!sdr || typeof sdr !== "object") errors.push("automations.source_doc_reminders must be an object");
    else {
      if (!isBool(sdr.enabled)) errors.push("automations.source_doc_reminders.enabled must be true or false");
      if (!Array.isArray(sdr.days_before_close) || sdr.days_before_close.length === 0 || !sdr.days_before_close.every(isNonNegFinite)) {
        errors.push("automations.source_doc_reminders.days_before_close must be a non-empty array of numbers >= 0");
      }
      if (!isTime(sdr.after_time)) errors.push("automations.source_doc_reminders.after_time must be HH:MM 24h");
    }

    const war = a.weekly_attendance_reminder;
    if (!war || typeof war !== "object") errors.push("automations.weekly_attendance_reminder must be an object");
    else {
      if (!isBool(war.enabled)) errors.push("automations.weekly_attendance_reminder.enabled must be true or false");
      if (!isWeekday(war.day)) errors.push("automations.weekly_attendance_reminder.day must be mon..sun");
      if (!isTime(war.after_time)) errors.push("automations.weekly_attendance_reminder.after_time must be HH:MM 24h");
    }

    const sn = a.sunday_note;
    if (!sn || typeof sn !== "object") errors.push("automations.sunday_note must be an object");
    else {
      if (!isBool(sn.enabled)) errors.push("automations.sunday_note.enabled must be true or false");
      if (!isTime(sn.after_time)) errors.push("automations.sunday_note.after_time must be HH:MM 24h");
    }

    const hn = a.health_note;
    if (!hn || typeof hn !== "object") errors.push("automations.health_note must be an object");
    else {
      if (!isBool(hn.enabled)) errors.push("automations.health_note.enabled must be true or false");
      if (!isWeekday(hn.day)) errors.push("automations.health_note.day must be mon..sun");
      if (!isTime(hn.after_time)) errors.push("automations.health_note.after_time must be HH:MM 24h");
      if (!isNonNegFinite(hn.log_trim_mb)) errors.push("automations.health_note.log_trim_mb must be a number >= 0");
      if (!isNonNegFinite(hn.log_trim_lines)) errors.push("automations.health_note.log_trim_lines must be a number >= 0");
    }

    const ub = a.upload_bot;
    if (!ub || typeof ub !== "object") errors.push("automations.upload_bot must be an object");
    else {
      if (!isNonNegFinite(ub.admin_max_kb)) errors.push("automations.upload_bot.admin_max_kb must be a number >= 0");
      if (!isNonNegFinite(ub.finance_max_kb)) errors.push("automations.upload_bot.finance_max_kb must be a number >= 0");
      if (!(typeof ub.jpeg_quality === "number" && Number.isFinite(ub.jpeg_quality) && ub.jpeg_quality >= 1 && ub.jpeg_quality <= 100)) {
        errors.push("automations.upload_bot.jpeg_quality must be a number from 1 to 100");
      }
      if (!isNonNegFinite(ub.max_width_px)) errors.push("automations.upload_bot.max_width_px must be a number >= 0");
    }

    const ds = a.drive_sync;
    if (!ds || typeof ds !== "object") errors.push("automations.drive_sync must be an object");
    else if (!isNonNegFinite(ds.interval_minutes)) errors.push("automations.drive_sync.interval_minutes must be a number >= 0");

    const sup = a.supervisor;
    if (!sup || typeof sup !== "object") errors.push("automations.supervisor must be an object");
    else {
      if (!isNonNegFinite(sup.interval_seconds)) errors.push("automations.supervisor.interval_seconds must be a number >= 0");
      if (!isNonNegFinite(sup.ping_every_cycles)) errors.push("automations.supervisor.ping_every_cycles must be a number >= 0");
      // The four balance-check fields below are OPTIONAL on a saved config — a config saved
      // before they existed has none of them, and must stay valid to save (the app's helpers
      // all fall back to a built-in default when a field is absent, same as everywhere else
      // in this file). Only validate their shape when the caller actually supplies one.
      if (sup.balance_check_interval_minutes !== undefined
          && !(isNonNegFinite(sup.balance_check_interval_minutes) && sup.balance_check_interval_minutes >= 1)) {
        errors.push("automations.supervisor.balance_check_interval_minutes must be a number >= 1");
      }
      if (sup.balance_check_active_from !== undefined && !isTime(sup.balance_check_active_from)) {
        errors.push("automations.supervisor.balance_check_active_from must be HH:MM 24h");
      }
      if (sup.balance_check_active_until !== undefined && !isTime(sup.balance_check_active_until)) {
        errors.push("automations.supervisor.balance_check_active_until must be HH:MM 24h");
      }
      if (sup.balance_match_window_days !== undefined
          && !(isNonNegFinite(sup.balance_match_window_days) && sup.balance_match_window_days >= 1)) {
        errors.push("automations.supervisor.balance_match_window_days must be a number >= 1");
      }
      // restart-20261003: optional box-restart settings (absent = the defaults: wake off, 40 min, 3 h, 3 wakes, 30 min).
      if (sup.restart_wake !== undefined && typeof sup.restart_wake !== "boolean") {
        errors.push("automations.supervisor.restart_wake must be true or false");
      }
      for (const [k, lo, hi] of [["restart_wake_minutes", 20, 240], ["restart_wake_repeat_hours", 1, 24], ["restart_wake_max", 1, 10],
                                 ["bot_hung_restart_minutes", 0, 240]]) {
        if (sup[k] !== undefined && !(isNonNegFinite(sup[k]) && sup[k] >= lo && sup[k] <= hi)) {
          errors.push(`automations.supervisor.${k} must be a number from ${lo} to ${hi}`);
        }
      }
    }

    // Optional (configs saved before WhatsApp posts existed don't have it). Every field inside is optional;
    // the box falls back to its own built-in values when one is absent, same as everywhere else in this file.
    const wa = a.whatsapp;
    if (wa !== undefined) {
      if (!wa || typeof wa !== "object" || Array.isArray(wa)) errors.push("automations.whatsapp must be an object");
      else {
        if (wa.enabled !== undefined && !isBool(wa.enabled)) errors.push("automations.whatsapp.enabled must be true or false");
        if (wa.to !== undefined && !(typeof wa.to === "string" && wa.to.trim() && wa.to.trim().length <= 40)) {
          errors.push("automations.whatsapp.to must be a number or group name (1 to 40 characters)");
        }
        for (const k of ["cutoff_checklist", "morning_reminders", "saturday_note"]) {
          const b = wa[k];
          if (b === undefined) continue;
          if (!b || typeof b !== "object" || Array.isArray(b)) { errors.push(`automations.whatsapp.${k} must be an object`); continue; }
          if (b.enabled !== undefined && !isBool(b.enabled)) errors.push(`automations.whatsapp.${k}.enabled must be true or false`);
          if (b.time !== undefined && !isTime(b.time)) errors.push(`automations.whatsapp.${k}.time must be HH:MM 24h`);
        }
        const sr = wa.sunday_records;
        if (sr !== undefined) {
          if (!sr || typeof sr !== "object" || Array.isArray(sr)) errors.push("automations.whatsapp.sunday_records must be an object");
          else {
            if (sr.enabled !== undefined && !isBool(sr.enabled)) errors.push("automations.whatsapp.sunday_records.enabled must be true or false");
            if (sr.every_minutes !== undefined && !(isNonNegFinite(sr.every_minutes) && sr.every_minutes >= 5 && sr.every_minutes <= 720)) {
              errors.push("automations.whatsapp.sunday_records.every_minutes must be a number from 5 to 720");
            }
          }
        }
        const dbm = wa.deposit_bank_missing;
        if (dbm !== undefined && dbm !== null && typeof dbm === "object" && !Array.isArray(dbm)
            && dbm.days !== undefined && !(Number.isInteger(dbm.days) && dbm.days >= 1 && dbm.days <= 14)) {
          errors.push("automations.whatsapp.deposit_bank_missing.days must be a whole number from 1 to 14");
        }
        for (const k of ["bank_movements", "deposit_bank_confirmed", "deposit_bank_missing", "memo", "statement", "rrr_reminders"]) {
          const b = wa[k];
          if (b === undefined) continue;
          if (!b || typeof b !== "object" || Array.isArray(b)) { errors.push(`automations.whatsapp.${k} must be an object`); continue; }
          if (b.enabled !== undefined && !isBool(b.enabled)) errors.push(`automations.whatsapp.${k}.enabled must be true or false`);
        }
      }
    }

    // Optional (configs saved before the Telegram bot menu existed don't have it); every field inside is optional too,
    // unknown menu keys are ignored. "everyone" is accepted for the restricted commands (the box treats it as "kingdom").
    const tb = a.telegram_bot;
    if (tb !== undefined) {
      if (!tb || typeof tb !== "object" || Array.isArray(tb)) errors.push("automations.telegram_bot must be an object");
      else {
        const menu = tb.menu;
        if (menu !== undefined) {
          if (!menu || typeof menu !== "object" || Array.isArray(menu)) errors.push("automations.telegram_bot.menu must be an object");
          else {
            for (const k of Object.keys(TG_MENU_ALLOWED)) {
              const v = menu[k];
              if (v === undefined) continue;
              const allowed = TG_MENU_ALLOWED[k];
              const ok = typeof v === "string" && (allowed.includes(v) || (v === "everyone" && TG_MENU_RESTRICTED.has(k)));
              if (!ok) errors.push(`automations.telegram_bot.menu.${k} must be one of ${allowed.join(", ")}`);
            }
          }
        }
        if (tb.previous_months !== undefined
            && !(Number.isInteger(tb.previous_months) && tb.previous_months >= 3 && tb.previous_months <= 12)) {
          errors.push("automations.telegram_bot.previous_months must be a whole number from 3 to 12");
        }
        if (tb.month_portal_check !== undefined && !["button", "always", "off"].includes(tb.month_portal_check)) {
          errors.push("automations.telegram_bot.month_portal_check must be one of button, always, off");
        }
        if (tb.reply_unknown !== undefined && !isBool(tb.reply_unknown)) {
          errors.push("automations.telegram_bot.reply_unknown must be true or false");
        }
        if (tb.unknown_contact !== undefined
            && !(typeof tb.unknown_contact === "string" && tb.unknown_contact.trim() && tb.unknown_contact.length <= 80)) {
          errors.push("automations.telegram_bot.unknown_contact must be short text (1 to 80 characters)");
        }
      }
    }
  }

  // Optional (configs saved before month-end moved to the box don't have it).
  const rem = cfg.remittance;
  if (rem !== undefined) {
    if (!rem || typeof rem !== "object" || Array.isArray(rem)) errors.push("remittance must be an object");
    else {
      if (rem.handler !== "clerk_ai" && rem.handler !== "box") errors.push('remittance.handler must be "clerk_ai" or "box"');
      if (!rem.lines || typeof rem.lines !== "object" || Array.isArray(rem.lines)) errors.push("remittance.lines must be an object");
      else {
        for (const [k, v] of Object.entries(rem.lines)) {
          if (!LINE_KEY_RE.test(k)) errors.push(`remittance.lines: "${k}" is not a valid category key`);
          else if (typeof v !== "string" || !v.trim() || v.length > 80) errors.push(`remittance.lines.${k} must be a portal line name (or not remitted)`);
        }
      }
    }
  }

  return errors;
}
