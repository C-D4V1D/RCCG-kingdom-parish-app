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

export const DEFAULT_CONFIG = {
  people: [
    { key: "david", name: "David Chukwuemeka", app_role: "it_admin", telegram_chat_id: "8910112376",
      email: "chukwuemeka.david@zoho.com", can_upload: true, full_status: true, buttons: true },
    { key: "divine", name: "Divine Faith (Bro. Divine)", app_role: "accountant", telegram_chat_id: "6871279109",
      email: "fdivine810@gmail.com", can_upload: true, full_status: false, buttons: true },
    { key: "fabian", name: "Fabian ALOM (Bro. Fabian)", app_role: null, telegram_chat_id: "7410099201",
      email: "fabianalomterpase@gmail.com", can_upload: false, full_status: false, buttons: false },
    { key: "pastor", name: "Pastor (Henry Ofunne)", app_role: "pastor", telegram_chat_id: null,
      email: "henryofunne2@gmail.com", can_upload: false, full_status: false, buttons: false },
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
    memo_forwarded: route({
      david: { telegram: true, email: true },
      divine: { telegram: true, email: true },
      fabian: { telegram: true, email: false },
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
      pastor: { telegram: true, email: true },
    }),
    statement_error: route({ david: { telegram: true, email: false } }),
    attendance_filed: route({
      david: { telegram: true, email: true },
      divine: { telegram: true, email: true },
      pastor: { telegram: true, email: true },
    }),
    attendance_nudge: route({
      david: { telegram: true, email: true },
      divine: { telegram: true, email: true },
      pastor: { telegram: true, email: true },
    }),
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
      signature: "God bless.\nBro. David Chukwuemeka" },
    attendance: { enabled: true, auto_file: true, active_from: "08:00", active_until: "22:00",
      check_interval_minutes: 60, first_month: "2026-10",
      reminder1: { days_before_close: 1, time: "18:00" },
      reminder2: { days_before_close: 0, time: "12:00" } },
    source_doc_reminders: { enabled: true, days_before_close: [3, 1], after_time: "10:00" },
    weekly_attendance_reminder: { enabled: true, day: "mon", after_time: "09:00" },
    sunday_note: { enabled: true, after_time: "09:00" },
    health_note: { enabled: true, day: "sat", after_time: "18:00", log_trim_mb: 1, log_trim_lines: 2000 },
    upload_bot: { admin_max_kb: 500, finance_max_kb: 1024, jpeg_quality: 85, max_width_px: 960 },
    drive_sync: { interval_minutes: 10 },
    supervisor: { interval_seconds: 300, ping_every_cycles: 12 },
  },
};

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const CODE_RE = /^\d+$/;
const CHAT_ID_RE = /^-?\d+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const isBool = (v) => typeof v === "boolean";
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
    }
  }

  return errors;
}
