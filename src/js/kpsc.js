// KPSC Meeting Portal — standalone SPA
// Kingdom Parish Stewardship Committee

const API = '/api';
const SESSION_KEY = 'kpsc_session';
const MEETING_UI_STATE_KEY = 'kpsc_meeting_ui_state';

const GROUPS = [
  { key: 'men',       label: 'Men',       icon: '👔' },
  { key: 'women',     label: 'Women',     icon: '👗' },
  { key: 'youth',     label: 'Youth',     icon: '🎓' },
  { key: 'ministers', label: 'Ministers', icon: '✝️' },
];

const MEETING_TYPES = [
  { value: 'routine',   label: 'Routine'   },
  { value: 'emergency', label: 'Emergency' },
  { value: 'special',   label: 'Special'   },
  { value: 'agm',       label: 'AGM'       },
];

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     cls: 'badge-gray'  },
  recording: { label: 'Recording', cls: 'badge-blue'  },
  ended:     { label: 'Ended',     cls: 'badge-amber' },
  processed: { label: 'Processed', cls: 'badge-green' },
};

const KPSC_PERMISSIONS = {
  acting_chairman:    ['dashboard', 'projects', 'action_items', 'partners', 'partner-progress', 'finance', 'reminders', 'members', 'archive', 'reports', 'agenda_builder', 'settings', 'inbox'],
  general_secretary:  ['dashboard', 'projects', 'action_items', 'partners', 'partner-progress', 'reminders', 'members', 'archive', 'reports', 'agenda_builder', 'settings', 'inbox'],
  financial_secretary:['dashboard', 'projects', 'action_items', 'partners', 'partner-progress', 'finance', 'reminders', 'archive', 'reports', 'inbox'],
  treasurer:          ['dashboard', 'projects', 'action_items', 'partners', 'partner-progress', 'finance', 'reminders', 'archive', 'reports', 'inbox'],
  committee_viewer:   ['dashboard', 'projects', 'action_items', 'partners', 'partner-progress', 'reports', 'archive', 'inbox'],
  // IT admin: full read access + account/settings management; no operational write actions.
  it_admin:           ['dashboard', 'archive', 'projects', 'action_items', 'partners', 'partner-progress', 'finance', 'reminders', 'members', 'reports', 'agenda_builder', 'settings', 'inbox'],
};
// Default write (modify/edit) permissions per role per page
const KPSC_WRITE_PERMISSIONS = {
  acting_chairman:     ['dashboard','projects','action_items','partners','partner-progress','finance','reminders','members','archive','reports','agenda_builder','settings'],
  general_secretary:   ['dashboard','projects','action_items','partners','partner-progress','reminders','members','archive','reports','agenda_builder','settings'],
  financial_secretary: ['finance','partners','partner-progress','archive','reports'],
  treasurer:           ['finance','partners','partner-progress','archive','reports'],
  committee_viewer:    [],
  it_admin:            ['members','settings'],
};

// Default delete permissions per role per page
const KPSC_DELETE_PERMISSIONS = {
  acting_chairman:     ['projects','action_items','partners','finance','archive','agenda_builder'],
  general_secretary:   ['projects','action_items','partners','archive','agenda_builder'],
  financial_secretary: ['finance'],
  treasurer:           ['finance'],
  committee_viewer:    [],
  it_admin:            [],
};

const PIN_REGEX = /^\d{4,6}$/;

// ── NAV GROUP / SUB-TAB MAPPING ────────────────────────────────────
// Maps old page names to (group, subTab) pairs for backwards compat.
const PAGE_TO_GROUP = {
  dashboard:       { group: 'home',     subTab: null              },
  archive:         { group: 'meetings', subTab: 'archive'         },
  reports:         { group: 'meetings', subTab: 'reports'         },
  'partner-progress': { group: 'money', subTab: 'partner-progress' },
  projects:        { group: 'meetings', subTab: 'projects'        },
  action_items:    { group: 'meetings', subTab: 'action_items'    },
  agenda_builder:  { group: 'meetings', subTab: 'agenda_builder'  },
  notification_log: { group: 'meetings', subTab: 'agenda_builder' }, // Full notification history, stays in meetings group
  finance:         { group: 'money',    subTab: 'finance'         },
  partners:        { group: 'money',    subTab: 'partners'        },
  reminders:       { group: 'money',    subTab: 'reminders'       },
  sms_logs:        { group: 'money',    subTab: 'sms_logs'        },
  members:         { group: 'more',     subTab: 'members'         },
  settings:        { group: 'more',     subTab: 'settings'        },
  // Group-level pseudo-pages (rendered inline by their own renderer)
  more:            { group: 'more',     subTab: null },
  // Sub-pages (reachable from within a group; nav highlight stays on group)
  meeting:         { group: 'meetings', subTab: null },
  partnerDetail:   { group: 'money',    subTab: null },
};

// Default sub-tabs when navigating to a group by name
const GROUP_DEFAULT_PAGE = {
  home:     'dashboard',
  meetings: 'archive',
  money:    'partners',
  more:     null, // 'more' renders its own inline menu
};

// ── STATE ──────────────────────────────────────────────────────────
const S = {
  user: null,
  page: 'dashboard',
  group: 'home',
  subTab: null,
  meetings: [],
  activeMeeting: null,
  members: [],
  accounts: [],
  partners: [],
  partnerPayments: [],
  financeEntries: [],
  reminders: [],
  smsLogsFilter: 'all',
  smsLogsData: null,
  smsLogsYear: new Date().getUTCFullYear(),
  smsLogsMonth: new Date().getUTCMonth() + 1,
  dashboard: null,
  projects: [],
  projectsFilter: 'all',
  followups: [],
  archiveSearch: '',
  archiveQuickFilter: 'all',
  partnersYear: new Date().getUTCFullYear(),
  partnersMonth: new Date().getUTCMonth() + 1,
  partnersFilter: 'active',
  partnersSearch: '',
  partnersTypeFilter: '',
  partnersPaymentFilter: 'all',
  financeYear: new Date().getUTCFullYear(),
  financeMonth: new Date().getUTCMonth() + 1,
  financeSearch: '',
  financeTypeFilter: 'all',
  financeCatFilter: '',
  financeMethodFilter: '',
  financeSortCol: 'date',
  financeSortAsc: false,
  reportsYear: new Date().getUTCFullYear(),
  reportsMonth: 0,
  progressMonth: new Date().getUTCMonth() + 1,
  progressFilter: 'all',
  progressSearch: '',
  reportsFilter: 'all',
  reportsSearch: '',
  reportsAssignee: '',
  reportsApproval: 'all',
  insightsViewMode: 'list',
  insightsDigestOpen: false,
  // Agenda Builder state
  agendaNotes: [],
  agendaBuilderStep: 'notes',        // 'notes' | 'select' | 'settings' | 'draft'
  agendaBuilderSuggestions: [],
  agendaBuilderSelected: [],
  agendaBuilderDraftId: null,
  agendaBuilderMessage: '',
  agendaBuilderNotesRec: null,       // MediaRecorder for voice note recording
  agendaBuilderTemplates: [],        // loaded agenda templates
  agendaBuilderChecklist: [],        // prep checklist state for current draft
  agendaBuilderDraftsHistory: [],    // recent saved drafts for history panel
  // Action Items page state
  actionItems: [],
  actionItemsLoaded: false,
  actionItemsFilter: 'all',
  actionItemsViewMode: 'list',
  actionItemsYear: 0,
  actionItemsMonth: 0,
  actionItemsAssignee: '',
  actionItemsMeeting: '',
  actionItemsPriority: '',
  actionItemsSearch: '',
  actionItemsSelected: [],
  _authRecoveryInProgress: false,
  _meetingTab: 'record',
  _reviewEditMode: false, // true = show inline review editor; false = show reviewed summary
  _isNewMeeting: false,   // true when the room is hosting a fresh, never-saved draft
  cashCollection: {
    loaded: false, pendingTotal: 0, collectedTotal: 0, spentTotal: 0,
    holderCount: 0, holders: [], recentHandovers: [],
  },
  pendingCardPayments: [], // partners whose paid record isn't yet updated in the physical card
  kpscMeetingCadence: 'none',
  rolePermissions: null, // loaded from DB; null means use KPSC_PERMISSIONS defaults
};

// ── AUDIO RECORDER + REALTIME TRANSCRIPTION ───────────────────────
const REC_CHUNK_MS = 5000;
const REC_RETRY_BASE_MS = 1200;
const REC_MAX_RETRIES = 5;
// Safety cap: auto-stop a live recording after this many seconds of actual
// recording time (pauses don't count). Nothing in the realtime transcription
// pipeline previously capped session length, so a forgotten open tab could
// stream to OpenAI's realtime API for hours or days, billing the whole time.
// 4 hours comfortably covers any real KPSC meeting/AGM.
const REC_MAX_DURATION_SEC = 4 * 60 * 60;
const KPSC_SESSION_ERRORS = new Set([
  'KPSC session required',
  'KPSC session not found or expired',
  'KPSC session expired',
]);

const Rec = {
  mediaRecorder: null,
  stream: null,
  chunkSeq: 0,
  uploadSessionId: '',
  elapsed: 0,
  timer: null,
  status: 'idle', // idle | recording | paused | stopped
  pc: null,
  dc: null,
  realtimeStatus: 'offline', // offline | connecting | connected | reconnecting | error
  reconnectAttempts: 0,
  reconnectTimer: null,
  manualStop: false,
  transcriptEntries: [],
  lastRenderedCount: 0,
  liveDeltas: new Map(),
  uploadQueue: [],
  uploadBusy: false,
  uploadedChunks: 0,
  failedChunks: 0,
  speakerMap: new Map(),    // Map<number, string>: Deepgram speaker idx → member name
  seenSpeakers: new Set(),  // Set<number>: all Deepgram speaker indices encountered so far
  // Voice-attendance state — keyed by "${groupKey}_${memberIdx}" (same format as checkbox id suffix)
  voiceTicked: new Set(),   // members auto-ticked from transcript this session
  _nameIndex: null,         // lazily built Map<token, [{groupKey, idx, fullName}]>
  _nameIndexSize: -1,       // S.members.length when _nameIndex was last built
  // VF-4 voice-identification state
  speakerIdentified: new Set(), // speaker indices for which a positive match was confirmed
  voiceIdServiceDown: false,    // true after 2 consecutive 503s from /api/voice-identify
  _voiceIdConsecutive503: 0,    // internal counter for 503 detection
  voiceIdLastAttempt: new Map(),// speakerIdx → ms timestamp of last attempt (debounce)
  voiceIdInFlight: new Set(),   // speakerIdx currently being processed (lock)
  voiceIdHistory: new Map(),    // speakerIdx → [{memberId, memberName, score}] (last 3, for EMA smoothing)
  voiceIdAttemptCount: new Map(), // speakerIdx → number of /api/voice-identify calls made (cap at MAX)
  voiceIdGaveUp: new Set(),     // speakerIdx for which we hit the retry cap
};

// ── DIARIZER (Deepgram speaker diarization) ────────────────────────
const DG_MAX_RETRIES = 5;
const DG_RETRY_BASE_MS = 1500;
// Worklet processor code bundled inline to avoid requiring a separate file.
const DG_WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch && ch.length) this.port.postMessage(ch);
    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

const Diarizer = {
  ws: null,
  audioCtx: null,
  workletNode: null,
  workletUrl: null,
  status: 'offline', // offline | connecting | connected | reconnecting | error
  reconnectTimer: null,
  reconnectAttempts: 0,
  manualStop: false,
  // PCM ring buffer — raw Float32 samples from the AudioWorklet. Used by
  // VF-4 to extract per-speaker audio slices for voice fingerprinting.
  pcmChunks: [],        // Array of {offset: number, data: Float32Array}
  pcmSampleOffset: 0,   // Total samples written since Diarizer was constructed
  pcmSampleRate: 0,     // Set from AudioContext.sampleRate on connection
  dgTimeOffset: 0,      // pcmSampleOffset when the current WS connection was opened;
                        // adds to Deepgram's 0-based timestamps to get absolute offsets
  speakerRanges: new Map(), // Map<speakerIdx, {startSample, endSample}[]>
};

const DEFAULT_PCM_SAMPLE_RATE   = 48000;  // fallback rate before the AudioContext is created
const BASE64_CHUNK_SIZE         = 32768;  // chars per chunk when encoding large buffers
const PCM_BUFFER_DURATION_SEC   = 60;     // seconds of PCM audio to retain in the ring buffer

function recFmt() {
  const m = Math.floor(Rec.elapsed / 60);
  const s = Rec.elapsed % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function recTimestamp() {
  const total = Rec.elapsed;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function recStatusLabel() {
  if (Rec.realtimeStatus === 'connected') return 'OpenAI: transcribing';
  if (Rec.realtimeStatus === 'connecting') return 'OpenAI: connecting…';
  if (Rec.realtimeStatus === 'reconnecting') return `OpenAI: reconnecting (${Rec.reconnectAttempts}/${REC_MAX_RETRIES})…`;
  if (Rec.realtimeStatus === 'error') return 'OpenAI: offline';
  return 'OpenAI: offline';
}

function diarizerStatusLabel() {
  if (Diarizer.status === 'connected') return 'Deepgram: diarizing';
  if (Diarizer.status === 'connecting') return 'Deepgram: connecting…';
  if (Diarizer.status === 'reconnecting') return `Deepgram: reconnecting (${Diarizer.reconnectAttempts}/${DG_MAX_RETRIES})…`;
  if (Diarizer.status === 'error') return 'Deepgram: offline';
  return 'Deepgram: offline';
}

function recRenderUI() {
  const el = document.getElementById('kpsc-rec-ui');
  if (!el) return;
  const liveDisabled = Rec.status === 'recording' ? '' : 'disabled';
  const uploadMeta = Rec.status === 'idle'
    ? 'Stream audio with 5-second chunk backups, OpenAI realtime transcription and Deepgram speaker diarization.'
    : `${Rec.uploadedChunks} chunk${Rec.uploadedChunks === 1 ? '' : 's'} uploaded${Rec.failedChunks ? ` • ${Rec.failedChunks} pending retry` : ''}`;

  if (Rec.status === 'idle') {
    // If the meeting was already started in a prior browser session, the in-memory MediaRecorder is gone.
    // Offer "Continue Recording" so the secretary can start a fresh mic segment that appends to the same meeting.
    const resuming = S.activeMeeting?.status === 'recording';
    el.innerHTML = `
      <div class="rec-card">
        <div class="rec-main">
          <button class="kbtn kbtn-record" onclick="Kpsc.recStart(this)">${resuming ? '▶ Continue Recording' : '🎙 Start Meeting'}</button>
          <span class="rec-hint">${resuming ? 'Previous mic session ended when you navigated away. A new segment will be appended to this meeting.' : uploadMeta}</span>
        </div>
      </div>`;
  } else if (Rec.status === 'recording') {
    el.innerHTML = `
      <div class="rec-card rec-card-live">
        <div class="rec-main">
          <span class="rec-dot rec-dot-live"></span>
          <span class="rec-timer" id="kpsc-rec-timer">${recFmt()}</span>
          <button class="kbtn kbtn-sm" onclick="Kpsc.recPause()">⏸ Pause</button>
          <button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.recStop()">⏹ End Recording</button>
        </div>
        <div class="rec-meta">
          <span class="rec-rt rec-rt-${Rec.realtimeStatus}">${recStatusLabel()}</span>
          <span class="rec-rt rec-rt-dg-${Diarizer.status}">${diarizerStatusLabel()}</span>
          <span>${uploadMeta}</span>
        </div>
      </div>`;
  } else if (Rec.status === 'paused') {
    el.innerHTML = `
      <div class="rec-card rec-card-paused">
        <div class="rec-main">
          <span class="rec-dot rec-dot-paused"></span>
          <span class="rec-timer">${recFmt()} — Paused</span>
          <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.recResume()">▶ Resume</button>
          <button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.recStop()">⏹ End Recording</button>
        </div>
        <div class="rec-meta">
          <span>Microphone paused</span>
          <span>${uploadMeta}</span>
        </div>
      </div>`;
  } else if (Rec.status === 'stopped') {
    el.innerHTML = `
      <div class="rec-card rec-card-stopped">
        <div class="rec-main">
          <span class="rec-dot rec-dot-stopped"></span>
          <span class="rec-timer">${recFmt()} — Stopped</span>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.recReset()">🗑 Reset Recorder</button>
        </div>
        <div class="rec-meta">Recording ended. Use the End Meeting button to lock the transcript and prepare minutes; full audio was never kept in browser memory, only short chunks were uploaded.</div>
      </div>`;
  }
  const transcriptPanel = document.getElementById('kpsc-live-transcript');
  if (transcriptPanel) transcriptPanel.toggleAttribute('data-recording', liveDisabled === '');

  // When the meeting was opened as 'draft' and recording was started in the same
  // session, renderMeetingRoom() did not produce an "End Meeting" button (because
  // the DB status was still 'draft' at render time). Inject it now so the button
  // is always available once any live recording session has been initiated.
  const roomActions = document.querySelector('.k-room-actions');
  if (roomActions) {
    const needsEndBtn = Rec.status === 'recording' || Rec.status === 'paused' || Rec.status === 'stopped';
    let endBtn = document.getElementById('km-end-meeting-btn');
    if (needsEndBtn && !endBtn) {
      endBtn = document.createElement('button');
      endBtn.id = 'km-end-meeting-btn';
      endBtn.className = 'kbtn kbtn-amber';
      endBtn.textContent = '🔒 End Meeting';
      endBtn.onclick = function () { Kpsc.endMeeting(this); };
      roomActions.appendChild(endBtn);
    }
  }
}

// Return the display name for a Deepgram speaker index.
// Uses the speakerMap if a member has been assigned, otherwise falls back to "Speaker N".
function speakerDisplayName(idx) {
  if (idx === null || idx === undefined) return '';
  return Rec.speakerMap.get(idx) || `Speaker ${idx + 1}`;
}

function recEntryHtml(entry) {
  const hasSpeaker = entry.speaker !== null && entry.speaker !== undefined;
  const displayName = hasSpeaker ? speakerDisplayName(entry.speaker) : '';
  const speakerHtml = hasSpeaker
    ? `<span class="lt-speaker lt-spk-${entry.speaker % 6}">${esc(displayName)}</span>`
    : '';
  return `<div class="lt-entry${entry.partial ? ' lt-entry-partial' : ''}${hasSpeaker ? ' lt-entry-diarized' : ''}">` +
    `<span class="lt-time">${esc(entry.timestamp)}</span>` +
    speakerHtml +
    `<span class="lt-text">${esc(entry.text)}</span>` +
    `</div>`;
}

function recRenderTranscript() {
  const list = document.getElementById('kpsc-live-transcript-list');
  if (!list) return;
  const partials = [...Rec.liveDeltas.entries()].filter(([, text]) => text.trim()).map(([itemId, text]) => ({
    itemId,
    timestamp: recTimestamp(),
    text,
    partial: true,
    speaker: null,
  }));

  const stableCount = Rec.transcriptEntries.length;
  const lastRendered = Rec.lastRenderedCount ?? -1;

  // Full re-render when entries were removed/reordered (rare), or when
  // nothing has ever been rendered (lastRendered === -1 / 0 with empty list).
  const needsFullRender = lastRendered > stableCount ||
    (list.children.length === 0 && !list.querySelector('.lt-empty') && lastRendered < 0);
  if (needsFullRender) {
    list.innerHTML = (stableCount + partials.length) === 0
      ? '<div class="lt-empty">Live transcript will appear here as people speak.</div>'
      : [...Rec.transcriptEntries, ...partials].map(recEntryHtml).join('');
    Rec.lastRenderedCount = stableCount;
    list.scrollTop = list.scrollHeight;
    return;
  }

  // Remove the placeholder if the list was previously empty.
  if (list.querySelector('.lt-empty')) {
    list.innerHTML = '';
    Rec.lastRenderedCount = 0;
  }

  // Append any newly finalised stable entries that weren't in the DOM yet.
  if (stableCount > (Rec.lastRenderedCount ?? 0)) {
    const frag = document.createDocumentFragment();
    const tmp = document.createElement('div');
    for (let i = Rec.lastRenderedCount ?? 0; i < stableCount; i++) {
      tmp.innerHTML = recEntryHtml(Rec.transcriptEntries[i]);
      frag.appendChild(tmp.firstChild);
    }
    list.appendChild(frag);
    Rec.lastRenderedCount = stableCount;
  }

  // Remove all existing partial (liveDeltas) nodes, then re-append current ones.
  // Partials are always at the end of the list.
  let child = list.lastChild;
  while (child && child.classList?.contains('lt-entry-partial')) {
    const prev = child.previousSibling;
    list.removeChild(child);
    child = prev;
  }
  if (partials.length) {
    const frag = document.createDocumentFragment();
    const tmp = document.createElement('div');
    for (const entry of partials) {
      tmp.innerHTML = recEntryHtml(entry);
      frag.appendChild(tmp.firstChild);
    }
    list.appendChild(frag);
  }

  list.scrollTop = list.scrollHeight;
}

function recAppendTranscript(text, itemId = '', speaker = null) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  if (speaker !== null && speaker !== undefined) {
    // Track newly seen speakers so the identity panel can be updated.
    if (!Rec.seenSpeakers.has(speaker)) {
      Rec.seenSpeakers.add(speaker);
      recRenderSpeakerMap();
    }
    // VF-4: try voice fingerprint identification on EVERY transcript event.
    // The function debounces (~once per 4s) and locks against concurrent
    // requests, so this is safe even with rapid diarizer updates.
    maybeFireVoiceId(speaker);
  }
  const entry = { itemId, timestamp: recTimestamp(), text: clean, speaker: speaker ?? null };
  Rec.transcriptEntries.push(entry);
  // Auto-tick attendance when a roster member's name is spoken.
  voiceAutoTick(clean);
  const textarea = document.getElementById('km-transcript');
  if (textarea) {
    const speakerTag = speaker !== null && speaker !== undefined ? ` [${speakerDisplayName(speaker)}]` : '';
    const line = `[${entry.timestamp}]${speakerTag} ${entry.text}`;
    textarea.value = textarea.value ? `${textarea.value}\n${line}` : line;
    textarea.scrollTop = textarea.scrollHeight;
    // Programmatic textarea updates don't fire 'input' events, so trigger autosave
    // explicitly so live transcript entries are persisted to the server.
    scheduleAutoSave();
  }
  recRenderTranscript();
}

// Rebuild the transcript textarea from scratch using the current speakerMap.
// Called after a speaker assignment changes so existing lines reflect the new name.
function rebuildTranscriptTextarea() {
  const textarea = document.getElementById('km-transcript');
  if (!textarea) return;
  const lines = Rec.transcriptEntries.map(entry => {
    const speakerTag = entry.speaker !== null && entry.speaker !== undefined ? ` [${speakerDisplayName(entry.speaker)}]` : '';
    return `[${entry.timestamp}]${speakerTag} ${entry.text}`;
  });
  textarea.value = lines.join('\n');
  textarea.scrollTop = textarea.scrollHeight;
  scheduleAutoSave();
}

// Build a sorted list of member names for the speaker-identity dropdowns.
// Present members (checked in attendance) are shown first; the rest follow.
function speakerMemberOptions() {
  const present = new Set();
  for (const g of GROUPS) {
    const groupMembers = S.members.filter(m => m.group === g.key);
    groupMembers.forEach((mem, i) => {
      const el = document.getElementById(`att_present_${g.key}_${i}`);
      if (el?.checked) present.add(mem.name);
    });
  }
  const presentNames = S.members.filter(m => present.has(m.name)).map(m => m.name);
  const otherNames  = S.members.filter(m => !present.has(m.name)).map(m => m.name);
  return { presentNames, otherNames };
}

// Render (or refresh) the "Identify Speakers" panel that maps Deepgram indices to members.
function recRenderSpeakerMap() {
  const panel = document.getElementById('kpsc-speaker-map');
  if (!panel) return;
  if (Rec.seenSpeakers.size === 0) {
    panel.innerHTML = '';
    return;
  }

  const { presentNames, otherNames } = speakerMemberOptions();
  const indices = [...Rec.seenSpeakers].sort((a, b) => a - b);

  const rows = indices.map(idx => {
    const assigned = Rec.speakerMap.get(idx) || '';
    const colourClass = `lt-spk-${idx % 6}`;
    const makeOption = (name, label) =>
      `<option value="${esc(name)}" ${assigned === name ? 'selected' : ''}>${esc(label || name)}</option>`;

    const presentOpts = presentNames.length
      ? `<optgroup label="Present">${presentNames.map(n => makeOption(n, n)).join('')}</optgroup>`
      : '';
    const otherOpts = otherNames.length
      ? `<optgroup label="Other Members">${otherNames.map(n => makeOption(n, n)).join('')}</optgroup>`
      : '';

    return `
      <div class="k-spk-row">
        <span class="lt-speaker ${colourClass}">${esc(speakerDisplayName(idx))}</span>
        <select class="k-spk-sel" onchange="Kpsc.assignSpeaker(${idx}, this.value)">
          <option value=""${!assigned ? ' selected' : ''}>— Unassigned —</option>
          ${presentOpts}${otherOpts}
        </select>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="k-speaker-map">
      <div class="k-spk-hdr">
        <span class="k-spk-title">🎙 Identify Speakers</span>
        <span class="k-spk-hint">Assign each detected voice to a member. The transcript updates instantly.</span>
      </div>
      <div class="k-spk-rows">${rows}</div>
    </div>`;
}

// Assign a Deepgram speaker index to a member name (or clear if name is empty).
// Updates the live transcript and the saved textarea immediately.
function assignSpeaker(idx, name) {
  const n = String(name || '').trim();
  if (n) {
    Rec.speakerMap.set(idx, n);
  } else {
    Rec.speakerMap.delete(idx);
  }
  rebuildTranscriptTextarea();
  // Force a full re-render because existing entries' speaker names have changed.
  Rec.lastRenderedCount = 0;
  recRenderTranscript();
  recRenderSpeakerMap();
}

// ── VOICE-DRIVEN ATTENDANCE ────────────────────────────────────────

// Normalise a name string into a single first-name token used for matching.
// Strips diacritics, keeps only lowercase a-z, returns the first word.
// Returns '' if the result is shorter than 3 characters (too ambiguous).
function _normToken(str) {
  const tok = String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip combining diacritics
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)[0] || '';
  return tok.length >= 3 ? tok : '';
}

// Build Map<token, [{groupKey, idx, fullName}]> from the current roster.
// Multiple members with the same first-name token land in the same array so
// we can detect ambiguity and skip the auto-tick (see voiceAutoTick).
function buildAttendanceNameIndex(members) {
  const index = new Map();
  for (const g of GROUPS) {
    const groupMembers = members.filter(m => m.group === g.key);
    groupMembers.forEach((mem, i) => {
      const token = _normToken(mem.name);
      if (!token) return;
      if (!index.has(token)) index.set(token, []);
      index.get(token).push({ groupKey: g.key, idx: i, fullName: mem.name });
    });
  }
  return index;
}

// Pure decision function — returns [{groupKey, idx}] for members that should
// be auto-ticked based on the transcript text.  Exported for unit testing.
// alreadyTicked is a Set of "${groupKey}_${idx}" strings.
function pickAutoTickTargets(text, nameIndex, alreadyTicked) {
  const results = [];
  const seenKeys = new Set();
  // Tokenise the incoming text the same way as the index keys.
  const words = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/);
  const unique = [...new Set(words.filter(w => w.length >= 3))];
  for (const word of unique) {
    const matches = nameIndex.get(word);
    if (!matches || matches.length === 0) continue;
    if (matches.length > 1) continue; // ambiguous — skip
    const { groupKey, idx } = matches[0];
    const key = `${groupKey}_${idx}`;
    if (alreadyTicked.has(key)) continue; // already voice-ticked
    if (seenKeys.has(key)) continue;       // duplicate token in same utterance
    seenKeys.add(key);
    results.push({ groupKey, idx });
  }
  return results;
}

// Apply a single voice-tick to the DOM checkbox for the given member.
function autoTickMember(groupKey, idx) {
  const checkbox = document.getElementById(`att_present_${groupKey}_${idx}`);
  if (!checkbox) return; // attendance panel not rendered (user navigated away)
  const key = `${groupKey}_${idx}`;
  // If already checked manually (not by voice), leave it alone — don't badge it.
  if (checkbox.checked && !Rec.voiceTicked.has(key)) return;
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  Rec.voiceTicked.add(key);
  // Inject mic badge into the member row's name span — idempotent.
  const label = checkbox.closest('label');
  const nameSpan = label?.querySelector('.k-att-name');
  if (nameSpan && !nameSpan.querySelector('.k-att-voice-tick')) {
    const badge = document.createElement('span');
    badge.className = 'k-att-voice-tick';
    badge.title = 'Auto-ticked from voice transcript';
    badge.textContent = '🎙';
    nameSpan.appendChild(badge);
  }
}

// Called from recAppendTranscript for each incoming line of transcript.
// Lazily builds/rebuilds the name index when roster size changes.
function voiceAutoTick(clean) {
  if (!clean) return;
  // Lazily (re)build the name index if the roster has changed size.
  if (Rec._nameIndex === null || Rec._nameIndexSize !== S.members.length) {
    Rec._nameIndex     = buildAttendanceNameIndex(S.members);
    Rec._nameIndexSize = S.members.length;
  }
  const targets = pickAutoTickTargets(clean, Rec._nameIndex, Rec.voiceTicked);
  for (const { groupKey, idx } of targets) {
    autoTickMember(groupKey, idx);
  }
}

async function recStart(btn) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast('This browser does not support live audio recording.', 'error');
    return;
  }
  let stream = null;
  try {
    if (btn) btn.disabled = true;
    const concurrent = findOtherActiveMeeting(S.activeMeeting?.id || '');
    if (concurrent && !S.activeMeeting) {
      const resume = confirm(`Another active meeting already exists: "${concurrent.title || 'Untitled meeting'}". Open it instead?`);
      if (resume) await openMeeting(concurrent.id);
      else showToast('Resume or discard the existing active meeting before starting another recording.', 'warn');
      return;
    }
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    // Auto-persist the meeting only after microphone access succeeds so a denied prompt
    // does not leave behind a ghost draft. No toast on success.
    if (!S.activeMeeting) {
      await autoSaveNow();
      if (!S.activeMeeting) {
        stream.getTracks().forEach(t => t.stop());
        showToast('Could not save the meeting. Check your connection and try again.', 'error');
        return;
      }
    }
    Rec.stream = stream;
    Rec.chunkSeq = 0;
    Rec.uploadSessionId = `kpsc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    Rec.elapsed = 0;
    Rec.uploadedChunks = 0;
    Rec.failedChunks = 0;
    Rec.uploadQueue = [];
    Rec.transcriptEntries = [];
    // Seed transcript with prior content when resuming so the live panel isn't blank.
    const existingText = document.getElementById('km-transcript')?.value?.trim();
    if (existingText && Rec.transcriptEntries.length === 0) {
      Rec.transcriptEntries = [{ speaker: '', text: '[Prior transcript loaded]', isFinal: true, ts: 0 }];
    }
    Rec.lastRenderedCount = 0;
    Rec.liveDeltas = new Map();
    Rec.speakerMap = new Map();
    Rec.seenSpeakers = new Set();
    Rec.manualStop = false;
    Rec.reconnectAttempts = 0;
    Rec.status = 'recording';
    // Reset voice-id state for the new session (VF-4).
    Rec.speakerIdentified      = new Set();
    Rec.voiceIdServiceDown     = false;
    Rec._voiceIdConsecutive503 = 0;
    Rec.voiceIdLastAttempt     = new Map();
    Rec.voiceIdInFlight        = new Set();
    Rec.voiceIdHistory         = new Map();
    Rec.voiceIdAttemptCount    = new Map();
    Rec.voiceIdGaveUp          = new Set();
    // Reset per-speaker identification state for the new session.
    Diarizer.speakerRanges   = new Map();

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    Rec.mediaRecorder = new MediaRecorder(Rec.stream, mimeType ? { mimeType } : undefined);
    Rec.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recQueueChunk(e.data, Rec.mediaRecorder.mimeType || mimeType || 'audio/webm');
    };
    Rec.mediaRecorder.onstop = () => recFlushUploads(true);
    Rec.mediaRecorder.start(REC_CHUNK_MS);
    recStartTimer();
    recRenderUI();
    recRenderTranscript();
    // Start OpenAI realtime transcription (fast interim display)
    try {
      await recConnectRealtime();
    } catch (e) {
      Rec.realtimeStatus = 'error';
      recRenderUI();
      showToast(e.message || 'Realtime transcription is offline; chunked audio upload is still running.', 'error');
    }
    // Start Deepgram diarization (speaker-labelled final transcripts)
    try {
      await diarizerConnect();
    } catch (e) {
      console.error('[diarizer] connect failed:', e);
      Diarizer.status = 'error';
      recRenderUI();
      showToast(`Deepgram: ${e.message || 'speaker diarization is offline'}`, 'warn');
    }

    const statusInput = document.getElementById('km-status');
    if (statusInput && statusInput.value === 'draft') {
      statusInput.value = 'recording';
      updateStepperUI('recording');
    }

    // Immediately tell the server the meeting is now recording so that
    // a page refresh or server-side poll reflects the correct status.
    if (S.activeMeeting) {
      apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, { status: 'recording' })
        .then(res => { if (res && !res.error) S.activeMeeting = res; })
        .catch(() => { /* non-fatal — autosave will sync status on the next cycle */ });
    }
  } catch (e) {
    if (stream && stream !== Rec.stream) stream.getTracks().forEach(t => t.stop());
    recStopTracks();
    Rec.status = 'idle';
    Rec.realtimeStatus = 'error';
    showToast(e.message || 'Microphone access denied. Please allow mic permission and try again.', 'error');
  } finally {
    if (btn) btn.disabled = false;
    recRenderUI();
  }
}

function recStartTimer() {
  clearInterval(Rec.timer);
  Rec.timer = setInterval(() => {
    if (Rec.status !== 'recording') return;
    Rec.elapsed++;
    const el = document.getElementById('kpsc-rec-timer');
    if (el) el.textContent = recFmt();
    if (Rec.elapsed >= REC_MAX_DURATION_SEC) {
      recStop();
      showToast(`Recording auto-stopped after reaching the ${Math.round(REC_MAX_DURATION_SEC / 3600)}-hour safety limit. Review and process the meeting whenever you're ready.`, 'warn');
    }
  }, 1000);
}

async function recConnectRealtime() {
  if (!Rec.stream || Rec.manualStop) return;
  recCloseRealtime(false);
  Rec.realtimeStatus = Rec.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
  recRenderUI();

  const tokenRes = await apiPost('realtime-transcription-token', {});
  if (tokenRes.error) throw new Error(tokenRes.error);
  const ephemeralKey = tokenRes.value || tokenRes.client_secret?.value;
  if (!ephemeralKey) throw new Error('Realtime transcription token was not returned by the server.');

  const pc = new RTCPeerConnection();
  Rec.pc = pc;
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && !Rec.manualStop && Rec.status === 'recording') {
      recScheduleReconnect();
    }
  };

  const track = Rec.stream.getAudioTracks()[0];
  if (!track) throw new Error('No microphone audio track is available.');
  pc.addTrack(track, Rec.stream);

  const dc = pc.createDataChannel('oai-events');
  Rec.dc = dc;
  dc.onopen = () => {
    Rec.realtimeStatus = 'connected';
    Rec.reconnectAttempts = 0;
    recRenderUI();
  };
  dc.onmessage = (event) => recHandleRealtimeEvent(event.data);
  dc.onclose = () => {
    if (!Rec.manualStop && Rec.status === 'recording') recScheduleReconnect();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${ephemeralKey}`,
      'Content-Type': 'application/sdp',
    },
  });
  if (!sdpResponse.ok) throw new Error(`Realtime connection failed (${sdpResponse.status}).`);
  await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() });
}

function recHandleRealtimeEvent(raw) {
  let event;
  try { event = JSON.parse(raw); } catch { return; }
  if (event.type === 'conversation.item.input_audio_transcription.delta') {
    const itemId = event.item_id || event.itemId || 'live';
    const current = Rec.liveDeltas.get(itemId) || '';
    Rec.liveDeltas.set(itemId, current + (event.delta || ''));
    recRenderTranscript();
  } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
    const itemId = event.item_id || event.itemId || '';
    Rec.liveDeltas.delete(itemId);
    // When Deepgram diarization is active it owns the final transcript (with speaker labels).
    // OpenAI only provides the fast interim display; suppress its final commit here.
    if (Diarizer.status !== 'connected') {
      recAppendTranscript(event.transcript || '', itemId);
    } else {
      recRenderTranscript();
    }
  } else if (event.type === 'error') {
    showToast(event.error?.message || 'Realtime transcription error.', 'error');
  }
}

function recScheduleReconnect() {
  if (Rec.manualStop || Rec.status !== 'recording' || Rec.reconnectTimer) return;
  if (Rec.reconnectAttempts >= REC_MAX_RETRIES) {
    Rec.realtimeStatus = 'error';
    recRenderUI();
    showToast('Realtime transcription disconnected. Audio chunk uploads are still running.', 'error');
    return;
  }
  Rec.reconnectAttempts++;
  Rec.realtimeStatus = 'reconnecting';
  const delay = REC_RETRY_BASE_MS * (2 ** (Rec.reconnectAttempts - 1));
  recRenderUI();
  Rec.reconnectTimer = setTimeout(async () => {
    Rec.reconnectTimer = null;
    try { await recConnectRealtime(); }
    catch { recScheduleReconnect(); }
  }, delay);
}

function recPause() {
  if (Rec.mediaRecorder?.state === 'recording') {
    Rec.mediaRecorder.requestData();
    Rec.mediaRecorder.pause();
    Rec.stream?.getAudioTracks().forEach(t => { t.enabled = false; });
    clearInterval(Rec.timer);
    recCloseRealtime(false);
    diarizerClose(false);
    Rec.status = 'paused';
    Rec.realtimeStatus = 'offline';
    recRenderUI();
  }
}

async function recResume() {
  if (Rec.mediaRecorder?.state === 'paused') {
    Rec.stream?.getAudioTracks().forEach(t => { t.enabled = true; });
    Rec.mediaRecorder.resume();
    Rec.status = 'recording';
    Rec.manualStop = false;
    Diarizer.manualStop = false;
    // Cancel any in-flight reconnect timers so we don't double-connect when
    // the explicit reconnect calls below race the scheduled retry.
    if (Rec.reconnectTimer) { clearTimeout(Rec.reconnectTimer); Rec.reconnectTimer = null; }
    if (Diarizer.reconnectTimer) { clearTimeout(Diarizer.reconnectTimer); Diarizer.reconnectTimer = null; }
    Rec.reconnectAttempts = 0;
    Diarizer.reconnectAttempts = 0;
    Diarizer._stableSince = 0;
    recStartTimer();
    recRenderUI();
    try { await recConnectRealtime(); }
    catch { recScheduleReconnect(); }
    try { await diarizerConnect(); }
    catch { diarizerScheduleReconnect(); }
  }
}

function recStop() {
  Rec.manualStop = true;
  clearInterval(Rec.timer);
  clearTimeout(Rec.reconnectTimer);
  Rec.reconnectTimer = null;
  if (Rec.mediaRecorder && Rec.mediaRecorder.state !== 'inactive') {
    try { Rec.mediaRecorder.requestData(); } catch (_) { /* noop */ }
    Rec.mediaRecorder.stop();
  }
  recCloseRealtime(true);
  diarizerClose(true);
  recStopTracks();
  Rec.status = 'stopped';
  Rec.realtimeStatus = 'offline';
  recRenderUI();
}

function recReset() {
  recStop();
  Rec.chunkSeq = 0;
  Rec.uploadSessionId = '';
  Rec.elapsed = 0;
  Rec.status = 'idle';
  Rec.transcriptEntries = [];
  Rec.lastRenderedCount = 0;
  Rec.liveDeltas = new Map();
  Rec.uploadQueue = [];
  Rec.uploadedChunks = 0;
  Rec.failedChunks = 0;
  Rec.speakerMap = new Map();
  Rec.seenSpeakers = new Set();
  Rec.voiceTicked = new Set();
  Rec._nameIndex = null;
  Rec._nameIndexSize = -1;
  Rec.speakerIdentified      = new Set();
  Rec.voiceIdServiceDown     = false;
  Rec._voiceIdConsecutive503 = 0;
  Rec.voiceIdLastAttempt     = new Map();
  Rec.voiceIdInFlight        = new Set();
  if (Rec.voiceIdHistory) Rec.voiceIdHistory.clear();
  if (Diarizer._cleanupInterval) { clearInterval(Diarizer._cleanupInterval); Diarizer._cleanupInterval = null; }
  Diarizer.status = 'offline';
  Diarizer.manualStop = false;
  Diarizer.reconnectAttempts = 0;
  Diarizer.speakerRanges   = new Map();
  recRenderUI();
  recRenderTranscript();
  recRenderSpeakerMap();
}

function recCloseRealtime(markManual) {
  if (markManual) Rec.manualStop = true;
  try { Rec.dc?.close(); } catch (_) { /* noop */ }
  try { Rec.pc?.close(); } catch (_) { /* noop */ }
  Rec.dc = null;
  Rec.pc = null;
}

function recStopTracks() {
  if (Rec.stream) {
    Rec.stream.getTracks().forEach(t => t.stop());
    Rec.stream = null;
  }
}

function recQueueChunk(blob, mimeType) {
  const chunk = {
    blob,
    mimeType,
    seq: ++Rec.chunkSeq,
    meetingId: S.activeMeeting?.id || '',
    uploadSessionId: Rec.uploadSessionId,
    createdAt: new Date().toISOString(),
  };
  Rec.uploadQueue.push(chunk);
  if (!Rec.uploadRetryScheduled) recFlushUploads(false);
}

async function recFlushUploads(useKeepalive) {
  // Acquire the busy lock BEFORE clearing uploadRetryScheduled so that any
  // recQueueChunk call racing in between cannot start a second concurrent loop.
  if (Rec.uploadBusy) return;
  Rec.uploadBusy = true;
  Rec.uploadRetryScheduled = false;
  try {
    while (Rec.uploadQueue.length) {
      const chunk = Rec.uploadQueue[0];
      try {
        await recUploadChunk(chunk, useKeepalive);
        Rec.uploadQueue.shift();
        Rec.uploadedChunks++;
        Rec.failedChunks = Math.max(0, Rec.failedChunks - 1);
        recRenderUI();
      } catch (_) {
        Rec.failedChunks = Rec.uploadQueue.length;
        if (!Rec.uploadRetryScheduled) {
          Rec.uploadRetryScheduled = true;
          setTimeout(() => recFlushUploads(false), 2500);
        }
        break;
      }
    }
  } finally {
    Rec.uploadBusy = false;
  }
}

async function recUploadChunk(chunk, useKeepalive) {
  const form = new FormData();
  form.append('audio', chunk.blob, `kpsc-${chunk.uploadSessionId}-${String(chunk.seq).padStart(5, '0')}.webm`);
  form.append('meetingId', chunk.meetingId);
  form.append('uploadSessionId', chunk.uploadSessionId);
  form.append('sequence', String(chunk.seq));
  form.append('mimeType', chunk.mimeType);
  form.append('createdAt', chunk.createdAt);
  const response = await fetch(`${API}/ai-secretary-meetings/audio-chunk`, {
    method: 'POST',
    headers: { ...kpscSessionHeader() },
    body: form,
    keepalive: !!useKeepalive && chunk.blob.size < 60000,
  });
  if (!response.ok) throw new Error('Chunk upload failed');
  const data = await response.json();
  if (data.error) throw new Error(data.error);
}

function flushMeetingKeepaliveDraft() {
  const mid = S.activeMeeting?.id;
  if (!mid) return;
  const transEl = document.getElementById('km-transcript');
  if (!transEl) return;
  const title = document.getElementById('km-title')?.value.trim();
  const meetingDate = document.getElementById('km-date')?.value;
  const meetingType = document.getElementById('km-type')?.value;
  const status = document.getElementById('km-status')?.value;
  const scheduledFor = document.getElementById('km-scheduled-for')?.value || null;
  const payload = {
    title: title || undefined,
    meetingDate: meetingDate || undefined,
    meetingType: meetingType || undefined,
    status: status || undefined,
    transcriptText: transEl.value,
    participants: document.getElementById('km-attendance') ? readAttendance() : undefined,
    scheduledFor,
  };
  try {
    fetch(`${API}/ai-secretary-meetings/${mid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (_) { /* noop */ }
}

window.addEventListener('beforeunload', () => {
  if (Rec.status === 'recording' && Rec.mediaRecorder?.state === 'recording') {
    try { Rec.mediaRecorder.requestData(); } catch (_) { /* noop */ }
  }
  // Flush in-memory meeting-room fields via keepalive so late transcript/details edits
  // are less likely to be lost during refresh/close/navigation away.
  flushMeetingKeepaliveDraft();
});

window.addEventListener('pagehide', () => {
  flushMeetingKeepaliveDraft();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && Rec.status === 'recording' && Rec.mediaRecorder?.state === 'recording') {
    try { Rec.mediaRecorder.requestData(); } catch (_) { /* noop */ }
    recFlushUploads(true);
  }
});

// ── DIARIZER FUNCTIONS (Deepgram speaker diarization) ─────────────

// Convert Float32 PCM samples to Int16 for Deepgram's linear16 encoding.
function diarizerFloat32ToInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
  }
  return int16;
}

// Group consecutive words by speaker to form speaker-turn segments.
function diarizerExtractSpeakerTurns(words) {
  if (!words || !words.length) return [];
  const turns = [];
  let curSpeaker = words[0].speaker ?? 0;
  let curWords = [words[0].word];
  for (let i = 1; i < words.length; i++) {
    const spk = words[i].speaker ?? 0;
    if (spk === curSpeaker) {
      curWords.push(words[i].word);
    } else {
      turns.push({ speaker: curSpeaker, text: curWords.join(' ') });
      curSpeaker = spk;
      curWords = [words[i].word];
    }
  }
  if (curWords.length) turns.push({ speaker: curSpeaker, text: curWords.join(' ') });
  return turns;
}

async function diarizerConnect() {
  if (!Rec.stream || Diarizer.manualStop) return;
  // Lock against concurrent connects (e.g. resume + scheduled reconnect race).
  if (Diarizer._connecting) return;
  Diarizer._connecting = true;
  diarizerClose(false);
  Diarizer.status = Diarizer.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
  Diarizer._stableSince = 0;
  recRenderUI();

  try {
    console.info('[diarizer] requesting token from server');
    const tokenRes = await apiPost('deepgram-transcription-token', {});
    if (tokenRes.error) throw new Error(tokenRes.error);
    const accessToken = tokenRes.key;
    if (!accessToken) throw new Error('Deepgram access token was not returned by the server.');
    console.info('[diarizer] token received, length =', accessToken.length);

    // Build AudioContext and AudioWorklet pipeline for raw PCM streaming.
    const audioCtx = new AudioContext();
    Diarizer.audioCtx = audioCtx;
    // AudioContext starts suspended when created outside an active user
    // gesture (e.g. after awaiting the token fetch). Without this resume,
    // no PCM reaches the worklet until the user pauses and resumes.
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch (_) { /* noop */ }
    }

    // Register the inline worklet processor via a Blob URL.
    const blob = new Blob([DG_WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    Diarizer.workletUrl = workletUrl;
    try {
      await audioCtx.audioWorklet.addModule(workletUrl);
    } catch (e) {
      throw new Error(`AudioWorklet module load failed: ${e.message || e}. ` +
        `This usually means the browser blocked the inline worker — try Chrome/Edge or disable strict CSP.`);
    }

    const source = audioCtx.createMediaStreamSource(Rec.stream);
    const workletNode = new AudioWorkletNode(audioCtx, 'pcm-capture-processor');
    Diarizer.workletNode = workletNode;

    // Build the Deepgram WebSocket URL with required parameters.
    const sampleRate = audioCtx.sampleRate;
    const dgParams = new URLSearchParams({
      model: 'nova-2-general',
      diarize: 'true',
      punctuate: 'true',
      interim_results: 'true',
      smart_format: 'true',
      encoding: 'linear16',
      sample_rate: String(Math.round(sampleRate)),
      channels: '1',
      language: 'en',
    });
    // Deepgram authenticates browser WebSocket connections via the
    // Sec-WebSocket-Protocol subprotocol ('bearer', <token>). Query
    // parameters like ?token=... are NOT accepted and silently fail.
    console.info('[diarizer] opening WebSocket to Deepgram');
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${dgParams}`, ['bearer', accessToken]);
    Diarizer.ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      Diarizer.status = 'connected';
      // Record the PCM sample offset at the moment this WS connection opened.
      // Deepgram timestamps restart from 0 on each new connection; dgTimeOffset
      // converts them to absolute positions in the PCM ring buffer.
      Diarizer.dgTimeOffset  = Diarizer.pcmSampleOffset;
      Diarizer.pcmSampleRate = audioCtx.sampleRate;
      recRenderUI();
      // Wire audio only after socket is open to avoid dropping early packets.
      workletNode.port.onmessage = (e) => {
        if (Diarizer.ws?.readyState === WebSocket.OPEN) {
          Diarizer.ws.send(diarizerFloat32ToInt16(e.data).buffer);
        }
        // Buffer a copy of the raw PCM for VF-4 voice identification.
        diarizerBufferPcm(e.data);
      };
      source.connect(workletNode);
      // Worklet must be connected to something in the audio graph to keep processing.
      workletNode.connect(audioCtx.createMediaStreamDestination());
      // PERF-02: Run PCM ring-buffer cleanup once per second instead of on every message.
      if (!Diarizer._cleanupInterval) {
        Diarizer._cleanupInterval = setInterval(() => {
          if (!Diarizer.pcmChunks?.length || !Diarizer.pcmSampleRate) return;
          const minOffset = Diarizer.pcmSampleOffset - (PCM_BUFFER_DURATION_SEC * Diarizer.pcmSampleRate);
          while (Diarizer.pcmChunks.length &&
                 Diarizer.pcmChunks[0].offset + Diarizer.pcmChunks[0].data.length <= minOffset) {
            Diarizer.pcmChunks.shift();
          }
        }, 1000);
      }
    };

    ws.onmessage = (e) => diarizerHandleMessage(e.data);

    // ws.onerror always fires immediately before ws.onclose for the same
    // disconnect — we only schedule the reconnect from onclose to avoid
    // double-scheduling. (diarizerScheduleReconnect is also idempotent
    // via its reconnectTimer guard, but this keeps logs cleaner.)
    ws.onclose = (e) => {
      console.warn('[diarizer] WS closed', { code: e.code, reason: e.reason, wasClean: e.wasClean });
      if (!Diarizer.manualStop && Rec.status === 'recording') {
        diarizerScheduleReconnect();
      } else {
        Diarizer.status = 'offline';
        recRenderUI();
      }
    };

    ws.onerror = (e) => {
      console.error('[diarizer] WS error', e);
      // Defer to onclose for reconnect scheduling.
    };
  } finally {
    Diarizer._connecting = false;
  }
}

function diarizerHandleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  // Reset the retry counter only once the connection has been STABLE for a
  // few seconds — Deepgram occasionally sends a Metadata message then 1011-
  // closes when its server-side audio buffer empties, and resetting on every
  // message would let the reconnect storm continue indefinitely.
  if (Diarizer.reconnectAttempts !== 0) {
    if (!Diarizer._stableSince) Diarizer._stableSince = Date.now();
    if (Date.now() - Diarizer._stableSince >= 8000) {
      Diarizer.reconnectAttempts = 0;
      Diarizer._stableSince = 0;
    }
  }

  if (msg.type === 'Results') {
    const alt = msg.channel?.alternatives?.[0];
    if (!alt) return;
    const transcript = String(alt.transcript || '').trim();
    const words = alt.words || [];
    const isFinal = !!msg.is_final;

    if (!transcript) {
      if (isFinal) {
        Rec.liveDeltas.delete('dg_interim');
        recRenderTranscript();
      }
      return;
    }

    if (!isFinal) {
      // Show streaming interim text (no speaker labels yet).
      Rec.liveDeltas.set('dg_interim', transcript);
      recRenderTranscript();
    } else {
      // Final result: extract speaker turns and commit each as a transcript entry.
      Rec.liveDeltas.delete('dg_interim');
      // Also clear any OpenAI interim partials that overlap to avoid duplicate display.
      const keysToDelete = [...Rec.liveDeltas.keys()].filter(k => !k.startsWith('dg'));
      for (const k of keysToDelete) Rec.liveDeltas.delete(k);
      const hasSpeakers = words.length > 0 && words[0].speaker !== null && words[0].speaker !== undefined;
      if (hasSpeakers) {
        const turns = diarizerExtractSpeakerTurns(words);
        for (const turn of turns) {
          recAppendTranscript(turn.text, `dg_${Date.now()}_${turn.speaker}`, turn.speaker);
          // Accumulate the audio time range for this speaker to drive auto-identification.
          if (!Rec.speakerMap.has(turn.speaker)) {
            const speakerWords = words.filter(w => (w.speaker ?? 0) === turn.speaker);
            if (speakerWords.length > 0) {
              diarizerAccumulateSpeakerRange(
                turn.speaker,
                speakerWords[0].start,
                speakerWords[speakerWords.length - 1].end,
              );
            }
          }
        }
      } else {
        recAppendTranscript(transcript, `dg_${Date.now()}`);
      }
    }
  } else if (msg.type === 'UtteranceEnd') {
    Rec.liveDeltas.delete('dg_interim');
    recRenderTranscript();
  } else if (msg.type === 'Error') {
    showToast(`Deepgram: ${msg.message || 'connection error'}`, 'error');
  }
}

function diarizerScheduleReconnect() {
  if (Diarizer.manualStop || Rec.status !== 'recording' || Diarizer.reconnectTimer) return;
  if (Diarizer.reconnectAttempts >= DG_MAX_RETRIES) {
    Diarizer.status = 'error';
    Diarizer.manualStop = true; // stop new reconnect attempts; live transcription via OpenAI continues.
    recRenderUI();
    showToast('Speaker diarization is unavailable — recording will continue without speaker labels. Check DEEPGRAM_API_KEY in environment settings.', 'warn');
    return;
  }
  Diarizer.reconnectAttempts++;
  Diarizer.status = 'reconnecting';
  const delay = DG_RETRY_BASE_MS * (2 ** (Diarizer.reconnectAttempts - 1));
  recRenderUI();
  Diarizer.reconnectTimer = setTimeout(async () => {
    Diarizer.reconnectTimer = null;
    try { await diarizerConnect(); }
    catch { diarizerScheduleReconnect(); }
  }, delay);
}

function diarizerClose(markManual) {
  if (markManual) {
    Diarizer.manualStop = true;
    // Free PCM ring buffer and per-speaker state when the session truly ends.
    Diarizer.pcmChunks       = [];
    Diarizer.pcmSampleOffset = 0;
    Diarizer.speakerRanges   = new Map();
  }
  clearTimeout(Diarizer.reconnectTimer);
  Diarizer.reconnectTimer = null;
  // Send a CloseStream message so Deepgram finalises any pending utterance.
  if (Diarizer.ws && Diarizer.ws.readyState === WebSocket.OPEN) {
    try { Diarizer.ws.send(JSON.stringify({ type: 'CloseStream' })); } catch (_) { /* noop */ }
  }
  try { Diarizer.ws?.close(); } catch (_) { /* noop */ }
  Diarizer.ws = null;
  try { Diarizer.workletNode?.disconnect(); } catch (_) { /* noop */ }
  Diarizer.workletNode = null;
  if (Diarizer.audioCtx && Diarizer.audioCtx.state !== 'closed') {
    const ctxToClose = Diarizer.audioCtx;
    Diarizer.audioCtx = null;
    ctxToClose.close().catch(() => {/* noop */});
  } else {
    Diarizer.audioCtx = null;
  }
  if (Diarizer.workletUrl) {
    URL.revokeObjectURL(Diarizer.workletUrl);
    Diarizer.workletUrl = null;
  }
}

// ── PCM RING BUFFER ────────────────────────────────────────────────
// Add incoming worklet samples to the ring buffer, keeping the last 60 s.
// Cleanup is done on a 1-second interval (started in diarizerConnect) to avoid
// O(n) work on every ~2.67 ms AudioWorklet message (PERF-02).
function diarizerBufferPcm(samples) {
  Diarizer.pcmChunks.push({ offset: Diarizer.pcmSampleOffset, data: samples.slice() });
  Diarizer.pcmSampleOffset += samples.length;
}

// Extract a Float32 slice from the ring buffer for an absolute sample range.
function diarizerExtractPcmRange(startSample, endSample) {
  const needed = endSample - startSample;
  if (needed <= 0) return null;
  const out = new Float32Array(needed);
  for (const chunk of Diarizer.pcmChunks) {
    const cEnd = chunk.offset + chunk.data.length;
    if (cEnd <= startSample || chunk.offset >= endSample) continue;
    const readFrom = Math.max(0, startSample - chunk.offset);
    const readTo   = Math.min(chunk.data.length, endSample - chunk.offset);
    const writeAt  = Math.max(0, chunk.offset - startSample);
    out.set(chunk.data.subarray(readFrom, readTo), writeAt);
  }
  return out;
}

// Record the time range spoken by a Deepgram speaker index (in absolute PCM samples).
// VF-4 reads Diarizer.speakerRanges to extract audio for /api/voice-identify.
function diarizerAccumulateSpeakerRange(speakerIdx, startSec, endSec) {
  if (!Diarizer.pcmSampleRate) return;
  const sr          = Diarizer.pcmSampleRate;
  const startSample = Math.floor(startSec * sr) + Diarizer.dgTimeOffset;
  const endSample   = Math.ceil(endSec   * sr) + Diarizer.dgTimeOffset;
  if (!Diarizer.speakerRanges.has(speakerIdx)) Diarizer.speakerRanges.set(speakerIdx, []);
  Diarizer.speakerRanges.get(speakerIdx).push({ startSample, endSample });
}

// ── VF-4: VOICE FINGERPRINT IDENTIFICATION DURING MEETINGS ───────────

/**
 * Pure helper — given a /api/voice-identify response and a members array,
 * returns { groupKey, idx } of the matching member, or null if no match.
 * Exported so unit tests can exercise it without DOM dependencies.
 */
function shouldAutoTickFromIdentify(identifyResponse, members) {
  if (!identifyResponse || !identifyResponse.match || !identifyResponse.memberName) return null;
  const name = identifyResponse.memberName;
  for (const g of GROUPS) {
    const groupMembers = members.filter(m => m.group === g.key);
    for (let i = 0; i < groupMembers.length; i++) {
      if (groupMembers[i].name === name) return { groupKey: g.key, idx: i };
    }
  }
  return null;
}

// Maximum /api/voice-identify calls per speaker per session. After this many
// failed attempts the speaker is presumed unenrolled and we stop retrying —
// otherwise the network upload + Cloud Run inference flood can starve the
// Deepgram WebSocket of audio (resulting in code 1011 "no audio received"
// closes) on slower connections.
const VOICE_ID_MAX_ATTEMPTS = 5;

/**
 * Debounced trigger: fires voiceIdTriggerForSpeaker with adaptive throttling
 * per speaker, and never concurrently for the same speaker. Called on every
 * transcript event for any unidentified speaker, so once enough audio
 * accumulates the trigger will succeed.
 *
 * Throttle adapts to score history: very low scores (< 0.30, suggesting the
 * speaker is not enrolled) push the next attempt out further so we don't
 * flood the API for unrecognized voices.
 */
function maybeFireVoiceId(speakerIdx) {
  if (Rec.voiceIdServiceDown) return;
  if (Rec.speakerMap.has(speakerIdx)) return;       // manually assigned
  if (Rec.speakerIdentified.has(speakerIdx)) return; // already matched
  if (Rec.voiceIdGaveUp.has(speakerIdx)) return;     // hit retry cap
  if (Rec.voiceIdInFlight.has(speakerIdx)) return;   // request in flight

  const attempts = Rec.voiceIdAttemptCount.get(speakerIdx) || 0;
  if (attempts >= VOICE_ID_MAX_ATTEMPTS) {
    Rec.voiceIdGaveUp.add(speakerIdx);
    console.info(`[voice-id] speaker ${speakerIdx}: gave up after ${attempts} attempts — likely unenrolled. Use the manual dropdown to assign.`);
    return;
  }

  // Adaptive debounce: 4s default, grows to 8s if recent scores are very low.
  const hist  = Rec.voiceIdHistory.get(speakerIdx) || [];
  const recent = hist.slice(-2);
  const allLow = recent.length >= 2 && recent.every(h => h.score < 0.30);
  const debounceMs = allLow ? 8000 : 4000;

  const now  = Date.now();
  const last = Rec.voiceIdLastAttempt.get(speakerIdx) || 0;
  if (now - last < debounceMs) return;
  Rec.voiceIdLastAttempt.set(speakerIdx, now);
  setTimeout(() => voiceIdTriggerForSpeaker(speakerIdx), 0);
}

/**
 * VF-4: extract recent PCM for `speakerIdx` from the diarizer ring buffer,
 * encode as 16 kHz WAV, and call /api/voice-identify. Logs every code path
 * so failures are never silent. Locks via Rec.voiceIdInFlight to prevent
 * concurrent calls. Only sets Rec.speakerIdentified on a positive match —
 * non-matches and insufficient-audio early-exits remain eligible for retry.
 */
async function voiceIdTriggerForSpeaker(speakerIdx) {
  if (Rec.voiceIdInFlight.has(speakerIdx)) return;
  Rec.voiceIdInFlight.add(speakerIdx);

  try {
    const sr            = Diarizer.pcmSampleRate || DEFAULT_PCM_SAMPLE_RATE;
    const targetSamples = Math.round(3.5 * sr);
    const minSamples    = Math.round(1.5 * sr);
    const ranges        = Diarizer.speakerRanges.get(speakerIdx) || [];

    let float32 = null;
    if (ranges.length > 0 && Diarizer.pcmSampleRate) {
      let accumulated = 0;
      const toExtract = [];
      for (let i = ranges.length - 1; i >= 0 && accumulated < targetSamples; i--) {
        toExtract.unshift(ranges[i]);
        accumulated += ranges[i].endSample - ranges[i].startSample;
      }
      const chunks = toExtract
        .map(r => diarizerExtractPcmRange(r.startSample, r.endSample))
        .filter(Boolean);
      if (chunks.length > 0) {
        const totalLen = Math.min(chunks.reduce((a, c) => a + c.length, 0), targetSamples);
        float32 = new Float32Array(totalLen);
        let pos = 0;
        for (const c of chunks) {
          if (pos >= float32.length) break;
          const take = Math.min(c.length, float32.length - pos);
          float32.set(c.subarray(0, take), pos);
          pos += take;
        }
      }
    }

    const haveSamples = float32 ? float32.length : 0;
    if (haveSamples < minSamples) {
      console.info(
        `[voice-id] speaker ${speakerIdx}: deferring — only ${haveSamples}/${minSamples} samples buffered ` +
        `(${ranges.length} ranges, sr=${sr}). Will retry on next utterance.`
      );
      return;
    }

    // Resample to 16 kHz and encode as WAV using Int16 path.
    const resampled = resampleTo16k(float32, Diarizer.pcmSampleRate || DEFAULT_PCM_SAMPLE_RATE);
    const int16     = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, Math.round(resampled[i] * 32767)));
    }
    const wavBuf  = pcm16ToWav(int16, 16000);
    const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });

    const form = new FormData();
    form.append('audio', wavBlob, 'speaker-id.wav');

    const attemptNum = (Rec.voiceIdAttemptCount.get(speakerIdx) || 0) + 1;
    Rec.voiceIdAttemptCount.set(speakerIdx, attemptNum);
    console.info(`[voice-id] speaker ${speakerIdx}: sending ${haveSamples} samples (${(haveSamples/sr).toFixed(2)}s) to /api/voice-identify (attempt ${attemptNum}/${VOICE_ID_MAX_ATTEMPTS})`);

    const res = await fetch(`${API}/voice-identify`, {
      method: 'POST',
      headers: { ...kpscSessionHeader() },
      body: form,
    });

    if (res.status === 503) {
      Rec._voiceIdConsecutive503 = (Rec._voiceIdConsecutive503 || 0) + 1;
      if (Rec._voiceIdConsecutive503 >= 2) {
        Rec.voiceIdServiceDown = true;
        console.warn('[voice-id] service down after 2 consecutive 503s; falling back to manual.');
      } else {
        console.warn(`[voice-id] speaker ${speakerIdx}: 503 from server (${Rec._voiceIdConsecutive503}/2)`);
      }
      return;
    }
    Rec._voiceIdConsecutive503 = 0;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[voice-id] speaker ${speakerIdx}: HTTP ${res.status} — ${body.slice(0, 200)}`);
      return;
    }

    const data = await res.json();
    if (data.error) {
      console.warn(`[voice-id] speaker ${speakerIdx}: server error — ${data.error}`);
      return;
    }

    // Always log the result so we can tune the threshold based on real data.
    console.info(
      `[voice-id] speaker ${speakerIdx} → match=${data.match}` +
      ` score=${typeof data.score === 'number' ? data.score.toFixed(3) : 'n/a'}` +
      ` threshold=${data.threshold ?? 'n/a'}` +
      (data.reason ? ` reason=${data.reason}` : '') +
      (data.memberName ? ` member=${data.memberName}` : '')
    );

    // ── Score smoothing across attempts ────────────────────────────────
    // Record the result, then check if a member has been the top match
    // consistently across multiple recent attempts with a mean score that
    // crosses the threshold. This handles the common case where individual
    // attempts hover at 0.40-0.48 (just below 0.50) due to acoustic noise:
    // requiring consistency keeps false-positives low while letting the
    // identification trigger faster on a coherent signal.
    const HIST_MAX = 3;
    const hist = Rec.voiceIdHistory.get(speakerIdx) || [];
    if (data.memberId && typeof data.score === 'number' && Number.isFinite(data.score)) {
      hist.push({ memberId: data.memberId, memberName: data.memberName, score: data.score });
      while (hist.length > HIST_MAX) hist.shift();
      Rec.voiceIdHistory.set(speakerIdx, hist);
    }
    if (!data.match && hist.length >= 2 && typeof data.threshold === 'number') {
      // Bucket the recent attempts by memberId and find the best mean.
      const byMember = new Map();
      for (const h of hist) {
        if (!byMember.has(h.memberId)) byMember.set(h.memberId, []);
        byMember.get(h.memberId).push(h);
      }
      for (const [, attempts] of byMember) {
        if (attempts.length < 2) continue;  // require consistency
        const mean = attempts.reduce((a, h) => a + h.score, 0) / attempts.length;
        if (mean >= data.threshold) {
          console.info(
            `[voice-id] speaker ${speakerIdx} → SMOOTHED match: ` +
            `mean ${mean.toFixed(3)} across ${attempts.length} attempts (≥${data.threshold})` +
            ` member=${attempts[0].memberName}`
          );
          data.match      = true;
          data.memberId   = attempts[0].memberId;
          data.memberName = attempts[0].memberName;
          data.score      = mean;
          break;
        }
      }
    }

    if (!data.match && typeof data.score === 'number' && data.score >= (data.threshold - 0.10)) {
      // Close-but-no-match: surface a hint so user can re-enroll or check mic.
      showToast(
        `🎙 Voice nearly matched (score ${data.score.toFixed(2)} vs threshold ${data.threshold}) — re-enrolling in better audio conditions may help.`,
        'warn'
      );
    }

    if (data.match && data.memberName) {
      if (Rec.speakerMap.has(speakerIdx)) return; // assigned manually while we waited
      Rec.speakerIdentified.add(speakerIdx); // lock in the match — no more retries
      assignSpeaker(speakerIdx, data.memberName);

      // Add voice-id badge to the speaker row in the UI.
      const panel = document.getElementById('kpsc-speaker-map');
      if (panel) {
        const rows = panel.querySelectorAll('.k-spk-row');
        const indices = [...Rec.seenSpeakers].sort((a, b) => a - b);
        const rowIdx = indices.indexOf(speakerIdx);
        if (rowIdx >= 0 && rows[rowIdx]) {
          const existing = rows[rowIdx].querySelector('.k-spk-voice-badge');
          if (!existing) {
            const badge = document.createElement('span');
            badge.className = 'k-spk-voice-badge';
            badge.title = `Voice-identified (score ${data.score?.toFixed(2) ?? '?'})`;
            badge.textContent = `🎙 voice-id'd (${data.score?.toFixed(2) ?? '?'})`;
            rows[rowIdx].appendChild(badge);
          }
        }
      }

      // C2: B3 integration — auto-tick attendance for this member.
      const target = shouldAutoTickFromIdentify(data, S.members);
      if (target) {
        autoTickMember(target.groupKey, target.idx);
      }

      showToast(`🎙 Voice-identified: ${data.memberName} (${(data.score * 100).toFixed(0)}% match)`, 'success');
    }
    // Non-matches and close-misses leave Rec.speakerIdentified empty so a
    // later, cleaner utterance can retry. The 4s debounce prevents API spam.
  } catch (e) {
    console.warn(`[voice-id] speaker ${speakerIdx}: unexpected error —`, e);
  } finally {
    Rec.voiceIdInFlight.delete(speakerIdx);
  }
}


function kpscSessionHeader() {
  const user = S.user;
  if (!user?.sessionToken) return {};
  return { 'X-KPSC-Session': JSON.stringify({ accountId: user.id, token: user.sessionToken }) };
}

function isKpscSessionErrorMessage(errorMessage) {
  return KPSC_SESSION_ERRORS.has(String(errorMessage || ''));
}

function handleKpscAuthFailure(data) {
  if (!isKpscSessionErrorMessage(data?.error)) return;
  if (!S.user?.sessionToken || S._authRecoveryInProgress) return;
  S._authRecoveryInProgress = true;
  try {
    showToast('KPSC session expired. Please sign in again.', 'warn');
    logout();
  } finally {
    S._authRecoveryInProgress = false;
  }
}

async function apiGet(path) {
  const r = await fetch(`${API}/${path}`, { headers: { ...kpscSessionHeader() } });
  const data = await r.json();
  handleKpscAuthFailure(data);
  return data;
}

async function apiPost(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  handleKpscAuthFailure(data);
  return data;
}

async function apiPut(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  handleKpscAuthFailure(data);
  return data;
}

async function apiDelete(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json();
  handleKpscAuthFailure(data);
  return data;
}

async function apiPatch(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  handleKpscAuthFailure(data);
  return data;
}

function roleLabel(role) {
  const map = {
    acting_chairman: 'Acting Chairman',
    general_secretary: 'General Secretary',
    financial_secretary: 'Financial Secretary',
    treasurer: 'Treasurer',
    committee_viewer: 'Committee Viewer',
    it_admin: 'IT Administrator',
  };
  return map[String(role || '').toLowerCase()] || 'Committee Viewer';
}

function effectiveRolePermissions() {
  return S.rolePermissions || KPSC_PERMISSIONS;
}

function canAccess(page) {
  // Group-level navigation names are always accessible (groups are always shown).
  if (['home', 'meetings', 'money', 'more'].includes(page)) return true;
  // notification_log is accessible to anyone who can access agenda_builder
  if (page === 'notification_log') return canAccess('agenda_builder');
  // sms_logs is accessible to anyone who can access the reminders workflow
  if (page === 'sms_logs') return canAccess('reminders');
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const perms = effectiveRolePermissions();
  // Use saved permissions for this role if available; fall back to hardcoded defaults.
  // This ensures any page key added after a role-permissions save still works.
  const saved   = perms[role];
  const allowed = (Array.isArray(saved) && saved.length > 0)
    ? saved
    : (KPSC_PERMISSIONS[role] || KPSC_PERMISSIONS.committee_viewer);
  // If the page is in KPSC_PERMISSIONS for this role but was omitted from an older
  // saved snapshot (e.g. partner-progress before it was added to PERM_PAGES),
  // fall back to the hardcoded default so the tab is never silently hidden.
  if (!allowed.includes(page)) {
    const defaultAllowed = KPSC_PERMISSIONS[role] || KPSC_PERMISSIONS.committee_viewer;
    return defaultAllowed.includes(page);
  }
  return true;
}

function canWrite(page) {
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const savedWrite = S.writePermissions?.[role];
  const allowed = Array.isArray(savedWrite) ? savedWrite : (KPSC_WRITE_PERMISSIONS[role] || []);
  return allowed.includes(page);
}

function canDelete(page) {
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const savedDelete = S.deletePermissions?.[role];
  const allowed = Array.isArray(savedDelete) ? savedDelete : (KPSC_DELETE_PERMISSIONS[role] || []);
  return allowed.includes(page);
}

function canManagePartners() {
  return ['acting_chairman', 'general_secretary', 'financial_secretary', 'treasurer', 'it_admin'].includes(String(S.user?.role || '').toLowerCase());
}

function canManageFinance() {
  return ['acting_chairman', 'financial_secretary', 'treasurer', 'it_admin'].includes(String(S.user?.role || '').toLowerCase());
}

function canDeleteFinanceEntries() {
  return ['acting_chairman', 'it_admin'].includes(String(S.user?.role || '').toLowerCase());
}

function applyNavPermissions() {
  // All 4 top-level groups are visible to every role.
  // Individual sub-tabs are hidden per-role when the group page renders.
  // (No top-level nav items need to be hidden — the groups are always present.)
  // Show the search toggle once logged in.
  const toggle = document.getElementById('kpsc-search-toggle');
  if (toggle) toggle.style.display = '';
}

function defaultPageForRole() {
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const perms = effectiveRolePermissions();
  const allowed = perms[role] || KPSC_PERMISSIONS.committee_viewer;
  return allowed[0] || 'dashboard';
}

// ── SESSION ───────────────────────────────────────────────────────
function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function loadMeetingUiStateMap() {
  try {
    const raw = sessionStorage.getItem(MEETING_UI_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveMeetingUiStateMap(map) {
  sessionStorage.setItem(MEETING_UI_STATE_KEY, JSON.stringify(map || {}));
}

function activeMeetingUiKey() {
  return String(S.activeMeeting?.id || Draft.pendingId || '').trim();
}

function persistMeetingUiState() {
  const key = activeMeetingUiKey();
  if (!key) return;
  const map = loadMeetingUiStateMap();
  map[key] = {
    meetingTab: S._meetingTab || 'record',
    reviewEditMode: !!S._reviewEditMode,
  };
  saveMeetingUiStateMap(map);
}

function restoreMeetingUiState(key, fallback = {}) {
  const cleanKey = String(key || '').trim();
  const saved = cleanKey ? loadMeetingUiStateMap()[cleanKey] : null;
  S._meetingTab = saved?.meetingTab || fallback.meetingTab || 'record';
  S._reviewEditMode = typeof saved?.reviewEditMode === 'boolean'
    ? saved.reviewEditMode
    : !!fallback.reviewEditMode;
}

function clearMeetingUiState(key) {
  const cleanKey = String(key || '').trim();
  if (!cleanKey) return;
  const map = loadMeetingUiStateMap();
  delete map[cleanKey];
  saveMeetingUiStateMap(map);
}

// ── TOAST ─────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let el = document.getElementById('kpsc-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kpsc-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `kpsc-toast kpsc-toast-${type} kpsc-toast-show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('kpsc-toast-show'), 3200);
}

// ── RENDER HELPERS ────────────────────────────────────────────────
function statusBadge(status) {
  const c = STATUS_CONFIG[status] || { label: status, cls: 'badge-gray' };
  return `<span class="kbadge ${c.cls}">${c.label}</span>`;
}

function typeBadge(type) {
  return `<span class="kbadge badge-type">${type || 'routine'}</span>`;
}

function stepper(status) {
  const steps = ['draft', 'recording', 'ended', 'processed'];
  const cur = steps.indexOf(status);
  return `<div class="k-stepper">${steps.map((s, i) => {
    const done   = i < cur;
    const active = i === cur;
    const cls    = done ? 'k-step done' : active ? 'k-step active' : 'k-step';
    const dot    = done ? '✓' : String(i + 1);
    const line   = i < steps.length - 1
      ? `<div class="k-step-line${done ? ' done' : ''}"></div>` : '';
    return `<div class="${cls}"><div class="k-step-dot">${dot}</div><div class="k-step-label">${STATUS_CONFIG[s].label}</div></div>${line}`;
  }).join('')}</div>`;
}

function updateStepperUI(status) {
  const el = document.getElementById('km-stepper');
  if (el) el.innerHTML = stepper(status);
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })
    + ' ' + d.toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit', hour12:true });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── MEETING PRE-FILL ──────────────────────────────────────────────
// Cadence strings: 'none' | 'weekly:sun..sat' | 'monthly:first-sun..sat'
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function nextMeetingDate(cadence, now) {
  const base = now ? new Date(now) : new Date();
  base.setHours(0, 0, 0, 0);
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (!cadence || cadence === 'none') return isoLocal(base);
  const [kind, spec] = cadence.split(':');
  if (kind === 'weekly') {
    const target = DAY_KEYS.indexOf(spec);
    if (target < 0) return isoLocal(base);
    const offset = (target - base.getDay() + 7) % 7;
    const d = new Date(base); d.setDate(d.getDate() + offset);
    return isoLocal(d);
  }
  if (kind === 'monthly' && spec?.startsWith('first-')) {
    const target = DAY_KEYS.indexOf(spec.slice(6));
    if (target < 0) return isoLocal(base);
    const firstInMonth = (yr, mo) => {
      const d = new Date(yr, mo, 1);
      d.setDate(1 + ((target - d.getDay() + 7) % 7));
      return d;
    };
    let candidate = firstInMonth(base.getFullYear(), base.getMonth());
    if (candidate < base) candidate = firstInMonth(base.getFullYear(), base.getMonth() + 1);
    return isoLocal(candidate);
  }
  return isoLocal(base);
}

function prefilledMeetingTitle(_cadence, dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  if (isNaN(d.getTime())) return 'KPSC Meeting';
  const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `KPSC Meeting – ${dayName} ${month} ${d.getDate()}`;
}

// ── MINUTES HTML ──────────────────────────────────────────────────
function minutesHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let inUl = false;
  let inOl = false;

  function applyInline(escaped) {
    // Links: [text](https://...) only — block javascript: URIs
    escaped = escaped.replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold: **text**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic: _text_ or *text*
    escaped = escaped.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    escaped = escaped.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');
    return escaped;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      const level = line.match(/^(#+)/)[1].length;
      out.push(`<h${level}>${applyInline(esc(line.replace(/^#+\s*/, '')))}</h${level}>`);
    } else if (/^[-*]\s/.test(line)) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${applyInline(esc(line.replace(/^[-*]\s*/, '')))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${applyInline(esc(line.replace(/^\d+\.\s*/, '')))}</li>`);
    } else if (/^>\s/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      out.push(`<blockquote>${applyInline(esc(line.replace(/^>\s*/, '')))}</blockquote>`);
    } else if (line === '') {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      out.push('');
    } else {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      out.push(`<p>${applyInline(esc(line))}</p>`);
    }
  }
  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');
  return out.join('\n');
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── PCM AUDIO HELPERS ────────────────────────────────────────────
// Linearly resample a Float32 PCM array from `fromRate` to 16 kHz.
// 16 kHz is the required input rate for the SpeechBrain ECAPA-TDNN model.
// Linear interpolation is sufficient for speaker identification — the model
// is robust to minor resampling artefacts, and higher-quality algorithms
// (e.g. polyphase filters) are not worth the added complexity here.
function resampleTo16k(float32, fromRate) {
  const toRate = 16000;
  if (fromRate === toRate) return float32;
  const ratio  = fromRate / toRate;
  const outLen = Math.round(float32.length / ratio);
  const out    = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos  = i * ratio;
    const lo   = Math.floor(pos);
    const hi   = Math.min(lo + 1, float32.length - 1);
    const frac = pos - lo; // interpolation weight towards the next sample
    out[i] = float32[lo] * (1 - frac) + float32[hi] * frac;
  }
  return out;
}

// Build a standard WAV (PCM 16-bit mono) ArrayBuffer from Float32 samples.
function pcmToWav(float32, sampleRate) {
  const int16   = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
  }
  const dataLen = int16.length * 2;
  const buf     = new ArrayBuffer(44 + dataLen);
  const view    = new DataView(buf);
  // RIFF header
  'RIFF'.split('').forEach((c, i) => view.setUint8(i,      c.charCodeAt(0)));
  view.setUint32(4,  36 + dataLen, true);
  'WAVE'.split('').forEach((c, i) => view.setUint8(8  + i, c.charCodeAt(0)));
  // fmt  chunk
  'fmt '.split('').forEach((c, i) => view.setUint8(12 + i, c.charCodeAt(0)));
  view.setUint32(16, 16,              true); // chunk size
  view.setUint16(20,  1,              true); // PCM
  view.setUint16(22,  1,              true); // mono
  view.setUint32(24, sampleRate,      true);
  view.setUint32(28, sampleRate * 2,  true); // byte rate
  view.setUint16(32,  2,              true); // block align
  view.setUint16(34, 16,              true); // bits per sample
  // data chunk
  'data'.split('').forEach((c, i) => view.setUint8(36 + i, c.charCodeAt(0)));
  view.setUint32(40, dataLen, true);
  new Int16Array(buf, 44).set(int16);
  return buf;
}

/**
 * Build a standard WAV (PCM 16-bit mono) ArrayBuffer from an Int16Array.
 * This is the counterpart of pcmToWav but accepts int16 input directly,
 * so callers that already have int16 samples (e.g. from diarizerFloat32ToInt16)
 * don't need to convert back to Float32.
 */
function pcm16ToWav(int16, sampleRate) {
  const dataLen = int16.length * 2;
  const buf     = new ArrayBuffer(44 + dataLen);
  const view    = new DataView(buf);
  // RIFF header
  'RIFF'.split('').forEach((c, i) => view.setUint8(i,      c.charCodeAt(0)));
  view.setUint32(4,  36 + dataLen, true);
  'WAVE'.split('').forEach((c, i) => view.setUint8(8  + i, c.charCodeAt(0)));
  // fmt  chunk
  'fmt '.split('').forEach((c, i) => view.setUint8(12 + i, c.charCodeAt(0)));
  view.setUint32(16, 16,              true); // chunk size
  view.setUint16(20,  1,              true); // PCM
  view.setUint16(22,  1,              true); // mono
  view.setUint32(24, sampleRate,      true);
  view.setUint32(28, sampleRate * 2,  true); // byte rate
  view.setUint16(32,  2,              true); // block align
  view.setUint16(34, 16,              true); // bits per sample
  // data chunk
  'data'.split('').forEach((c, i) => view.setUint8(36 + i, c.charCodeAt(0)));
  view.setUint32(40, dataLen, true);
  new Int16Array(buf, 44).set(int16);
  return buf;
}

// Convert an ArrayBuffer to a base64 string (handles large buffers safely).
// Chunks are collected into an array and joined once to avoid O(n²) string copies.
function arrayBufferToBase64(buffer) {
  const bytes  = new Uint8Array(buffer);
  const parts  = [];
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    // Spread each fixed-size chunk to avoid exceeding the call-stack limit.
    parts.push(String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE)));
  }
  return btoa(parts.join(''));
}


async function loadLoginOptions() {
  const select = document.getElementById('kpsc-account-select');
  if (!select) return;
  select.innerHTML = '<option value="">Loading members…</option>';
  try {
    const res = await apiGet('kpsc-login-options');
    if (res?.error) throw new Error(res.error);
    S.accounts = Array.isArray(res) ? res : [];
    if (!S.accounts.length) {
      select.innerHTML = '<option value="">No active committee members</option>';
      return;
    }
    select.innerHTML = [
      '<option value="">— Select your name —</option>',
      ...S.accounts.map(acct => `<option value="${esc(acct.id)}">${esc(acct.name)} — ${esc(roleLabel(acct.role))}</option>`),
    ].join('');
  } catch {
    select.innerHTML = '<option value="">Could not load committee members</option>';
  }
}

function showPinChangeModal() {
  document.getElementById('kpsc-pin-change-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'kpsc-pin-change-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Change Default PIN</span>
      </div>
      <div class="k-modal-body">
        <p class="k-hint" style="margin-bottom:12px">For security, set a new PIN before entering the portal.</p>
        <label class="k-label">Current PIN</label>
        <input id="kpc-current-pin" class="k-input" type="password" maxlength="6" inputmode="numeric" />
        <label class="k-label">New PIN</label>
        <input id="kpc-new-pin" class="k-input" type="password" maxlength="6" inputmode="numeric" />
        <label class="k-label">Confirm New PIN</label>
        <input id="kpc-confirm-pin" class="k-input" type="password" maxlength="6" inputmode="numeric" />
        <div id="kpc-pin-msg" class="k-settings-msg" style="display:none"></div>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-primary" onclick="Kpsc.submitPinChange(this)">Save PIN</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function submitPinChange(btn) {
  const msg = document.getElementById('kpc-pin-msg');
  const currentPin = document.getElementById('kpc-current-pin')?.value.trim() || '';
  const newPin = document.getElementById('kpc-new-pin')?.value.trim() || '';
  const confirmPin = document.getElementById('kpc-confirm-pin')?.value.trim() || '';
  if (!currentPin || !newPin || !confirmPin) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = 'All fields are required.';
    msg.style.display = 'block';
    return;
  }
  if (!PIN_REGEX.test(currentPin)) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = 'Current PIN must be 4-6 digits.';
    msg.style.display = 'block';
    return;
  }
  if (!PIN_REGEX.test(newPin)) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = 'New PIN must be 4-6 digits.';
    msg.style.display = 'block';
    return;
  }
  if (newPin !== confirmPin) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = 'PIN confirmation does not match.';
    msg.style.display = 'block';
    return;
  }
  btn.disabled = true;
  const res = await apiPost('kpsc-change-pin', { accountId: S.user?.id, currentPin, newPin });
  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
    msg.style.display = 'block';
    btn.disabled = false;
    return;
  }
  S.user.mustChangePin = false;
  saveSession(S.user);
  document.getElementById('kpsc-pin-change-modal')?.remove();
  enterApp();
}

async function login(btn) {
  const accountId = document.getElementById('kpsc-account-select')?.value.trim() || '';
  const pin  = document.getElementById('kpsc-pin-input')?.value.trim() || '';
  const errEl = document.getElementById('kpsc-login-error');

  if (!accountId || !pin) {
    errEl.textContent = 'Please select your name and enter your PIN.';
    errEl.style.display = 'block';
    return;
  }
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  errEl.style.display = 'none';

  try {
    const res = await apiPost('kpsc-login', { accountId, pin });
    if (res.error) {
      errEl.textContent = res.error === 'Invalid credentials'
        ? 'Selected name or PIN is incorrect. Please try again.'
        : res.error;
      errEl.style.display = 'block';
    } else {
      // res includes sessionToken from the server; persist it in the session
      S.user = res;
      saveSession(res);
      if (S.user.mustChangePin) {
        showPinChangeModal();
      } else {
        enterApp();
      }
    }
  } catch {
    errEl.textContent = 'Unable to connect. Check your connection and try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function logout() {
  recStop();
  closeSearch();
  // Fire-and-forget server-side session deletion; don't await so UI is instant
  const sessionToken = S.user?.sessionToken;
  if (sessionToken) {
    apiPost('kpsc-logout', { sessionToken }).catch(() => {});
  }
  clearSession();
  S.user = null;
  S.page = 'dashboard';
  S.group = 'home';
  S.subTab = null;
  S.activeMeeting = null;
  document.getElementById('kpsc-app').style.display = 'none';
  document.getElementById('kpsc-login-screen').style.display = '';
  const searchToggle = document.getElementById('kpsc-search-toggle');
  if (searchToggle) searchToggle.style.display = 'none';
  if (document.getElementById('kpsc-account-select')) document.getElementById('kpsc-account-select').value = '';
  document.getElementById('kpsc-pin-input').value = '';
  document.getElementById('kpsc-pin-change-modal')?.remove();
  loadLoginOptions();
}

async function enterApp() {
  document.getElementById('kpsc-login-screen').style.display = 'none';
  document.getElementById('kpsc-app').style.display = '';
  const userLabel = `${S.user.name} (${roleLabel(S.user.role)})`;
  const userNameEl = document.getElementById('kpsc-user-name');
  userNameEl.textContent = userLabel;
  userNameEl.title = userLabel;
  // Load role permissions from DB so canAccess() uses current settings
  try {
    const settingsRes = await apiGet('settings');
    const saved = settingsRes?.kpsc_role_permissions;
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      S.rolePermissions = saved;
    }
  } catch { /* fall back to hardcoded KPSC_PERMISSIONS */ }
  applyNavPermissions();
  S._navStack = [];
  const hashPage = window.location.hash.replace('#', '');
  // hashPage might be an old page name (e.g. 'archive', 'partners') — canAccess handles those.
  const startPage = hashPage && (canAccess(hashPage) || PAGE_TO_GROUP[hashPage]) ? hashPage : defaultPageForRole();
  navigate(startPage, { replace: true });
}

// ── NAVIGATION ────────────────────────────────────────────────────
const NAV_STACK_MAX = 10;

function navigate(page, opts) {
  const replace = !!(opts && opts.replace);

  // If a group name is passed, resolve it to its default page.
  if (PAGE_TO_GROUP[page] === undefined && GROUP_DEFAULT_PAGE[page] !== undefined) {
    const defaultPage = GROUP_DEFAULT_PAGE[page];
    if (defaultPage === null) {
      // 'more' group — treat 'more' as the page itself.
      page = 'more';
    } else {
      page = defaultPage;
    }
  }

  if (!canAccess(page)) {
    showToast('You do not have access to that section.', 'warn');
    page = defaultPageForRole();
  }

  // Resolve group and subTab from the page name.
  const mapping = PAGE_TO_GROUP[page] || { group: 'home', subTab: null };
  S.group  = mapping.group;
  S.subTab = mapping.subTab;

  // Maintain a navigation stack for goBack()
  if (!S._navStack) S._navStack = [];
  if (!replace) {
    const top = S._navStack[S._navStack.length - 1];
    if (top !== page) {
      S._navStack.push(page);
      if (S._navStack.length > NAV_STACK_MAX) S._navStack.shift();
    }
  }
  S._partnerDetailId = null;
  S._partnerDetailYear = null;
  // Flush in-memory transcript before the meeting-room DOM unmounts.
  // Previously this only fired during live recording, but AI flows
  // (audio upload transcription, OCR, diarization) update the textarea
  // programmatically, and those updates need to be pushed too.
  if (document.getElementById('km-transcript')) {
    // Snapshot to local buffer first so even a failed network save
    // survives the navigation, then kick off the server PUT/POST.
    saveTranscriptBuffer();
    try { autoSaveNow(); } catch (_) { /* noop */ }
  }
  if (Rec.status === 'recording' || Rec.status === 'paused') {
    if (!confirm('You are currently recording. Leaving will stop the recording. Continue?')) return;
  }
  recStop();
  Rec.status = 'idle';
  S.page = page;
  const hash = '#' + page;
  if (window.location.hash !== hash) history.pushState({ page }, '', hash);
  S.activeMeeting = null;

  // Highlight the correct group tab in the bottom nav.
  document.querySelectorAll('.ka-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.group === S.group);
  });

  document.getElementById('kpsc-back-btn').style.display = 'none';
  const titles = {
    dashboard: 'Home',
    projects: 'Projects',
    action_items: 'Action Items',
    agenda_builder: 'Agenda Builder',
    notification_log: 'Notification Log',
    partners: 'Partners',
    finance: 'Finance',
    reminders: 'Reminders',
    members: 'Members',
    archive: 'Meeting Archive',
    reports: 'Meeting Insights',
    settings: 'Settings',
    more: 'More',
    meeting: 'Meeting Room',
    partnerDetail: 'Partner History',
  };
  document.getElementById('kpsc-page-title').textContent = titles[page] || 'KPSC';
  updateFab();
  renderPage(page);
}

// ── FAB ────────────────────────────────────────────────────────────
function updateFab() {
  const fab = document.getElementById('ka-fab');
  if (!fab) return;
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const { group, subTab, page } = S;

  let label = null;

  if (page === 'dashboard' && group === 'home') {
    // Who can start a new meeting from home is governed by the Archive "Edit"
    // permission in Settings → Role Permissions, so admins can customise it.
    if (canWrite('archive')) {
      label = '+ New Meeting';
    }
  } else if (group === 'meetings') {
    if (subTab === 'archive' || subTab === null) {
      if (canWrite('archive')) label = '+ New Meeting';
    } else if (subTab === 'projects') {
      if (role !== 'committee_viewer') label = '+ New Project';
    }
    // archive, reports sub-tabs: no FAB
  } else if (group === 'money') {
    if (subTab === 'finance') {
      if (role === 'acting_chairman' || role === 'financial_secretary' || role === 'treasurer') label = '+ Finance Entry';
    } else if (subTab === 'partners') {
      if (role !== 'committee_viewer') label = '+ Add Partner';
    } else if (subTab === 'reminders') {
      if (canAccess('reminders')) label = '+ Send Reminders';
    }
  }
  // On meeting sub-pages or 'more', no FAB

  if (label) {
    fab.textContent = label;
    fab.style.display = '';
  } else {
    fab.style.display = 'none';
  }
}

function fabAction() {
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const { group, subTab, page } = S;

  if (page === 'dashboard' && group === 'home') {
    startNewMeeting();
  } else if (group === 'meetings') {
    if (subTab === 'archive' || subTab === null) {
      startNewMeeting();
    } else if (subTab === 'projects') {
      openProjectModal();
    }
  } else if (group === 'money') {
    if (subTab === 'finance') {
      openFinanceModal();
    } else if (subTab === 'partners') {
      addPartner();
    } else if (subTab === 'reminders') {
      // Pass the FAB itself as the button so it can be disabled during the request.
      const fab = document.getElementById('ka-fab');
      if (fab) runRemindersNow(fab);
    }
  }
}

// ── SUB-TAB STRIPS ─────────────────────────────────────────────────

function meetingsSubTabStrip() {
  const cur = S.subTab || 'archive';
  const allItems = buildActionItems(S.meetings, S.actionItems);
  const overdueCount = allItems.filter(e => e.isOverdue).length;
  const overdueIndicator = overdueCount ? ` <span class="k-ai-tab-badge">${overdueCount}</span>` : '';
  const tabs = [
    { key: 'archive',        label: 'Archive' },
    { key: 'reports',        label: 'Insights' },
    { key: 'projects',       label: 'Projects' },
    { key: 'action_items',   label: `Action Items${overdueIndicator}` },
  ];
  if (canAccess('agenda_builder')) {
    tabs.push({ key: 'agenda_builder', label: '📋 Agenda Builder' });
  }
  return `<div class="ka-subtabs">${tabs.map(t =>
    `<button class="ka-subtab${cur === t.key ? ' active' : ''}" onclick="Kpsc.navigate('${t.key}')">${t.label}</button>`
  ).join('')}</div>`;
}

function moneySubTabStrip() {
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const cur = S.subTab || 'partners';
  const tabs = [];
  if (canAccess('finance')) tabs.push({ key: 'finance',   label: 'Finance'   });
  tabs.push({ key: 'partners',  label: 'Partners'  });
  if (canAccess('partner-progress')) tabs.push({ key: 'partner-progress', label: 'Progress' });
  if (canAccess('sms_logs'))  tabs.push({ key: 'sms_logs',  label: 'SMS Logs' });
  if (canAccess('reminders')) tabs.push({ key: 'reminders', label: 'Reminders' });
  return `<div class="ka-subtabs">${tabs.map(t =>
    `<button class="ka-subtab${cur === t.key ? ' active' : ''}" onclick="Kpsc.navigate('${t.key}')">${t.label}</button>`
  ).join('')}</div>`;
}

// Prepend sub-tab strip HTML to a rendered page's main content.
function prependSubTabs(main, stripHtml) {
  const strip = document.createElement('div');
  strip.innerHTML = stripHtml;
  main.insertBefore(strip.firstElementChild, main.firstChild);
}

async function renderPage(page) {
  const main = document.getElementById('kpsc-main');
  main.innerHTML = '<div class="k-loading">Loading…</div>';
  try {
    if (page === 'dashboard') {
      await renderDashboard(main);
    } else if (page === 'archive') {
      await renderArchive(main);
      prependSubTabs(main, meetingsSubTabStrip());
    } else if (page === 'reports') {
      await renderReports(main);
      prependSubTabs(main, meetingsSubTabStrip());
    } else if (page === 'partner-progress') {
      await renderPartnerProgress(main);
      prependSubTabs(main, moneySubTabStrip());
    } else if (page === 'projects') {
      await renderProjects(main);
      prependSubTabs(main, meetingsSubTabStrip());
    } else if (page === 'action_items') {
      await renderActionItems(main);
      prependSubTabs(main, meetingsSubTabStrip());
    } else if (page === 'agenda_builder') {
      await renderAgendaBuilder(main);
      prependSubTabs(main, meetingsSubTabStrip());
    } else if (page === 'notification_log') {
      await renderNotificationLog(main);
      prependSubTabs(main, meetingsSubTabStrip());
      document.getElementById('kpsc-back-btn').style.display = '';
      document.getElementById('kpsc-back-btn').onclick = () => navigate('agenda_builder');
    } else if (page === 'finance') {
      await renderFinance(main);
      prependSubTabs(main, moneySubTabStrip());
      bgCheckLowBalance(main); // background — doesn't block render
    } else if (page === 'partners') {
      await renderPartners(main);
      prependSubTabs(main, moneySubTabStrip());
      bgCheckLowBalance(main); // background — doesn't block render
    } else if (page === 'reminders') {
      await renderReminders(main);
      prependSubTabs(main, moneySubTabStrip());
    } else if (page === 'sms_logs') {
      await renderSmsLogs(main); // sets S.termiiWalletCache from wallet API response
      prependSubTabs(main, moneySubTabStrip());
      injectLowBalanceNotice(main); // synchronous — cache already fresh
    } else if (page === 'meeting') {
      await renderMeetingRoom(main);
    } else if (page === 'members') {
      await renderMembers(main);
      prependSubTabs(main, moreSubTabStrip());
    } else if (page === 'settings') {
      await renderSettings(main);
      prependSubTabs(main, moreSubTabStrip());
    } else if (page === 'inbox') {
      await renderInbox(main);
      prependSubTabs(main, moreSubTabStrip());
    } else if (page === 'more') {
      renderMoreMenu(main);
    }
  } catch (e) {
    main.innerHTML = `<div class="k-page"><div class="k-error-box">
      <strong>Could not load page</strong><br>${esc(e.message || String(e))}
      <br><br>If this is the first time using the portal, ask the IT Administrator to run the database setup (Admin → Setup in the Finance Portal).
    </div></div>`;
  }
}

function moreSubTabStrip() {
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const cur = S.subTab;
  const tabs = [];
  if (role !== 'committee_viewer') tabs.push({ key: 'members',  label: 'Members'  });
  if (role !== 'committee_viewer') tabs.push({ key: 'settings', label: 'Settings' });
  tabs.push({ key: 'inbox', label: 'Inbox' });
  if (!tabs.length) return '';
  return `<div class="ka-subtabs">${tabs.map(t =>
    `<button class="ka-subtab${cur === t.key ? ' active' : ''}" onclick="Kpsc.navigate('${t.key}')">${t.label}</button>`
  ).join('')}</div>`;
}

function renderMoreMenu(main) {
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const isViewer = role === 'committee_viewer';
  main.innerHTML = `
    <div class="k-page ka-more-menu">
      <h2 style="font-family:'Lora',serif;font-size:20px;color:var(--navy);margin-bottom:20px">More</h2>
      <div class="ka-more-list">
        ${!isViewer ? `
        <button class="ka-more-item" onclick="Kpsc.navigate('members')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Members</span>
          <svg class="ka-more-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="ka-more-item" onclick="Kpsc.navigate('settings')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
          <svg class="ka-more-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>` : ''}
        <button class="ka-more-item" onclick="Kpsc.navigate('inbox')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>
          <span>Inbox</span>
          <svg class="ka-more-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="ka-more-item ka-more-item-danger" onclick="Kpsc.logout()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>Sign Out</span>
        </button>
      </div>
    </div>`;
}

async function renderInbox(main) {
  main.innerHTML = '<div class="k-loading">Loading…</div>';
  const [pledgesRes, feedbackRes] = await Promise.all([
    apiGet('partnership-pledges'),
    apiGet('partnership-feedback'),
  ]);
  const pledges  = pledgesRes?.pledges   || [];
  const feedback = feedbackRes?.feedback || [];
  const fmtN = n => new Intl.NumberFormat('en-NG').format(n);
  S._inboxTab = S._inboxTab || 'pledges';

  const renderPledges = () => pledges.length === 0
    ? `<div class="k-empty" style="padding:32px 0;text-align:center;font-style:italic">No pledge intents yet. They appear when visitors submit via the partnership page.</div>`
    : pledges.map(p => `
        <div class="k-meeting-card" style="margin-bottom:8px;cursor:default">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
            <div>
              <div class="k-mc-title">${esc(p.full_name || 'Anonymous')}</div>
              <div style="font-size:13px;color:var(--text3);margin-top:2px">${esc(p.phone || '')}${p.location ? ' · ' + esc(p.location) : ''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;color:var(--navy);font-size:15px">₦${fmtN(p.amount || 0)}<span style="font-weight:400;font-size:12px;color:var(--text3)">/mo</span></div>
              ${p.public_listing ? `<span style="font-size:11px;color:var(--green);font-weight:600">Public ✓</span>` : '<span style="font-size:11px;color:var(--text3)">Anonymous</span>'}
            </div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">${esc(p.created_at || '')}</div>
        </div>`).join('');

  const renderFeedback = () => feedback.length === 0
    ? `<div class="k-empty" style="padding:32px 0;text-align:center;font-style:italic">No messages yet. They appear when visitors use the Feedback button on the partnership page.</div>`
    : feedback.map(f => `
        <div class="k-meeting-card" style="margin-bottom:8px;cursor:default">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
            <div style="font-weight:600;color:var(--navy)">${esc(f.name || 'Anonymous')}</div>
            ${f.contact ? `<span style="font-size:12px;color:var(--text3)">${esc(f.contact)}</span>` : ''}
          </div>
          <div style="margin-top:8px;font-size:14px;line-height:1.6;color:var(--text)">${esc(f.message || '')}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:8px">${esc(f.created_at || '')}</div>
        </div>`).join('');

  const switchTab = tab => {
    S._inboxTab = tab;
    document.getElementById('inbox-pledges-tab')?.classList.toggle('active', tab === 'pledges');
    document.getElementById('inbox-feedback-tab')?.classList.toggle('active', tab === 'feedback');
    const body = document.getElementById('inbox-tab-body');
    if (body) body.innerHTML = tab === 'pledges' ? renderPledges() : renderFeedback();
  };

  // Cache rendered content for tab switching
  main._inboxRenderPledges  = renderPledges;
  main._inboxRenderFeedback = renderFeedback;

  main.innerHTML = `
    <div class="k-page">
      <h2 style="font-family:'Lora',serif;font-size:20px;color:var(--navy);margin-bottom:4px">Inbox</h2>
      <p style="font-size:13px;color:var(--text3);margin-bottom:16px">Messages and pledge intents received from the public partnership page.</p>
      <div class="k-tabs" style="margin-bottom:16px">
        <button id="inbox-pledges-tab" class="k-tab ${S._inboxTab === 'pledges' ? 'active' : ''}" onclick="Kpsc.setInboxTab('pledges')">
          Pledge Intents <span class="kbadge" style="margin-left:4px;background:var(--navy-light);color:var(--navy)">${pledges.length}</span>
        </button>
        <button id="inbox-feedback-tab" class="k-tab ${S._inboxTab === 'feedback' ? 'active' : ''}" onclick="Kpsc.setInboxTab('feedback')">
          Feedback &amp; Messages <span class="kbadge" style="margin-left:4px;background:var(--navy-light);color:var(--navy)">${feedback.length}</span>
        </button>
      </div>
      <div id="inbox-tab-body">${S._inboxTab === 'pledges' ? renderPledges() : renderFeedback()}</div>
    </div>`;
}

function setInboxTab(tab) {
  S._inboxTab = tab;
  document.getElementById('inbox-pledges-tab')?.classList.toggle('active', tab === 'pledges');
  document.getElementById('inbox-feedback-tab')?.classList.toggle('active', tab === 'feedback');
  const main = document.getElementById('kpsc-main');
  const body = document.getElementById('inbox-tab-body');
  if (body && main) {
    body.innerHTML = tab === 'pledges'
      ? (main._inboxRenderPledges?.() || '')
      : (main._inboxRenderFeedback?.() || '');
  }
}

function goBack() {
  if (!S._navStack) S._navStack = [];
  // Pop the current page off the stack before navigating back
  if (S._navStack[S._navStack.length - 1] === S.page) S._navStack.pop();
  const prev = S._navStack.pop() || 'dashboard';
  navigate(prev, { replace: true });
}

// ── DASHBOARD ─────────────────────────────────────────────────────

// Build a data context object for the dashboard from already-loaded state.
function buildDashboardContext() {
  const thisMonth = today().slice(0, 7);
  const month = currentMonth();
  const year  = currentYear();

  const recent  = [...S.meetings].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 10);
  const total   = S.meetings.length;
  const monthCount = S.meetings.filter(m => (m.meetingDate || '').startsWith(thisMonth)).length;
  const pending = S.meetings.filter(m => m.status === 'ended').length;

  // Most-recent processed meeting
  const processedMeetings = S.meetings.filter(m => m.status === 'processed');
  const latestProcessed   = processedMeetings[0] || null;

  // Recent resolutions (top 6)
  const allResolutions = [];
  for (const m of S.meetings.slice(0, 20)) {
    for (const r of (m.resolutions || [])) {
      allResolutions.push({ ...r, meetingTitle: m.title, meetingDate: m.meetingDate, meetingId: m.id });
    }
  }
  const recentResolutions = allResolutions.slice(0, 6);

  // Action items
  const allActions = [];
  for (const m of S.meetings.slice(0, 20)) {
    for (const a of (m.actionItems || [])) {
      allActions.push({ ...a, meetingTitle: m.title, meetingDate: m.meetingDate });
    }
  }
  const pendingActions = allActions.filter(a => a.status === 'pending' || !a.status).slice(0, 5);

  // Chairman: action items I assigned that are not done
  const myName = S.user?.name || '';
  const myOpenActions = allActions.filter(a =>
    (a.assignedBy === myName) && (a.status !== 'done')
  );

  // Quorum: members with voice enrolled (proxy for "voice" quorum) vs total
  const enrolledCount = S.members.filter(m => m.voice_enrolled_at).length;
  const totalMembers  = S.members.length;

  // Last meeting attendance %
  const lastMeeting = recent[0] || null;
  let lastAttendancePct = null;
  if (lastMeeting?.participants) {
    const present = lastMeeting.participants.filter(p => p.present).length;
    const total2  = lastMeeting.participants.length;
    if (total2 > 0) lastAttendancePct = Math.round((present / total2) * 100);
  }

  // Pending projects (proposed status)
  const proposedProjects = S.projects.filter(p => p.status === 'proposed');
  const inProgressProjects = S.projects.filter(p => p.status === 'in_progress');

  // General secretary: draft needing review
  const needsReview = processedMeetings.find(m => m.minutesMarkdown && !m.reviewedAt) || null;

  // Secretary: drafts pending distribution (processed meetings not in kpsc_distributed_meeting_ids)
  const distributedIds = S._distributedMeetingIds || [];
  const pendingDistribution = processedMeetings.filter(m => !distributedIds.includes(m.id));

  // Finance: this-month entries
  const monthEntries = S.financeEntries.filter(e => (e.date || '').startsWith(thisMonth));
  const incomeThisMonth  = monthEntries.filter(e => e.entryType === 'income').reduce((s, e) => s + Number(e.amount || 0), 0);
  const expenseThisMonth = monthEntries.filter(e => e.entryType === 'expense').reduce((s, e) => s + Number(e.amount || 0), 0);

  // Unreconciled: income entries this month with no reference
  const unreconciledCount = monthEntries.filter(e => !String(e.reference || '').trim()).length;

  // Unpaid partners this month (excludes partners who haven't started yet)
  const activePartners = S.partners.filter(p => p.status === 'active');
  const unpaidThisMonth = activePartners.filter(p => !partnerMonthlyPaid(p.id, month, year) && !isBeforePartnerStart(p, month, year));

  // Partner progress this year: paid months / (active partners * 12)
  let partnerYearPct = 0;
  if (activePartners.length > 0) {
    const totalPossible = activePartners.length * 12;
    const totalPaid = activePartners.reduce((sum, p) => {
      let c = 0;
      for (let m2 = 1; m2 <= 12; m2++) if (partnerMonthlyPaid(p.id, m2, year)) c++;
      return sum + c;
    }, 0);
    partnerYearPct = Math.round((totalPaid / totalPossible) * 100);
  }

  // Recent finance entries (top 5)
  const recentFinance = [...S.financeEntries]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  // B5: pending follow-ups
  const pendingFollowups = Array.isArray(S.followups) ? S.followups.filter(f => f.status === 'pending') : [];

  // B6: upcoming meeting with pre-brief (within next 24h)
  // Compare as timestamps so that datetime-local strings (YYYY-MM-DDTHH:MM, no timezone)
  // are treated as local Date objects rather than being compared lexicographically.
  const now2 = new Date();
  const nowMs = now2.getTime();
  const in24hMs = nowMs + 24 * 60 * 60 * 1000;
  const upcomingBriefMeeting = S.meetings.find(m => {
    if (!m.scheduledFor || !m.preBriefMarkdown) return false;
    const ms = new Date(m.scheduledFor).getTime();
    return !isNaN(ms) && ms >= nowMs && ms <= in24hMs;
  }) || null;

  return {
    recent, total, monthCount, pending,
    latestProcessed, recentResolutions, pendingActions,
    myOpenActions, enrolledCount, totalMembers,
    lastAttendancePct, proposedProjects, inProgressProjects,
    needsReview, pendingDistribution,
    incomeThisMonth, expenseThisMonth,
    unreconciledCount, unpaidThisMonth, activePartners,
    partnerYearPct, recentFinance,
    activeProjects: inProgressProjects.slice(0, 5),
    pendingFollowups,
    upcomingBriefMeeting,
    upcomingMeeting: S._upcomingMeeting || null,
    daysSinceLastMeeting: S._daysSinceLastMeeting ?? null,
  };
}

// Returns HTML for the "Open / Resume meeting" primary action card.
function dashCardOpenMeeting(ctx) {
  const draft = [...S.meetings].find(m => m.status === 'draft' || m.status === 'recording');
  const showDelete = draft && canDeleteMeeting(draft);
  if (draft) {
    return `
      <div class="k-meeting-card ka-card-primary" onclick="Kpsc.openMeeting('${draft.id}')">
        <div class="k-mc-top">
          <div style="flex:1">
            <div class="k-mc-title" style="font-size:16px">▶ Resume Draft Meeting</div>
            <div class="k-mc-meta" style="margin-top:6px">
              <span>${esc(draft.title)}</span>
              <span>${esc(fmtDate(draft.meetingDate))}</span>
              ${statusBadge(draft.status)}
            </div>
          </div>
          ${showDelete ? `<button class="k-mc-del" title="Delete meeting" aria-label="Delete meeting" onclick="Kpsc.deleteMeeting('${draft.id}', event)">🗑</button>` : ''}
        </div>
      </div>`;
  }
  return `
    <div class="k-meeting-card ka-card-primary" onclick="Kpsc.startNewMeeting()">
      <div class="k-mc-top">
        <div style="flex:1">
          <div class="k-mc-title" style="font-size:16px">+ Open New Meeting</div>
          <div class="k-mc-meta" style="margin-top:6px"><span>Start a new KPSC meeting session</span></div>
        </div>
      </div>
    </div>`;
}

// Renders a simple stat tile (tappable).
function dashTile({ title, value, sub, badge, onclick, highlight }) {
  const cls = highlight ? 'k-meeting-card k-stat-highlight' : 'k-meeting-card';
  const cursor = onclick ? 'cursor:pointer' : 'cursor:default';
  return `
    <div class="${cls}" style="${cursor}" ${onclick ? `onclick="${onclick}"` : ''}>
      <div class="k-mc-top">
        <div style="flex:1">
          <div class="k-mc-title">${esc(title)}</div>
          <div style="font-size:26px;font-weight:700;color:var(--navy);margin:6px 0 2px;line-height:1.1">${value}</div>
          ${sub ? `<div class="k-mc-meta" style="margin-top:4px"><span>${sub}</span></div>` : ''}
          ${badge ? `<div style="margin-top:6px">${badge}</div>` : ''}
        </div>
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--navy);font-weight:600">View →</div>
    </div>`;
}

// Returns the set of extra dashboard sections (below primary card) for each role.
// ── B5: Follow-up card helpers ─────────────────────────────────────

function daysAgoLabel(dueDateStr) {
  const due = new Date(dueDateStr);
  const now = new Date();
  const diff = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return 'Due today';
  if (diff === 1) return 'Due 1 day ago';
  return `Due ${diff} days ago`;
}

function renderFollowupRow(f) {
  const rowId = `fu-row-${f.id}`;
  return `
    <div class="k-fu-row" id="${rowId}" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
      <div class="k-mc-top" style="margin-bottom:8px">
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">${esc(f.assignee || 'Unassigned')}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">${esc(f.task || '')}</div>
        </div>
        <span class="kbadge badge-red" style="align-self:flex-start">${esc(daysAgoLabel(f.due_date))}</span>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">
        ${esc(f.meeting_title || '')} · ${esc(fmtDate(f.meeting_date || ''))}
      </div>
      <textarea class="k-input k-textarea" id="fu-msg-${f.id}" style="min-height:80px;font-size:13px;margin-bottom:8px">${esc(f.draft_message || '')}</textarea>
      <div class="k-fu-actions" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.approveFollowup('${f.id}')">Approve &amp; copy</button>
        <button class="kbtn kbtn-sm" onclick="Kpsc.saveFollowupEdit('${f.id}')">Save edit</button>
        <button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.skipFollowup('${f.id}')">Skip</button>
      </div>
    </div>`;
}

function dashCardFollowups(ctx) {
  const items = ctx.pendingFollowups || [];
  const count = items.length;
  const open = count > 0 ? 'open' : '';
  return `
    <details class="k-collapsible k-fu-card" ${open} style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <summary class="k-collapsible-hdr" style="padding:14px 16px;background:var(--card);cursor:pointer">
        <span class="k-collapsible-title" style="font-size:15px;font-weight:600">Follow-ups (${count})</span>
        ${count > 0 ? '<span class="kbadge badge-red" style="margin-left:8px">Action needed</span>' : ''}
      </summary>
      <div style="padding:12px 16px 16px">
        ${count === 0
          ? '<p class="k-hint" style="margin:0;text-align:center">No overdue action items — great job!</p>'
          : items.map(renderFollowupRow).join('')}
      </div>
    </details>`;
}

// ── B6: Pre-brief card ─────────────────────────────────────────────

function dashCardPreBrief(ctx) {
  const m = ctx.upcomingBriefMeeting;
  if (!m) return '';
  return `
    <div class="k-meeting-card" style="border-left:4px solid var(--navy);margin-bottom:16px">
      <div class="k-mc-top">
        <div style="flex:1">
          <div class="k-mc-title" style="font-size:15px">Tomorrow's Meeting: ${esc(m.title)}</div>
          <div class="k-mc-meta" style="margin-top:4px">
            <span>${esc(fmtDateTime(m.scheduledFor))}</span>
          </div>
        </div>
      </div>
      <details style="margin-top:10px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--navy)">Read full brief</summary>
        <div style="margin-top:10px;white-space:pre-wrap;font-size:12px;line-height:1.6;color:var(--text1)">${esc(m.preBriefMarkdown)}</div>
      </details>
    </div>`;
}

// ── Upcoming Meeting card (from Agenda Builder) ────────────────
// Shown to ALL roles on the dashboard so every member knows about the next meeting.

function dashCardUpcomingMeeting(ctx) {
  const um = ctx.upcomingMeeting;
  if (!um || !um.meetingDate) return '';

  // Format meeting date
  let dateDisplay = um.meetingDate;
  try {
    const d = new Date(um.meetingDate + 'T12:00:00');
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    dateDisplay = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch { /* use raw */ }

  const timeDisplay = um.meetingTime ? ` · ${um.meetingTime}` : '';
  const venue = um.venue || '';
  const items = Array.isArray(um.agendaItems) ? um.agendaItems : [];
  const title = um.meetingTitle || 'Upcoming KPSC Meeting';

  const role = String(S.user?.role || '').toLowerCase();
  const canBuildAgenda = role === 'acting_chairman' || role === 'general_secretary' || role === 'it_admin';

  return `
    <div class="k-meeting-card" style="border-left:4px solid #25d366;margin-bottom:16px;background:var(--card)">
      <div class="k-mc-top">
        <div style="flex:1">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#25d366;margin-bottom:4px">📅 Next Meeting</div>
          <div class="k-mc-title" style="font-size:15px">${esc(title)}</div>
          <div class="k-mc-meta" style="margin-top:4px">
            <span>${esc(dateDisplay)}${esc(timeDisplay)}</span>
            ${venue ? `<span>📍 ${esc(venue)}</span>` : ''}
          </div>
        </div>
      </div>
      ${items.length ? `
      <details style="margin-top:10px">
        <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--navy)">${items.length} agenda items</summary>
        <ol style="margin:8px 0 0 16px;padding:0;font-size:12px;line-height:1.8;color:var(--text1)">
          ${items.slice(0, 8).map(i => `<li>${esc(typeof i === 'string' ? i : (i.topic || ''))}</li>`).join('')}
          ${items.length > 8 ? `<li style="color:var(--text2)">… and ${items.length - 8} more</li>` : ''}
        </ol>
      </details>` : ''}
      ${canBuildAgenda ? `
      <div style="margin-top:10px">
        <button class="kbtn kbtn-sm" onclick="Kpsc.navigate('agenda_builder')">📋 Edit Agenda</button>
        ${um.linkedMeetingId ? `<button class="kbtn kbtn-sm kbtn-primary" style="margin-left:8px" onclick="Kpsc.openMeeting('${esc(um.linkedMeetingId)}')">▶ Open Meeting Draft</button>` : ''}
      </div>` : ''}
    </div>`;
}

// ── Meeting Frequency Alert card ──────────────────────────────────
// Shown to chairman and general_secretary on the dashboard when no meeting
// has been scheduled for more than 14 days (2 weeks). Gives a gentle nudge.

function dashCardMeetingFrequencyAlert(ctx) {
  const days = ctx.daysSinceLastMeeting;
  // Only show alert if more than 14 days since last meeting and no upcoming meeting is already planned
  if (days === null || days < 0 || days < 14) return '';
  if (ctx.upcomingMeeting?.meetingDate) return ''; // already have something planned

  let weeksText;
  if (days < 21) weeksText = '2 weeks';
  else if (days < 28) weeksText = '3 weeks';
  else if (days < 35) weeksText = '4 weeks';
  else weeksText = `${Math.floor(days / 7)} weeks`;

  return `
    <div class="k-meeting-card" style="border-left:4px solid #d97706;margin-bottom:16px;background:var(--card)">
      <div class="k-mc-top">
        <div style="flex:1">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#d97706;margin-bottom:4px">⏰ Meeting Frequency Alert</div>
          <div style="font-size:14px;font-weight:600;color:var(--text1);line-height:1.4">
            It's been ${esc(weeksText)} since your last KPSC meeting.
          </div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">Would you like to plan the next one?</div>
        </div>
      </div>
      <div style="margin-top:10px">
        <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.navigate('agenda_builder')">📋 Plan Next Meeting</button>
      </div>
    </div>`;
}

function newMonthDraftBanner() {
  const d = S.newmonthDraft;
  if (!d?.draft) return '';
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLabel = d.draftMonth ? (MONTH_NAMES[d.draftMonth - 1] || '') : '';
  const yearLabel  = d.draftYear || '';
  return `
    <div id="nm-draft-banner" class="k-meeting-card" style="background:linear-gradient(135deg,#e8f5e9,#f1f8e9);border-left:4px solid #4caf50;margin-bottom:12px">
      <div class="k-mc-top">
        <div style="flex:1">
          <div class="k-mc-title" style="color:#2e7d32">📝 Happy New Month SMS Drafted — ${monthLabel} ${yearLabel}</div>
          <div style="font-size:12px;color:#555;margin:4px 0">An AI draft has been prepared for the 1st. Review and edit before it auto-sends.</div>
        </div>
        <button class="kbtn kbtn-sm" style="margin-left:8px" onclick="Kpsc.showNewMonthDraftModal()" title="Review draft">Review</button>
        <button class="kbtn kbtn-sm kbtn-ghost" style="margin-left:4px" onclick="Kpsc.dismissNewMonthDraft()" title="Dismiss">✕</button>
      </div>
    </div>`;
}

function dashboardCardsForRole(role, ctx) {
  const r = String(role || 'committee_viewer').toLowerCase();

  // Feature 12: SMS Analytics mini-card (shown on finance & it_admin dashboards)
  const smsAnalyticsCard = S.smsAnalytics ? (() => {
    const a = S.smsAnalytics;
    const low = (a.total > 0) && (a.deliveryRate < 60 || a.dnd > 5);
    return `
      <div class="k-meeting-card" style="cursor:pointer" onclick="Kpsc.navigate('settings')">
        <div class="k-mc-top"><div style="flex:1">
          <div class="k-mc-title">📊 SMS Analytics — ${monthName(a.month)} ${a.year}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 2px">
            <span class="kbadge badge-blue">📤 ${a.total} sent</span>
            <span class="kbadge badge-green">✅ ${a.delivered} delivered (${a.deliveryRate}%)</span>
            ${a.dnd > 0 ? `<span class="kbadge badge-red">🚫 ${a.dnd} DND</span>` : ''}
            ${a.failed > 0 ? `<span class="kbadge badge-amber">❌ ${a.failed} failed</span>` : ''}
          </div>
          ${low ? `<div style="font-size:12px;color:#c00;margin-top:4px">⚠️ Delivery rate low or many DND flags — check SMS settings.</div>` : ''}
        </div></div>
        <div style="margin-top:6px;font-size:12px;color:var(--navy);font-weight:600">View SMS Settings →</div>
      </div>`;
  })() : '';

  if (r === 'acting_chairman') {
    return `
      ${newMonthDraftBanner()}
      ${dashCardPreBrief(ctx)}
      ${dashCardMeetingFrequencyAlert(ctx)}
      ${dashCardUpcomingMeeting(ctx)}
      ${dashCardFollowups(ctx)}
      ${dashCardOpenMeeting(ctx)}
      <div class="k-section-hdr" style="margin-top:20px"><h2>At a Glance</h2></div>
      <div class="k-meeting-list">
        ${smsAnalyticsCard}
        ${dashTile({
          title: 'Action Items I Assigned',
          value: ctx.myOpenActions.length,
          sub: 'open items not yet done',
          onclick: "Kpsc.navigate('archive')",
        })}
        ${dashTile({
          title: 'Quorum Status This Month',
          value: `${ctx.enrolledCount}/${ctx.totalMembers}`,
          sub: ctx.lastAttendancePct !== null
            ? `Last meeting: ${ctx.lastAttendancePct}% attended`
            : 'No meeting attendance yet',
          onclick: "Kpsc.navigate('members')",
        })}
        ${dashTile({
          title: 'Pending Project Decisions',
          value: ctx.proposedProjects.length,
          sub: 'projects proposed, awaiting approval',
          onclick: "Kpsc.navigate('projects')",
          highlight: ctx.proposedProjects.length > 0,
        })}
      </div>
      ${ctx.recentResolutions.length ? `
      <div class="k-section-hdr" style="margin-top:24px">
        <h2>Recent Resolutions</h2>
        <button class="kbtn kbtn-sm" onclick="Kpsc.navigate('archive')">View All</button>
      </div>
      <div class="k-meeting-list">
        ${ctx.recentResolutions.slice(0, 5).map(r2 => `
          <div class="k-meeting-card" style="cursor:default">
            <div class="k-mc-top"><div style="flex:1">
              <div style="font-size:13px;color:var(--text2);line-height:1.5">${esc(r2.text)}</div>
              <div class="k-mc-meta" style="margin-top:4px">
                <span>${esc(r2.meetingTitle)}</span>
                <span>${esc(fmtDate(r2.meetingDate))}</span>
                ${r2.approved === true ? '<span class="kbadge badge-green">Approved</span>' : r2.approved === false ? '<span class="kbadge badge-red">Rejected</span>' : '<span class="kbadge badge-amber">Pending</span>'}
              </div>
            </div></div>
          </div>`).join('')}
      </div>` : ''}`;
  }

  if (r === 'general_secretary') {
    return `
      ${dashCardPreBrief(ctx)}
      ${dashCardMeetingFrequencyAlert(ctx)}
      ${dashCardUpcomingMeeting(ctx)}
      ${dashCardFollowups(ctx)}
      ${dashCardOpenMeeting(ctx)}
      <div class="k-section-hdr" style="margin-top:20px"><h2>At a Glance</h2></div>
      <div class="k-meeting-list">
        ${ctx.needsReview ? dashTile({
          title: 'Last Meeting Needs Review',
          value: esc(ctx.needsReview.title),
          sub: `Processed ${esc(fmtDate(ctx.needsReview.processedAt || ctx.needsReview.meetingDate))} — AI draft not yet reviewed`,
          onclick: `Kpsc.openMeeting('${ctx.needsReview.id}')`,
          highlight: true,
        }) : ''}
        ${dashTile({
          title: 'Drafts Pending Distribution',
          value: ctx.pendingDistribution.length,
          sub: 'processed meetings not yet distributed',
          onclick: "Kpsc.navigate('archive')",
          highlight: ctx.pendingDistribution.length > 0,
        })}
      </div>
      ${ctx.recentResolutions.length ? `
      <div class="k-section-hdr" style="margin-top:24px">
        <h2>Recent Resolutions</h2>
        <button class="kbtn kbtn-sm" onclick="Kpsc.navigate('archive')">View All</button>
      </div>
      <div class="k-meeting-list">
        ${ctx.recentResolutions.slice(0, 5).map(r2 => `
          <div class="k-meeting-card" style="cursor:default">
            <div class="k-mc-top"><div style="flex:1">
              <div style="font-size:13px;color:var(--text2);line-height:1.5">${esc(r2.text)}</div>
              <div class="k-mc-meta" style="margin-top:4px">
                <span>${esc(r2.meetingTitle)}</span>
                <span>${esc(fmtDate(r2.meetingDate))}</span>
                ${r2.approved === true ? '<span class="kbadge badge-green">Approved</span>' : r2.approved === false ? '<span class="kbadge badge-red">Rejected</span>' : '<span class="kbadge badge-amber">Pending</span>'}
              </div>
            </div></div>
          </div>`).join('')}
      </div>` : ''}`;
  }

  if (r === 'financial_secretary' || r === 'treasurer') {
    return `
      ${newMonthDraftBanner()}
      ${dashCardUpcomingMeeting(ctx)}
      <div class="k-section-hdr" style="margin-top:4px"><h2>Finance At a Glance</h2></div>
      <div class="k-meeting-list">
        ${smsAnalyticsCard}
        ${dashTile({
          title: 'Unreconciled Bank Items',
          value: ctx.unreconciledCount,
          sub: 'income entries this month without a reference',
          onclick: "Kpsc.navigate('finance')",
          highlight: ctx.unreconciledCount > 0,
        })}
        ${dashTile({
          title: 'Unpaid Partners This Month',
          value: ctx.unpaidThisMonth.length,
          sub: `of ${ctx.activePartners.length} active partners`,
          onclick: "Kpsc.navigate('reminders')",
          highlight: ctx.unpaidThisMonth.length > 0,
        })}
        <div class="k-meeting-card" style="cursor:pointer" onclick="Kpsc.navigate('finance')">
          <div class="k-mc-top"><div style="flex:1">
            <div class="k-mc-title">This Month P&amp;L</div>
            <div style="margin:6px 0 2px">
              <div style="font-size:20px;font-weight:700;color:var(--green)">₦${ctx.incomeThisMonth.toLocaleString('en-NG')} <span style="font-size:13px;font-weight:500;color:var(--text3)">income</span></div>
              <div style="font-size:20px;font-weight:700;color:var(--red)">₦${ctx.expenseThisMonth.toLocaleString('en-NG')} <span style="font-size:13px;font-weight:500;color:var(--text3)">expense</span></div>
            </div>
            <div class="k-mc-meta" style="margin-top:4px">
              <span style="font-weight:600;color:${ctx.incomeThisMonth - ctx.expenseThisMonth >= 0 ? 'var(--green)' : 'var(--red)'}">
                Net: ₦${Math.abs(ctx.incomeThisMonth - ctx.expenseThisMonth).toLocaleString('en-NG')} ${ctx.incomeThisMonth - ctx.expenseThisMonth >= 0 ? 'surplus' : 'deficit'}
              </span>
            </div>
          </div></div>
          <div style="margin-top:10px;font-size:12px;color:var(--navy);font-weight:600">View →</div>
        </div>
      </div>
      ${ctx.recentFinance.length ? `
      <div class="k-section-hdr" style="margin-top:24px">
        <h2>Recent Finance Entries</h2>
        <button class="kbtn kbtn-sm" onclick="Kpsc.navigate('finance')">View All</button>
      </div>
      <div class="k-meeting-list">
        ${ctx.recentFinance.map(e => `
          <div class="k-meeting-card" style="cursor:default">
            <div class="k-mc-top"><div style="flex:1">
              <div class="k-mc-title">${esc(catLabel(e.category))} — ₦${Number(e.amount || 0).toLocaleString('en-NG')}</div>
              <div class="k-mc-meta" style="margin-top:4px">
                <span>${esc(fmtDate(e.date))}</span>
                <span class="kbadge ${e.entryType === 'income' ? 'badge-green' : 'badge-red'}">${esc(e.entryType)}</span>
                ${e.reference ? `<span>Ref: ${esc(e.reference)}</span>` : ''}
              </div>
            </div></div>
          </div>`).join('')}
      </div>` : ''}`;
  }

  // committee_viewer / it_admin (default)
  return `
    ${newMonthDraftBanner()}
    ${dashCardUpcomingMeeting(ctx)}
    <div class="k-section-hdr" style="margin-top:4px"><h2>Committee Overview</h2></div>
    <div class="k-meeting-list">
      ${ctx.latestProcessed ? `
        <div class="k-meeting-card ka-card-primary" onclick="Kpsc.openMeeting('${ctx.latestProcessed.id}')">
          <div class="k-mc-top"><div style="flex:1">
            <div class="k-mc-title" style="font-size:15px">Latest Minutes</div>
            <div class="k-mc-meta" style="margin-top:6px">
              <span>${esc(ctx.latestProcessed.title)}</span>
              <span>${esc(fmtDate(ctx.latestProcessed.meetingDate))}</span>
            </div>
          </div></div>
          <div style="margin-top:10px;font-size:12px;color:var(--navy);font-weight:600">View →</div>
        </div>` : '<div class="k-empty">No processed minutes yet.</div>'}
      ${dashTile({
        title: 'Projects in Progress',
        value: ctx.inProgressProjects.length,
        sub: ctx.inProgressProjects.slice(0, 3).map(p => esc(p.title)).join(', ') || 'None',
        onclick: "Kpsc.navigate('projects')",
      })}
      ${dashTile({
        title: 'Partner Progress This Year',
        value: `${ctx.partnerYearPct}%`,
        sub: `${ctx.activePartners.length} active partners`,
        onclick: "Kpsc.navigate('partners')",
      })}
    </div>`;
}

async function renderDashboard(main) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const isChairOrSecretary = role === 'acting_chairman' || role === 'general_secretary';

  // Stale-while-revalidate: render from cache immediately, then refresh in background
  if (_dashCache.data && Date.now() - _dashCache.ts < 30000) {
    _applyDashboardData(_dashCache.data, role);
    main.innerHTML = `<div class="k-page">${dashboardCardsForRole(role, buildDashboardContext())}</div>`;
    // Refresh in background without blocking
    _fetchDashboardData(year, month, isChairOrSecretary).then(freshData => {
      _dashCache.data = freshData;
      _dashCache.ts = Date.now();
      _applyDashboardData(freshData, role);
      main.innerHTML = `<div class="k-page">${dashboardCardsForRole(role, buildDashboardContext())}</div>`;
    }).catch(() => { /* background refresh failed — cached view is still shown */ });
    return;
  }

  const freshData = await _fetchDashboardData(year, month, isChairOrSecretary);
  _dashCache.data = freshData;
  _dashCache.ts = Date.now();
  _applyDashboardData(freshData, role);

  main.innerHTML = `
    <div class="k-page">
      ${dashboardCardsForRole(role, buildDashboardContext())}
    </div>`;
}

async function _fetchDashboardData(year, month, isChairOrSecretary) {
  const loadPromises = [
    apiGet('ai-secretary-meetings'),
    apiGet('settings'),
    apiGet(`kpsc-dashboard?year=${year}&month=${month}`),
    apiGet('kpsc-projects'),
    apiGet(`kpsc-finance?year=${year}&month=${month}`),
    apiGet('kpsc-partners'),
    apiGet(`kpsc-partner-payments?year=${year}`),
    apiGet(`kpsc-sms-analytics?year=${year}&month=${month}`).catch(() => null),
    apiGet('kpsc-newmonth-draft').catch(() => null),
  ];
  // B5: only load followups for chairman/secretary
  if (isChairOrSecretary) loadPromises.push(apiGet('kpsc-followups?status=pending'));
  const results = await Promise.all(loadPromises);
  return results;
}

function _applyDashboardData([meetingsRes, settingsRes, dashboardRes, projectsRes, financeRes, partnersRes, paymentsRes, smsAnalyticsRes, newmonthDraftRes, followupsRes]) {
  if (meetingsRes?.error) throw new Error(meetingsRes.error);
  S.meetings        = Array.isArray(meetingsRes)            ? meetingsRes            : [];
  S.members         = Array.isArray(settingsRes?.kpsc_members) ? settingsRes.kpsc_members : [];
  S.dashboard       = dashboardRes?.totals || null;
  S._upcomingMeeting = dashboardRes?.upcomingMeeting || null;
  S._daysSinceLastMeeting = dashboardRes?.daysSinceLastMeeting ?? null;
  S.projects        = Array.isArray(projectsRes)            ? projectsRes            : [];
  S.financeEntries  = Array.isArray(financeRes)             ? financeRes             : [];
  S.partners        = Array.isArray(partnersRes)            ? partnersRes            : [];
  S.partnerPayments = Array.isArray(paymentsRes)            ? paymentsRes            : [];
  S.followups       = Array.isArray(followupsRes)           ? followupsRes           : [];
  S.smsAnalytics    = smsAnalyticsRes && !smsAnalyticsRes.error ? smsAnalyticsRes : null;
  S.newmonthDraft   = newmonthDraftRes && !newmonthDraftRes.error ? newmonthDraftRes : null;

  // Load distributed-meeting-ids from settings (stored as JSON string)
  const rawDistributed = Array.isArray(settingsRes?.kpsc_distributed_meeting_ids)
    ? settingsRes.kpsc_distributed_meeting_ids
    : (Array.isArray(S._distributedMeetingIds) ? S._distributedMeetingIds : []);
  S._distributedMeetingIds = rawDistributed;
}

function isMeetingAuthor(m) {
  return (!!S.user?.id && S.user.id === (m.createdByAccountId || ''))
    || (!m.createdByAccountId && !!S.user?.name && S.user.name === (m.createdBy || ''));
}

function findOtherActiveMeeting(excludeId = '') {
  const skipId = String(excludeId || '').trim();
  return [...S.meetings].find(m => (m.status === 'draft' || m.status === 'recording') && m.id !== skipId) || null;
}

function canDeleteMeeting(m) {
  const role = String(S.user?.role || '').toLowerCase();
  // Administrators (acting chairman, general secretary, IT admin) may delete any meeting.
  if (role === 'acting_chairman' || role === 'general_secretary' || role === 'it_admin') return true;
  // The original author may only delete meetings that are still in draft or recording phase —
  // once a meeting has been ended or processed it is part of the official record.
  if (isMeetingAuthor(m)) {
    return m.status === 'draft' || m.status === 'recording';
  }
  return false;
}

function meetingCard(m) {
  const showDelete = canDeleteMeeting(m);
  // Show a reminder if the meeting has been processed but insights/minutes haven't been reviewed
  const hasUnreviewedMinutes = m.minutesMarkdown && !m.reviewedAt;
  return `
    <div class="k-meeting-card" onclick="Kpsc.openMeeting('${m.id}')">
      <div class="k-mc-top">
        <div class="k-mc-title">${esc(m.title)}</div>
        <div class="k-mc-badges">
          ${typeBadge(m.meetingType)} ${statusBadge(m.status)}
          ${showDelete ? `<button class="k-mc-del" title="Delete meeting" aria-label="Delete meeting" onclick="Kpsc.deleteMeeting('${m.id}', event)">🗑</button>` : ''}
        </div>
      </div>
      <div class="k-mc-meta">
        <span>${fmtDate(m.meetingDate)}</span>
        ${m.resolutions?.length ? `<span>${m.resolutions.length} resolution${m.resolutions.length !== 1 ? 's' : ''}</span>` : ''}
        ${m.actionItems?.length ? `<span>${m.actionItems.length} action item${m.actionItems.length !== 1 ? 's' : ''}</span>` : ''}
      </div>
      ${hasUnreviewedMinutes ? `<div class="k-mc-reminder">⚠️ Review pending — open to review minutes &amp; save insights</div>` : ''}
    </div>`;
}

function startNewMeeting() {
  const existing = findOtherActiveMeeting(S.activeMeeting?.id || '');
  if (existing) {
    const resume = confirm(`Another active meeting already exists: "${existing.title || 'Untitled meeting'}". Open it instead?`);
    if (resume) openMeeting(existing.id);
    else showToast('Resume or discard the existing active meeting before opening another one.', 'warn');
    return;
  }
  S.activeMeeting = null;
  S._isNewMeeting = true;
  // Pre-generate a stable ID for this new-meeting session so all autosave POSTs
  // carry the same ID, making create idempotent against network retries.
  Draft.pendingId = 'AIM-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  restoreMeetingUiState(Draft.pendingId, { meetingTab: 'record', reviewEditMode: false });
  persistMeetingUiState();
  S.page = 'meeting';
  S.group = 'meetings';
  S.subTab = null;
  Rec.status = 'idle';
  document.querySelectorAll('.ka-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.group === 'meetings');
  });
  // Push a history entry so the device back button returns to the meetings list
  history.pushState({ page: 'meeting', meetingId: null }, '', '#meeting');
  document.getElementById('kpsc-page-title').textContent = 'New Meeting';
  updateFab();
  renderPage('meeting');
}

async function openMeeting(id) {
  const res = await apiGet(`ai-secretary-meetings/${id}`);
  if (res.error) { showToast(res.error, 'error'); return; }
  S.activeMeeting = res;
  S._isNewMeeting = false;
  restoreMeetingUiState(res.id, { meetingTab: 'record', reviewEditMode: !res.reviewedAt });
  S.page = 'meeting';
  S.group = 'meetings';
  S.subTab = null;
  Rec.status = 'idle';
  document.querySelectorAll('.ka-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.group === 'meetings');
  });
  // Push a history entry so the device back button returns to the meetings list
  history.pushState({ page: 'meeting', meetingId: id }, '', '#meeting');
  document.getElementById('kpsc-page-title').textContent = 'Meeting Room';
  updateFab();
  renderPage('meeting');
}

// ── MEETING ROOM ──────────────────────────────────────────────────
async function renderMeetingRoom(main) {
  if (!S.members.length) {
    const settingsRes = await apiGet('settings');
    S.members = settingsRes.kpsc_members || [];
    if (settingsRes.kpsc_meeting_cadence) S.kpscMeetingCadence = settingsRes.kpsc_meeting_cadence;
  }

  const m  = S.activeMeeting;
  const id = m?.id || '';
  const status = m?.status || 'draft';
  const isProcessed = status === 'processed';
  const isEnded     = status === 'ended' || isProcessed;
  const isEditable  = !isEnded;
  const canRecord   = !isEnded;
  const phase = isProcessed ? 'review' : status === 'ended' ? 'ended' : status === 'recording' ? 'live' : 'setup';
  // Tabs are hidden for ended/processed meetings; reset to default so stale 'audio' or 'upload'
  // state doesn't leak into the next editable meeting opened in this session.
  if (!isEditable && S._meetingTab !== 'record') {
    S._meetingTab = 'record';
    persistMeetingUiState();
  }

  // Pre-fill defaults for never-saved drafts. Title/date follow the configured cadence;
  // attendance defaults to "everyone present" so secretaries uncheck absentees instead of
  // checking each present member.
  const isFresh = S._isNewMeeting && !m;
  const cadence = S.kpscMeetingCadence || 'none';
  const prefillDate = isFresh ? nextMeetingDate(cadence) : (m?.meetingDate || today());
  const prefillTitle = isFresh ? prefilledMeetingTitle(cadence, prefillDate) : (m?.title || 'KPSC Meeting');
  const prefillType = m?.meetingType || 'routine';

  // Build attendance rows from roster, merged with saved participants.
  const savedParts = m?.participants || [];
  const attendanceRows = buildAttendanceRows(savedParts, isFresh, !isEditable);

  const detailsSummary = `${esc(prefillTitle)} · ${esc(fmtDate(prefillDate))} · ${esc((MEETING_TYPES.find(t=>t.value===prefillType)||{}).label||'')}`;
  const presentInitial = isFresh ? S.members.length : savedParts.filter(p => p.present).length;
  const attendanceSummary = `${presentInitial} present of ${S.members.length}`;

  // B6: pre-meeting brief card (show if brief exists, for all phases)
  const preBriefHtml = (m?.preBriefMarkdown) ? `
    <details class="k-collapsible" id="km-prebrief-section" style="margin-bottom:12px">
      <summary class="k-collapsible-hdr">
        <span class="k-collapsible-title">📋 Pre-Meeting Brief</span>
        <span class="k-collapsible-summary">Generated ${esc(fmtDate((m.preBriefGeneratedAt || '').slice(0, 10)))}</span>
      </summary>
      <div class="k-pre-brief-body" id="km-prebrief-body" style="padding:12px 0;white-space:pre-wrap;font-size:13px;line-height:1.6;color:var(--text1)">${esc(m.preBriefMarkdown)}</div>
     </details>` : '';
  const endedNotice = status === 'ended'
    ? `<div class="k-quick-hint" style="margin-bottom:12px">This meeting has been ended and the room is now read-only. Generate minutes to continue the workflow.</div>`
    : '';

  main.innerHTML = `
    <div class="k-page k-room" data-phase="${phase}">
      <div id="km-stepper">${stepper(status)}</div>
      ${preBriefHtml}
      ${endedNotice}

      <details class="k-collapsible" id="km-details-section" ${phase === 'setup' ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">Meeting Details</span>
          <span class="k-collapsible-summary" id="km-details-summary">${detailsSummary}</span>
        </summary>
        <input type="hidden" id="km-status" value="${status}" />
        <div class="k-field-row">
          <div class="k-field">
            <label class="k-label">Title</label>
            <input class="k-input" id="km-title" type="text" value="${esc(prefillTitle)}" ${!isEditable ? 'readonly' : ''} />
          </div>
          <div class="k-field k-field-sm">
            <label class="k-label">Date</label>
            <input class="k-input" id="km-date" type="date" value="${prefillDate}" ${!isEditable ? 'readonly' : ''} />
          </div>
        </div>
        <div class="k-field">
          <label class="k-label">Meeting Type</label>
          <select class="k-input" id="km-type" ${!isEditable ? 'disabled' : ''}>
            ${MEETING_TYPES.map(t => `<option value="${t.value}" ${prefillType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
          ${isEditable ? '<p class="k-hint" style="margin-top:6px">Changes to meeting details save automatically.</p>' : ''}
        </div>
        <div class="k-field">
          <label class="k-label">Venue <span class="k-label-hint">(optional — appears in minutes header)</span></label>
          <input class="k-input" id="km-venue" type="text" placeholder="e.g. Parish Hall, RCCG Kingdom Parish" value="${esc(m?.venue || '')}" ${!isEditable ? 'readonly' : ''} />
        </div>
        <div class="k-field">
          <label class="k-label">Scheduled For <span class="k-label-hint">(optional — enables pre-meeting brief)</span></label>
          <input class="k-input" id="km-scheduled-for" type="datetime-local" value="${esc(m?.scheduledFor ? m.scheduledFor.slice(0, 16) : '')}" ${!isEditable ? 'readonly' : ''} />
        </div>
        <div class="k-field">
          <label class="k-label">Meeting Agenda <span class="k-label-hint">(optional — used by AI when generating minutes)</span></label>
          ${m?.agendaText && !isEditable ? `
          <div class="k-agenda-display" id="km-agenda-display" style="white-space:pre-wrap;font-size:13px;line-height:1.6;color:var(--text1);background:var(--surface,#f8fafc);border:1px solid var(--border);border-radius:6px;padding:10px 12px">${esc(m.agendaText)}</div>` : `
          <textarea class="k-input k-agenda-textarea" id="km-agenda" rows="5" placeholder="Paste the meeting agenda here or use the Agenda Builder to generate and auto-populate it…" ${!isEditable ? 'readonly' : ''}>${esc(m?.agendaText || '')}</textarea>
          ${isEditable && canAccess('agenda_builder') ? `<p class="k-hint" style="margin-top:4px">💡 Use the <button class="kbtn-link" onclick="Kpsc.navigate('agenda_builder')">Agenda Builder</button> to AI-generate an agenda, then click <em>Save &amp; Open Meeting Draft</em> to auto-fill this field.</p>` : ''}
          `}
        </div>
      </details>

      <details class="k-collapsible" id="km-attendance-section" ${phase === 'setup' ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">Attendance</span>
          <span class="k-collapsible-summary" id="km-attendance-summary">${attendanceSummary}</span>
        </summary>
        <div id="km-attendance" class="k-attendance">
          ${attendanceRows}
        </div>
      </details>

      <section class="k-section">
        <h3 class="k-sec-title">Live Audio & Realtime Transcript</h3>
        ${phase === 'setup' ? `<p class="k-quick-hint">Confirm the details above, then open the <strong>Live Recording</strong> tab and tap 🎙 Start Meeting to begin. Or use <strong>Upload Audio</strong> / <strong>Upload Notes</strong> to add transcript content, then click <strong>End Meeting</strong> below to proceed.</p>` : ''}
        ${isEditable ? `<div class="k-tabs" style="margin-bottom:16px">
          <button class="k-tab ${S._meetingTab === 'record' ? 'active' : ''}" onclick="Kpsc.setMeetingTab('record')">🎙 Live Recording</button>
          <button class="k-tab ${S._meetingTab === 'audio' ? 'active' : ''}" onclick="Kpsc.setMeetingTab('audio')">🎵 Upload Audio</button>
          <button class="k-tab ${S._meetingTab === 'upload' ? 'active' : ''}" onclick="Kpsc.setMeetingTab('upload')">📷 Upload Notes</button>
        </div>` : '<p class="k-hint" style="margin-bottom:16px">Recording and upload tools are disabled after a meeting is ended.</p>'}
        <div id="km-rec-panel" style="${S._meetingTab !== 'record' ? 'display:none' : ''}">
        ${canRecord ? `<div id="kpsc-rec-ui" class="k-rec-ui"></div>` : ''}
        <div id="kpsc-speaker-map"></div>
        <div class="k-live-transcript" id="kpsc-live-transcript">
          <div class="lt-head">
            <div>
              <div class="lt-title">Live Transcript with Speaker Diarization</div>
              <div class="lt-sub">OpenAI Real-time provides fast interim display; Deepgram identifies individual speakers and commits final entries with speaker labels.</div>
            </div>
            <span class="lt-pill">Realtime + Diarization</span>
          </div>
          <div class="lt-list" id="kpsc-live-transcript-list"></div>
        </div>
        ${isEditable ? `
        <details class="k-collapsible" style="margin-top:16px">
          <summary class="k-collapsible-hdr">
            <span class="k-collapsible-title">📷 Also upload handwritten notes (optional)</span>
          </summary>
          <p class="k-hint" style="margin-top:8px">Upload one or more photos of your handwritten notes from camera or gallery. The AI will extract the text and append it to the transcript above.</p>
          <label class="k-label" for="km-rec-notes-photo">Photos of Handwritten Notes</label>
          <input id="km-rec-notes-photo" type="file" accept="image/*" multiple class="k-input" style="padding:8px" onchange="Kpsc.previewRecNotesPhoto(this)" />
          <div id="km-rec-notes-preview" style="margin-top:12px"></div>
          <div id="km-rec-notes-status"></div>
        </details>` : ''}
        </div>
        <div id="km-audio-panel" style="${S._meetingTab !== 'audio' ? 'display:none' : ''}">
          ${isEditable ? `
          <div class="k-section">
            <p class="k-hint">Upload a pre-recorded audio file — the AI will transcribe it and save the text to your draft automatically. You can switch tabs or come back later; the transcript will be waiting. Supported formats: mp3, mp4, m4a, wav, webm, ogg (max 25 MB).</p>
            <label class="k-label">Audio Recording</label>
            <input id="km-audio-file" type="file" accept="audio/*" class="k-input" style="padding:8px" onchange="Kpsc.previewAudioFile(this)" />
            <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="km-audio-diarize" style="width:16px;height:16px;cursor:pointer" />
              <label for="km-audio-diarize" class="k-label" style="margin:0;cursor:pointer">🎙️ Use speaker diarization (Deepgram) — identifies who said what</label>
            </div>
            <div id="km-audio-preview" style="margin-top:8px"></div>
            <div id="km-audio-status" style="margin-top:8px"></div>
            <div id="km-speaker-map" style="margin-top:8px"></div>
          </div>
          <details class="k-collapsible" style="margin-top:4px">
            <summary class="k-collapsible-hdr">
              <span class="k-collapsible-title">📷 Also attach handwritten notes (optional)</span>
            </summary>
            <p class="k-hint" style="margin-top:8px">If you also have handwritten notes, upload one or more photos here from camera or gallery. Both the audio transcript and the notes will be combined before processing.</p>
            <label class="k-label" for="km-audio-notes-photo">Photos of Handwritten Notes</label>
            <input id="km-audio-notes-photo" type="file" accept="image/*" multiple class="k-input" style="padding:8px" onchange="Kpsc.previewAudioNotesPhoto(this)" />
            <div id="km-audio-notes-preview" style="margin-top:12px"></div>
          </details>` : ''}
        </div>
        <div id="km-upload-panel" style="${S._meetingTab !== 'upload' ? 'display:none' : ''}">
          ${isEditable ? `
          <div class="k-section">
            <p class="k-hint">Upload one or more photos of your handwritten meeting notes from camera or gallery. The AI will transcribe the handwriting and use it to generate meeting minutes.</p>
            <label class="k-label" for="km-notes-photo">Upload Photos of Handwritten Notes</label>
            <input id="km-notes-photo" type="file" accept="image/*" multiple class="k-input" style="padding:8px" onchange="Kpsc.previewNotesPhoto(this)" />
            <div id="km-notes-preview" style="margin-top:12px"></div>
          </div>` : ''}
        </div>

      <div style="margin-top:16px">
        <label class="k-label k-transcript-label" for="km-transcript">Saved Transcript / Notes</label>
        <textarea class="k-input k-textarea" id="km-transcript" placeholder="Transcript from all inputs appears here — live recording, uploaded audio, or handwritten notes. You may also type directly." ${!isEditable ? 'readonly' : ''}>${esc(m?.transcriptText || '')}</textarea>
      </div>
      </section>

      <div class="k-room-actions">
        ${isEditable ? `<span id="km-autosave-status" class="k-autosave-status" aria-live="polite"></span>` : ''}
        ${(status === 'draft' || status === 'recording') && (m ? canDeleteMeeting(m) : S._isNewMeeting) ? `<button class="kbtn kbtn-ghost kbtn-sm" style="color:var(--danger,#dc2626);margin-right:auto" onclick="Kpsc.discardMeetingFromRoom()">🗑 Discard Draft</button>` : ''}
        <span class="k-room-actions-primary">
          ${(status === 'recording' || (status === 'draft' && m)) ? `<button id="km-end-meeting-btn" class="kbtn kbtn-amber" onclick="Kpsc.endMeeting(this)">🔒 End Meeting</button>` : ''}
          ${status === 'ended' ? `<button class="kbtn kbtn-primary" onclick="Kpsc.processMeeting(this)">✨ Generate Minutes</button>` : ''}
          ${isProcessed ? `<div class="k-processed-note">✅ Minutes have been generated and finalised.</div>` : ''}
        </span>
      </div>

      ${isProcessed && m ? renderMinutesPanel(m) : ''}
      ${isProcessed && m ? renderPostMeetingOutcomes(m) : ''}
    </div>`;

  setMeetingTab(S._meetingTab || 'record');
  if (canRecord) recRenderUI();
  recRenderTranscript();
  if (isEditable) bindAutoSave();
  // Belt-and-suspenders: if an earlier AI append couldn't reach the
  // server (poor network, navigated mid-save), restore it from the
  // local buffer so the secretary doesn't see the text disappear.
  if (isEditable) restoreTranscriptFromBuffer();
  // Re-apply mic badges for any members already voice-ticked this session.
  restoreVoiceTickBadges();
}

// Walk Rec.voiceTicked and re-inject mic badges into the freshly-rendered DOM.
// Called after every attendance re-render so the badges survive innerHTML resets.
function restoreVoiceTickBadges() {
  for (const key of Rec.voiceTicked) {
    const checkbox = document.getElementById(`att_present_${key}`);
    if (!checkbox) continue;
    const label = checkbox.closest('label');
    const nameSpan = label?.querySelector('.k-att-name');
    if (nameSpan && !nameSpan.querySelector('.k-att-voice-tick')) {
      const badge = document.createElement('span');
      badge.className = 'k-att-voice-tick';
      badge.title = 'Auto-ticked from voice transcript';
      badge.textContent = '🎙';
      nameSpan.appendChild(badge);
    }
  }
}

function buildAttendanceRows(savedParts, defaultPresent = false, disabled = false) {
  // Build a name-keyed lookup so each roster member can be matched individually
  const savedByName = new Map((savedParts || []).map(p => [p.name, p]));
  const membersByGroup = new Map(GROUPS.map(g => [g.key, []]));
  for (const mem of S.members) {
    if (membersByGroup.has(mem.group)) membersByGroup.get(mem.group).push(mem);
  }

  return GROUPS.map(g => {
    const groupMembers = membersByGroup.get(g.key) || [];
    const rows = groupMembers.length > 0
      ? groupMembers.map((mem, i) => {
          const presentKey = `att_present_${g.key}_${i}`;
          const saved = savedByName.get(mem.name);
          const isPresent = saved ? !!saved.present : defaultPresent;
          return `
            <label class="k-att-member">
              <input type="checkbox" id="${presentKey}" data-group="${g.key}" data-idx="${i}"
                ${isPresent ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="Kpsc.updateAttGroup('${g.key}')"/>
              <span class="k-att-name">${esc(mem.name)}</span>
              ${mem.position ? `<span class="k-att-pos">${esc(mem.position)}</span>` : ''}
            </label>`;
        }).join('')
      : `<div class="k-att-no-members">No members in this group.
           <button class="kbtn-link" onclick="Kpsc.navigate('members')">Add members →</button>
         </div>`;

    return `
      <div class="k-att-group">
        <div class="k-att-group-hdr">${g.icon} ${g.label}
          <span class="k-att-group-count" id="att_count_${g.key}"></span>
        </div>
        <div class="k-att-group-members">${rows}</div>
      </div>`;
  }).join('');
}

function updateAttGroup(group) {
  const groupMembers = S.members.filter(m => m.group === group);
  const presentCount = groupMembers.filter((_, i) => {
    const el = document.getElementById(`att_present_${group}_${i}`);
    return el?.checked;
  }).length;
  const countEl = document.getElementById(`att_count_${group}`);
  if (countEl) {
    countEl.textContent = presentCount > 0 ? `${presentCount} present` : '';
  }
}

function readAttendance() {
  return GROUPS.map(g => {
    const groupMembers = S.members.filter(m => m.group === g.key);
    if (groupMembers.length === 0) {
      // Check if there's a fallback saved participant for this group
      return { group: g.key, label: g.label, present: false, name: '' };
    }
    // Return each member separately so multiple attendance lines per group are preserved
    return groupMembers.map((mem, i) => {
      const el = document.getElementById(`att_present_${g.key}_${i}`);
      return { group: g.key, label: g.label, present: !!(el?.checked), name: mem.name, position: mem.position || '' };
    });
  }).flat();
}

function resolutionStatus(r) {
  if (r.approved === true) return { label: 'Approved', cls: 'badge-green' };
  if (r.approved === false) return { label: 'Rejected', cls: 'badge-red' };
  return { label: 'Needs confirmation', cls: 'badge-amber' };
}

function formatResolutionAmount(amount) {
  const n = Number(String(amount || '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? `₦${n.toLocaleString('en-NG')}` : String(amount || '').trim();
}


function renderReviewPanel(m) {
  // If already reviewed and not in edit mode, show compact summary.
  if (m.reviewedAt && !S._reviewEditMode) {
    const reviewer = m.reviewedBy || S.user?.name || 'Unknown';
    const at = m.reviewedAt ? new Date(m.reviewedAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return `
      <div class="k-review-panel k-review-done" id="kr-panel">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span style="font-weight:700;color:var(--green)">✓ Reviewed by ${esc(reviewer)}${at ? ` at ${esc(at)}` : ''}</span>
          <button class="kbtn kbtn-sm" onclick="Kpsc.openReviewEditor()">Edit again</button>
        </div>
      </div>`;
  }

  // Inline editable review panel.
  const policyFlags = m.policyFlags || [];
  return `
    <div class="k-review-panel" id="kr-panel">
      <h4 class="k-sub-title" style="margin-top:0">✍️ Review &amp; Correct Minutes Draft</h4>
      <p class="k-review-hint">Read through the AI-generated draft below. Edit the text directly, or describe any corrections in the notes box and let AI apply them for you.</p>

      <div class="k-review-step-label">Step 1 — Summaries</div>
      <div class="k-form-group">
        <label class="k-label">Short Summary</label>
        <textarea class="k-input k-review-textarea" id="kr-summary-short">${esc(m.summaryShort || '')}</textarea>
      </div>
      <div class="k-form-group">
        <label class="k-label">Detailed Summary</label>
        <textarea class="k-input k-review-textarea" id="kr-summary-long">${esc(m.summaryLong || '')}</textarea>
      </div>

      <div class="k-review-step-label">Step 2 — Minutes Draft</div>
      <div class="k-review-minutes-wrap">
        <div class="k-form-group" style="flex:1;min-width:0">
          <label class="k-label">Edit Minutes</label>
          <textarea class="k-input k-review-minutes" id="kr-minutes" oninput="Kpsc.updateMinutesPreview()">${esc(m.minutesMarkdown || '')}</textarea>
        </div>
        <div class="k-form-group" style="flex:1;min-width:0">
          <label class="k-label">Live Preview</label>
          <div class="k-minutes-body k-review-preview" id="kr-minutes-preview">${minutesHtml(m.minutesMarkdown || '')}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin:-6px 0 10px">
        <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.aiGrammarCheck(this)" title="Let AI silently fix grammar, spelling, and punctuation errors only — no content changes">🤖 AI Grammar &amp; Punctuation Check</button>
      </div>

      <div class="k-review-step-label">Step 3 — AI Corrections (optional)</div>
      <div class="k-form-group">
        <label class="k-label">Secretary's Notes to AI</label>
        <div class="k-sn-toolbar">
          <label class="kbtn kbtn-sm k-sn-upload-lbl" title="Upload a photo of handwritten notes — AI will read the text">
            📎 Upload notes
            <input type="file" accept="image/*" multiple style="display:none" onchange="Kpsc.krNotesUploadPhoto(this)">
          </label>
          <button class="kbtn kbtn-sm" id="kr-voice-btn" onclick="Kpsc.krNotesToggleVoice(this)">🎙 Record voice</button>
          <span class="k-sn-voice-status" id="kr-voice-status"></span>
        </div>
        <div id="kr-notes-upload-status"></div>
        <textarea class="k-input k-review-textarea k-sn-textarea" id="kr-secretary-notes" placeholder="Describe corrections in plain English — or upload/record above and AI will fill this in. e.g. &quot;Bro. Emmanuel proposed the motion, not the Chairman. Change the welfare amount to ₦25,000. Remove the paragraph about building plans.&quot;"></textarea>
        <p class="k-review-hint" style="margin-top:4px">AI will integrate these notes into the minutes when you click <strong>Apply Correction Notes to Minutes</strong> below. Notes are not saved — used once and cleared.</p>
      </div>
      <div style="margin-bottom:14px">
        <button class="kbtn kbtn-ai" onclick="Kpsc.aiProofreadMinutes(this)">Apply Correction Notes to Minutes</button>
      </div>

      ${policyFlags.length ? `
      <div class="k-review-step-label">Policy Flags</div>
      <div class="k-flags-list" style="margin-bottom:14px">
        ${policyFlags.map(f => `
          <div class="k-flag k-flag-${f.severity || 'info'}">
            <strong>${esc(f.type)}</strong> — ${esc(f.message)}
          </div>`).join('')}
      </div>` : ''}

      <button class="kbtn kbtn-primary" style="margin-top:4px" onclick="Kpsc.saveMinutesReview(this)">✓ Approve &amp; Save</button>
    </div>`;
}

// ── INSIGHTS REVIEW STEP (Step 4) ──────────────────────────────────

const IR_RES_TYPES  = ['decision','approval','financial_approval','rejection','amendment','motion','vote'];
const IR_RES_CATS   = ['financial','welfare','development','governance','amendments','other'];
const IR_ACT_STATUSES = ['pending','in_progress','done','cancelled'];
const IR_SEVERITIES = ['low','medium','high'];

// Build <datalist> elements for attendee name suggestions in insight review forms.
function irAttendeeDatalistHtml() {
  const participants = S.activeMeeting?.participants || [];
  const names = [...new Set(
    participants.filter(p => p.present && p.name).map(p => String(p.name).trim()).filter(Boolean)
  )];
  if (!names.length) return '';
  const opts = names.map(n => `<option value="${esc(n)}">`).join('');
  return `
    <datalist id="kir-atd-motion">${opts}</datalist>
    <datalist id="kir-atd-seconded">${opts}</datalist>
    <datalist id="kir-atd-assignee">${opts}</datalist>`;
}

// Resolution sub-categories matching the global Insights page filter chips
const IR_RES_SUB_CATS = [
  { cat: 'resolutions', label: 'General Resolutions', emoji: '📋', defaultType: 'decision'           },
  { cat: 'financial',   label: 'Financial Approvals', emoji: '💰', defaultType: 'financial_approval' },
  { cat: 'amendments',  label: 'Amendments',          emoji: '✏️',  defaultType: 'amendment'          },
  { cat: 'rejections',  label: 'Rejections',          emoji: '✗',  defaultType: 'rejection'          },
  { cat: 'motions',     label: 'Motions / Proposals', emoji: '🗣',  defaultType: 'motion'             },
];

function renderInsightsReviewSection(m) {
  const allResolutions    = m.resolutions || [];
  const actionItems       = m.actionItems || [];
  const policyFlags       = m.policyFlags || [];
  const suggestedProjects = m.suggestedProjects || [];

  // Partition resolutions into sub-category buckets
  const resByCat = {};
  IR_RES_SUB_CATS.forEach(sc => { resByCat[sc.cat] = []; });
  allResolutions.forEach(r => {
    const cat = classifyResolutionInsight(r);
    (resByCat[cat] || resByCat['resolutions']).push(r);
  });

  const resolutionSections = IR_RES_SUB_CATS.map(({ cat, label, emoji, defaultType }) => {
    const items = resByCat[cat] || [];
    const count = items.length;
    return `
      <details class="k-collapsible" ${count ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">${emoji} ${label}</span>
          <span class="k-collapsible-summary" id="kir-res-${cat}-count-lbl">${count} item${count !== 1 ? 's' : ''}</span>
        </summary>
        <div id="k-ir-res-${cat}-body" class="k-ir-body">${renderIrResSubCatRows(items, cat, defaultType)}</div>
        <div class="k-ir-add-row"><button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.addIrResRow('${cat}','${defaultType}')">+ Add ${label.toLowerCase()}</button></div>
      </details>`;
  }).join('');

  return `
    <section class="k-section k-insights-review-section" id="k-insights-review">
      ${irAttendeeDatalistHtml()}
      <div class="k-review-step-label" style="border-top:none;padding-top:0;margin-top:16px">Step 4 — Review &amp; Edit Insights</div>
      <p class="k-review-hint" style="margin-bottom:14px">Verify the AI-extracted insights below. Each category is editable. Click <strong>Save Insights</strong> when done — this saves separately from the minutes review above.</p>

      ${resolutionSections}

      <details class="k-collapsible" ${actionItems.length ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">✅ Action Items</span>
          <span class="k-collapsible-summary" id="kir-act-count-lbl">${actionItems.length} item${actionItems.length !== 1 ? 's' : ''}</span>
        </summary>
        <div id="k-ir-act-body" class="k-ir-body">${renderIrActionRows(actionItems)}</div>
        <div class="k-ir-add-row"><button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.addIrRow('actions')">+ Add action item</button></div>
      </details>

      <details class="k-collapsible" ${policyFlags.length ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">🚩 Governance Flags</span>
          <span class="k-collapsible-summary" id="kir-flag-count-lbl">${policyFlags.length} item${policyFlags.length !== 1 ? 's' : ''}</span>
        </summary>
        <div id="k-ir-flag-body" class="k-ir-body">${renderIrFlagRows(policyFlags)}</div>
        <div class="k-ir-add-row"><button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.addIrRow('flags')">+ Add flag</button></div>
      </details>

      <details class="k-collapsible" ${suggestedProjects.length ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">💡 Project Suggestions</span>
          <span class="k-collapsible-summary" id="kir-proj-count-lbl">${suggestedProjects.length} item${suggestedProjects.length !== 1 ? 's' : ''}</span>
        </summary>
        <div id="k-ir-proj-body" class="k-ir-body">${renderIrProjectRows(suggestedProjects)}</div>
        <div class="k-ir-add-row"><button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.addIrRow('projects')">+ Add project suggestion</button></div>
      </details>

      <div class="k-ir-save-row">
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveInsightsReview(this)">💾 Save Insights</button>
      </div>
    </section>`;
}

// ── Saved / Card view for Step 4 ────────────────────────────────────

function renderIrSavedResCard(r, cat, idx, canEdit) {
  const accentCls = r.approved === true ? 'k-mc-accent-green' : r.approved === false ? 'k-mc-accent-red'
    : cat === 'financial' ? 'k-mc-accent-orange' : cat === 'motions' ? 'k-mc-accent-purple'
    : cat === 'amendments' ? 'k-mc-accent-blue' : 'k-mc-accent-amber';
  const statusBadge = r.approved === true
    ? '<span class="kbadge badge-green">✓ Approved</span>'
    : r.approved === false
      ? '<span class="kbadge badge-red">✗ Rejected</span>'
      : '<span class="kbadge badge-amber">Needs confirmation</span>';
  const typeBadge = `<span class="kbadge badge-type">${esc(String(r.resolutionType || 'decision').replace(/_/g, ' '))}</span>`;
  const amountBadge = r.amount ? `<span class="kbadge badge-green">${esc(formatResolutionAmount(r.amount))}</span>` : '';
  const metaRow = (r.motionBy || r.secondedBy || r.voteSummary) ? `
    <div class="k-ic-info">
      ${r.motionBy   ? `<span>🗣 Moved: ${esc(r.motionBy)}</span>` : ''}
      ${r.secondedBy ? `<span>Seconded: ${esc(r.secondedBy)}</span>` : ''}
      ${r.voteSummary ? `<span>${esc(r.voteSummary)}</span>` : ''}
    </div>` : '';
  const amendmentBtn = (cat === 'amendments' && canApplyAmendment() && !r.appliedAmendmentId)
    ? `<button class="kbtn kbtn-sm kbtn-ghost" style="margin-top:6px" data-amendment-key="${esc(String(r._meetingId||''))}" onclick="Kpsc.showAmendmentWorkflowModal('${esc(String(r.text||'')).replace(/'/g,"\\'")}','${esc(String(r._meetingId||''))}','${cat}-${idx}')">📜 Apply Amendment</button>`
    : (cat === 'amendments' && r.appliedAmendmentId ? `<span class="kbadge badge-green" style="margin-top:6px;cursor:pointer" title="Click to view version history" onclick="Kpsc.navigate('settings')">✓ Applied in v${r.appliedAmendmentVersion||'?'}</span>` : '');
  const actionBtns = canEdit ? `
    <div class="k-ic-footer" style="margin-top:8px">
      <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.irEditInsightItem('res','${cat}',${idx})">✏️ Edit</button>
      <button class="kbtn kbtn-sm kbtn-danger-outline" onclick="Kpsc.irRemoveInsightItem('res','${cat}',${idx})">✕ Remove</button>
      ${amendmentBtn}
    </div>` : (amendmentBtn ? `<div class="k-ic-footer" style="margin-top:8px">${amendmentBtn}</div>` : '');
  return `
    <div class="k-meeting-card k-insight-card ${accentCls}" style="cursor:default">
      ${insightTruncText(r.text || '', 130)}
      <div class="k-ic-badges">${statusBadge}${typeBadge}${amountBadge}</div>
      ${metaRow}
      ${actionBtns}
    </div>`;
}

function renderIrSavedActionCard(a, idx, canEdit) {
  const accentCls = a.status === 'done' ? 'k-mc-accent-green' : a.status === 'cancelled' ? 'k-mc-accent-gray' : 'k-mc-accent-blue';
  const actionBtns = canEdit ? `
    <div class="k-ic-footer" style="margin-top:8px">
      <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.irEditInsightItem('actions',null,${idx})">✏️ Edit</button>
      <button class="kbtn kbtn-sm kbtn-danger-outline" onclick="Kpsc.irRemoveInsightItem('actions',null,${idx})">✕ Remove</button>
    </div>` : '';
  return `
    <div class="k-meeting-card k-insight-card ${accentCls}" style="cursor:default">
      ${insightTruncText(a.task || '', 130)}
      <div class="k-ic-badges"><span class="kbadge badge-type">Action item</span></div>
      <div class="k-ic-info">
        <span>👤 ${esc(a.assignee || 'Unassigned')}</span>
        ${insightsDueDateLabel(a.dueDate, a.status)}
        ${insightsStatusBadge(a.status)}
      </div>
      ${actionBtns}
    </div>`;
}

function renderIrSavedFlagCard(f, idx, canEdit) {
  const sevCls = f.severity === 'high' ? 'k-insight-flag-high' : f.severity === 'medium' ? 'k-insight-flag-medium' : 'k-insight-flag-low';
  const sevBadge = f.severity === 'high'   ? '<span class="kbadge badge-red">HIGH</span>'
    : f.severity === 'medium' ? '<span class="kbadge badge-amber">MEDIUM</span>'
    : '<span class="kbadge badge-blue">LOW</span>';
  const actionBtns = canEdit ? `
    <div class="k-ic-footer" style="margin-top:8px">
      <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.irEditInsightItem('flags',null,${idx})">✏️ Edit</button>
      <button class="kbtn kbtn-sm kbtn-danger-outline" onclick="Kpsc.irRemoveInsightItem('flags',null,${idx})">✕ Remove</button>
    </div>` : '';
  return `
    <div class="k-meeting-card k-insight-card ${sevCls}" style="cursor:default">
      <div class="k-ic-title">🚩 ${esc(String(f.type || '').replace(/_/g, ' ') || 'Governance alert')}</div>
      <div class="k-ic-badges">${sevBadge}<span class="kbadge badge-type">Policy flag</span></div>
      ${f.message ? `<div class="k-insight-flag-msg">${esc(f.message)}</div>` : ''}
      ${actionBtns}
    </div>`;
}

function renderIrSavedProjectCard(p, idx, canEdit) {
  const costHtml = p.estimatedCost ? `<span class="kbadge badge-type">Est. ${esc(formatResolutionAmount(p.estimatedCost))}</span>` : '';
  const actionBtns = canEdit ? `
    <div class="k-ic-footer" style="margin-top:8px">
      <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.irEditInsightItem('projects',null,${idx})">✏️ Edit</button>
      <button class="kbtn kbtn-sm kbtn-danger-outline" onclick="Kpsc.irRemoveInsightItem('projects',null,${idx})">✕ Remove</button>
    </div>` : '';
  return `
    <div class="k-meeting-card k-insight-card k-mc-accent-purple k-insight-project-card" style="cursor:default">
      <div class="k-ic-title">💡 ${esc(p.title || p.description || 'Project suggestion')}</div>
      <div class="k-ic-badges">${costHtml}<span class="kbadge badge-type">AI suggestion</span></div>
      ${p.description && p.description !== p.title ? `<div class="k-insight-flag-msg">${esc(p.description)}</div>` : ''}
      ${actionBtns}
    </div>`;
}

function renderInsightsReviewSavedView(m) {
  const canEdit = canEditInsightsActionStatus();
  const allResolutions    = m.resolutions    || [];
  const actionItems       = m.actionItems    || [];
  const policyFlags       = m.policyFlags    || [];
  const suggestedProjects = m.suggestedProjects || [];

  const resByCat = {};
  IR_RES_SUB_CATS.forEach(sc => { resByCat[sc.cat] = []; });
  allResolutions.forEach(r => {
    const cat = classifyResolutionInsight(r);
    (resByCat[cat] || resByCat['resolutions']).push(r);
  });

  const resolutionSections = IR_RES_SUB_CATS.map(({ cat, label, emoji }) => {
    const items = resByCat[cat] || [];
    if (!items.length) return '';
    const cards = items.map((r, i) => renderIrSavedResCard(r, cat, i, canEdit)).join('');
    return `
      <details class="k-collapsible" open>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">${emoji} ${label}</span>
          <span class="k-collapsible-summary">${items.length} item${items.length !== 1 ? 's' : ''}</span>
        </summary>
        <div class="k-ir-saved-cards">${cards}</div>
      </details>`;
  }).filter(Boolean).join('');

  const actionCards   = actionItems.length       ? actionItems.map((a, i) => renderIrSavedActionCard(a, i, canEdit)).join('')    : '<div class="k-ir-empty">No action items.</div>';
  const flagCards     = policyFlags.length       ? policyFlags.map((f, i) => renderIrSavedFlagCard(f, i, canEdit)).join('')     : '<div class="k-ir-empty">No governance flags.</div>';
  const projectCards  = suggestedProjects.length ? suggestedProjects.map((p, i) => renderIrSavedProjectCard(p, i, canEdit)).join('') : '<div class="k-ir-empty">No project suggestions.</div>';

  const editAllBtn = canEdit
    ? `<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.irOpenEditMode()" style="margin-left:auto;font-size:0.85em">✏️ Edit insights</button>`
    : '';

  return `
    <section class="k-section k-insights-review-section" id="k-insights-review">
      <div class="k-review-step-label" style="border-top:none;padding-top:0;margin-top:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span>Step 4 — Insights</span>
        <span class="kbadge badge-green" style="font-size:0.75em;vertical-align:middle">✓ Saved</span>
        ${editAllBtn}
      </div>
      <p class="k-review-hint" style="margin-bottom:14px">Insights extracted from this meeting. ${canEdit ? 'Use the Edit or Remove buttons to modify individual items, or <em>Edit insights</em> to update everything.' : ''}</p>

      ${resolutionSections || '<p class="k-ir-empty" style="padding:0 0 8px">No resolutions recorded.</p>'}

      <details class="k-collapsible" ${actionItems.length ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">✅ Action Items</span>
          <span class="k-collapsible-summary">${actionItems.length} item${actionItems.length !== 1 ? 's' : ''}</span>
        </summary>
        <div class="k-ir-saved-cards">${actionCards}</div>
      </details>

      <details class="k-collapsible" ${policyFlags.length ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">🚩 Governance Flags</span>
          <span class="k-collapsible-summary">${policyFlags.length} item${policyFlags.length !== 1 ? 's' : ''}</span>
        </summary>
        <div class="k-ir-saved-cards">${flagCards}</div>
      </details>

      <details class="k-collapsible" ${suggestedProjects.length ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">💡 Project Suggestions</span>
          <span class="k-collapsible-summary">${suggestedProjects.length} item${suggestedProjects.length !== 1 ? 's' : ''}</span>
        </summary>
        <div class="k-ir-saved-cards">${projectCards}</div>
      </details>
    </section>`;
}

// ── Saved view interaction handlers ─────────────────────────────────

function irOpenEditMode() {
  const irSection = document.getElementById('k-insights-review');
  if (irSection && S.activeMeeting) irSection.outerHTML = renderInsightsReviewSection(S.activeMeeting);
}

function irEditInsightItem(kind, cat, idx) {
  irOpenEditMode();
  const dataKir = kind === 'res' ? 'res' : kind === 'actions' ? 'act' : kind === 'flags' ? 'flag' : 'proj';
  const selector = kind === 'res'
    ? `[data-kir="res"][data-res-cat="${cat}"][data-idx="${idx}"]`
    : `[data-kir="${dataKir}"][data-idx="${idx}"]`;
  requestAnimationFrame(() => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

async function irRemoveInsightItem(kind, cat, idx) {
  if (!S.activeMeeting) return;
  if (!confirm('Remove this insight item?')) return;

  const resolutions       = (S.activeMeeting.resolutions    || []).slice();
  const actionItems       = (S.activeMeeting.actionItems    || []).slice();
  const policyFlags       = (S.activeMeeting.policyFlags    || []).slice();
  const suggestedProjects = (S.activeMeeting.suggestedProjects || []).slice();

  if (kind === 'res') {
    const resByCat = {};
    IR_RES_SUB_CATS.forEach(sc => { resByCat[sc.cat] = []; });
    resolutions.forEach((r, i) => {
      const c = classifyResolutionInsight(r);
      (resByCat[c] || resByCat['resolutions']).push({ _origIdx: i });
    });
    const toRemove = (resByCat[cat] || [])[idx];
    if (toRemove != null) resolutions.splice(toRemove._origIdx, 1);
  } else if (kind === 'actions') {
    actionItems.splice(idx, 1);
  } else if (kind === 'flags') {
    policyFlags.splice(idx, 1);
  } else if (kind === 'projects') {
    suggestedProjects.splice(idx, 1);
  }

  try {
    const updated = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
      resolutions, actionItems, policyFlags, suggestedProjects,
    });
    if (updated?.error) { showToast(updated.error, 'error'); return; }
    S.activeMeeting = { ...updated };
    if (S.meetings?.length) S.meetings = S.meetings.map(m => m.id === S.activeMeeting.id ? S.activeMeeting : m);
    showToast('Insight item removed.', 'success');
    const irSection = document.getElementById('k-insights-review');
    if (irSection) irSection.outerHTML = renderInsightsReviewSavedView(S.activeMeeting);
  } catch {
    showToast('Could not remove item. Check your connection.', 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────

function renderIrResSubCatRows(resolutions, cat, defaultType) {
  const sc = IR_RES_SUB_CATS.find(s => s.cat === cat);
  const label = sc ? sc.label.toLowerCase() : 'resolution';
  if (!resolutions.length) return `<div class="k-ir-empty">No ${label} extracted yet. Add one below.</div>`;
  return resolutions.map((r, i) => `
    <div class="k-ir-row" data-kir="res" data-res-cat="${cat}" data-idx="${i}">
      <input type="hidden" id="kir-res-${cat}-id-${i}" value="${esc(String(r.id || ''))}">
      <div>
        <div class="k-ir-lbl">Resolution text</div>
        <textarea class="k-input k-input-sm" id="kir-res-${cat}-text-${i}" rows="2" style="resize:vertical">${esc(r.text || '')}</textarea>
      </div>
      <div class="k-ir-row-2col">
        <div>
          <div class="k-ir-lbl">Type</div>
          <select class="k-input k-input-sm" id="kir-res-${cat}-type-${i}">
            ${IR_RES_TYPES.map(t => `<option value="${t}" ${(r.resolutionType||defaultType||'decision')===t?'selected':''}>${t.replace(/_/g,' ')}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="k-ir-lbl">Approval</div>
          <select class="k-input k-input-sm" id="kir-res-${cat}-approved-${i}">
            <option value="null" ${r.approved==null?'selected':''}>Needs confirmation</option>
            <option value="true" ${r.approved===true?'selected':''}>Approved</option>
            <option value="false" ${r.approved===false?'selected':''}>Rejected</option>
          </select>
        </div>
      </div>
      ${cat === 'financial' ? `
      <div>
        <div class="k-ir-lbl">Amount</div>
        <input class="k-input k-input-sm" type="text" id="kir-res-${cat}-amount-${i}" placeholder="e.g. 50000" value="${esc(r.amount||'')}">
      </div>` : `<input type="hidden" id="kir-res-${cat}-amount-${i}" value="${esc(r.amount||'')}">`}
      <div class="k-ir-row-3col">
        <div>
          <div class="k-ir-lbl">Moved by</div>
          <input class="k-input k-input-sm" type="text" id="kir-res-${cat}-motion-${i}" list="kir-atd-motion" placeholder="Name" value="${esc(r.motionBy||'')}">
        </div>
        <div>
          <div class="k-ir-lbl">Seconded by</div>
          <input class="k-input k-input-sm" type="text" id="kir-res-${cat}-seconded-${i}" list="kir-atd-seconded" placeholder="Name" value="${esc(r.secondedBy||'')}">
        </div>
        <div>
          <div class="k-ir-lbl">Vote summary</div>
          <input class="k-input k-input-sm" type="text" id="kir-res-${cat}-vote-${i}" placeholder="e.g. Unanimously approved" value="${esc(r.voteSummary||'')}">
        </div>
      </div>
      <div class="k-ir-row-actions">
        <button class="kbtn kbtn-sm kbtn-danger-outline" onclick="Kpsc.removeIrResRow('${cat}',${i})">✕ Remove</button>
      </div>
    </div>`).join('');
}

function renderIrActionRows(actions) {
  if (!actions.length) return '<div class="k-ir-empty">No action items extracted yet. Add one below.</div>';
  return actions.map((a, i) => `
    <div class="k-ir-row" data-kir="act" data-idx="${i}">
      <input type="hidden" id="kir-act-id-${i}" value="${esc(String(a.id || ''))}">
      <div>
        <div class="k-ir-lbl">Task</div>
        <textarea class="k-input k-input-sm" id="kir-act-task-${i}" rows="2" style="resize:vertical">${esc(a.task||'')}</textarea>
      </div>
      <div class="k-ir-row-3col">
        <div>
          <div class="k-ir-lbl">Assigned to</div>
          <input class="k-input k-input-sm" type="text" id="kir-act-assignee-${i}" list="kir-atd-assignee" placeholder="Full name" value="${esc(a.assignee||'')}">
        </div>
        <div>
          <div class="k-ir-lbl">Due date</div>
          <input class="k-input k-input-sm" type="date" id="kir-act-due-${i}" value="${esc(a.dueDate||'')}">
        </div>
        <div>
          <div class="k-ir-lbl">Status</div>
          <select class="k-input k-input-sm" id="kir-act-status-${i}">
            ${IR_ACT_STATUSES.map(s => `<option value="${s}" ${(a.status||'pending')===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="k-ir-row-actions">
        <button class="kbtn kbtn-sm kbtn-danger-outline" onclick="Kpsc.removeIrRow('actions',${i})">✕ Remove</button>
      </div>
    </div>`).join('');
}

function renderIrFlagRows(flags) {
  if (!flags.length) return '<div class="k-ir-empty">No governance flags detected. Add one below.</div>';
  return flags.map((f, i) => `
    <div class="k-ir-row" data-kir="flag" data-idx="${i}">
      <input type="hidden" id="kir-flag-id-${i}" value="${esc(String(f.id || ''))}">
      <div class="k-ir-row-2col">
        <div>
          <div class="k-ir-lbl">Flag type</div>
          <input class="k-input k-input-sm" type="text" id="kir-flag-type-${i}" placeholder="e.g. quorum_missing" value="${esc(f.type||'')}">
        </div>
        <div>
          <div class="k-ir-lbl">Severity</div>
          <select class="k-input k-input-sm" id="kir-flag-sev-${i}">
            ${IR_SEVERITIES.map(s => `<option value="${s}" ${(f.severity||'low')===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <div class="k-ir-lbl">Message</div>
        <textarea class="k-input k-input-sm" id="kir-flag-msg-${i}" rows="2" style="resize:vertical">${esc(f.message||'')}</textarea>
      </div>
      <div class="k-ir-row-actions">
        <button class="kbtn kbtn-sm kbtn-danger-outline" onclick="Kpsc.removeIrRow('flags',${i})">✕ Remove</button>
      </div>
    </div>`).join('');
}

function renderIrProjectRows(projects) {
  if (!projects.length) return '<div class="k-ir-empty">No project suggestions found. Add one below.</div>';
  return projects.map((p, i) => `
    <div class="k-ir-row" data-kir="proj" data-idx="${i}">
      <input type="hidden" id="kir-proj-id-${i}" value="${esc(String(p.id || ''))}">
      <div class="k-ir-row-2col">
        <div>
          <div class="k-ir-lbl">Title</div>
          <input class="k-input k-input-sm" type="text" id="kir-proj-title-${i}" placeholder="Project name" value="${esc(p.title||'')}">
        </div>
        <div>
          <div class="k-ir-lbl">Estimated cost</div>
          <input class="k-input k-input-sm" type="text" id="kir-proj-cost-${i}" placeholder="e.g. 500000" value="${esc(p.estimatedCost||p.estimated_cost||'')}">
        </div>
      </div>
      <div>
        <div class="k-ir-lbl">Description</div>
        <textarea class="k-input k-input-sm" id="kir-proj-desc-${i}" rows="2" style="resize:vertical">${esc(p.description||'')}</textarea>
      </div>
      <div class="k-ir-row-actions">
        <button class="kbtn kbtn-sm kbtn-danger-outline" onclick="Kpsc.removeIrRow('projects',${i})">✕ Remove</button>
      </div>
    </div>`).join('');
}

// ── Read all current DOM values for each insight category ───────────

function readIrResForCat(cat) {
  const rows = [...document.querySelectorAll(`[data-kir="res"][data-res-cat="${cat}"]`)];
  return rows.map((_, i) => {
    const approvedRaw = document.getElementById(`kir-res-${cat}-approved-${i}`)?.value || 'null';
    return {
      id:             document.getElementById(`kir-res-${cat}-id-${i}`)?.value || null,
      text:           document.getElementById(`kir-res-${cat}-text-${i}`)?.value.trim() || '',
      resolutionType: document.getElementById(`kir-res-${cat}-type-${i}`)?.value || 'decision',
      category:       cat,
      approved:       approvedRaw === 'true' ? true : approvedRaw === 'false' ? false : null,
      amount:         document.getElementById(`kir-res-${cat}-amount-${i}`)?.value?.trim() || '',
      motionBy:       document.getElementById(`kir-res-${cat}-motion-${i}`)?.value.trim() || '',
      secondedBy:     document.getElementById(`kir-res-${cat}-seconded-${i}`)?.value.trim() || '',
      voteSummary:    document.getElementById(`kir-res-${cat}-vote-${i}`)?.value.trim() || '',
    };
  }).filter(r => r.text);
}

function readIrAllResolutions() {
  return IR_RES_SUB_CATS.flatMap(({ cat }) => readIrResForCat(cat));
}

function readIrActions() {
  return [...document.querySelectorAll('[data-kir="act"]')].map((_, i) => ({
    id: document.getElementById(`kir-act-id-${i}`)?.value || null,
    task: document.getElementById(`kir-act-task-${i}`)?.value.trim() || '',
    assignee: document.getElementById(`kir-act-assignee-${i}`)?.value.trim() || 'Unassigned',
    dueDate: document.getElementById(`kir-act-due-${i}`)?.value.trim() || '',
    status: document.getElementById(`kir-act-status-${i}`)?.value || 'pending',
  })).filter(a => a.task);
}

function readIrFlags() {
  return [...document.querySelectorAll('[data-kir="flag"]')].map((_, i) => ({
    id: document.getElementById(`kir-flag-id-${i}`)?.value || null,
    type: document.getElementById(`kir-flag-type-${i}`)?.value.trim() || '',
    severity: document.getElementById(`kir-flag-sev-${i}`)?.value || 'low',
    message: document.getElementById(`kir-flag-msg-${i}`)?.value.trim() || '',
  })).filter(f => f.type || f.message);
}

function readIrProjects() {
  return [...document.querySelectorAll('[data-kir="proj"]')].map((_, i) => ({
    id: document.getElementById(`kir-proj-id-${i}`)?.value || null,
    title: document.getElementById(`kir-proj-title-${i}`)?.value.trim() || '',
    description: document.getElementById(`kir-proj-desc-${i}`)?.value.trim() || '',
    estimatedCost: document.getElementById(`kir-proj-cost-${i}`)?.value.trim() || '',
  })).filter(p => p.title || p.description);
}

// ── Add / Remove insight rows ───────────────────────────────────────

function irKindConfig(kind) {
  const cfg = {
    actions:  [readIrActions,  renderIrActionRows,  'k-ir-act-body',  'kir-act-count-lbl'],
    flags:    [readIrFlags,    renderIrFlagRows,    'k-ir-flag-body', 'kir-flag-count-lbl'],
    projects: [readIrProjects, renderIrProjectRows, 'k-ir-proj-body', 'kir-proj-count-lbl'],
  };
  return cfg[kind] || null;
}

function irEmptyItem(kind) {
  const empty = {
    actions:  { task:'', assignee:'', dueDate:'', status:'pending' },
    flags:    { type:'', severity:'low', message:'' },
    projects: { title:'', description:'', estimatedCost:'' },
  };
  return empty[kind] || {};
}

function addIrRow(kind) {
  const cfg = irKindConfig(kind);
  if (!cfg) return;
  const [readFn, renderFn, bodyId, countId] = cfg;
  const current = readFn();
  current.push(irEmptyItem(kind));
  const bodyEl = document.getElementById(bodyId);
  if (bodyEl) bodyEl.innerHTML = renderFn(current);
  const lbl = document.getElementById(countId);
  if (lbl) lbl.textContent = `${current.length} item${current.length !== 1 ? 's' : ''}`;
  // Focus the last new text field
  const lastRow = bodyEl?.querySelector('[data-kir]:last-child textarea, [data-kir]:last-child input[type="text"]');
  lastRow?.focus();
}

function removeIrRow(kind, idx) {
  const cfg = irKindConfig(kind);
  if (!cfg) return;
  const [readFn, renderFn, bodyId, countId] = cfg;
  const current = readFn();
  current.splice(idx, 1);
  const bodyEl = document.getElementById(bodyId);
  if (bodyEl) bodyEl.innerHTML = renderFn(current);
  const lbl = document.getElementById(countId);
  if (lbl) lbl.textContent = `${current.length} item${current.length !== 1 ? 's' : ''}`;
}

function addIrResRow(cat, defaultType) {
  const bodyId  = `k-ir-res-${cat}-body`;
  const countId = `kir-res-${cat}-count-lbl`;
  const current = readIrResForCat(cat);
  current.push({ text:'', resolutionType: defaultType || 'decision', category: cat, approved: null, amount:'', motionBy:'', secondedBy:'', voteSummary:'' });
  const bodyEl = document.getElementById(bodyId);
  if (bodyEl) bodyEl.innerHTML = renderIrResSubCatRows(current, cat, defaultType || 'decision');
  const lbl = document.getElementById(countId);
  if (lbl) lbl.textContent = `${current.length} item${current.length !== 1 ? 's' : ''}`;
  const lastRow = bodyEl?.querySelector('[data-kir]:last-child textarea, [data-kir]:last-child input[type="text"]');
  lastRow?.focus();
}

function removeIrResRow(cat, idx) {
  const sc = IR_RES_SUB_CATS.find(s => s.cat === cat);
  const defaultType = sc?.defaultType || 'decision';
  const bodyId  = `k-ir-res-${cat}-body`;
  const countId = `kir-res-${cat}-count-lbl`;
  const current = readIrResForCat(cat);
  current.splice(idx, 1);
  const bodyEl = document.getElementById(bodyId);
  if (bodyEl) bodyEl.innerHTML = renderIrResSubCatRows(current, cat, defaultType);
  const lbl = document.getElementById(countId);
  if (lbl) lbl.textContent = `${current.length} item${current.length !== 1 ? 's' : ''}`;
}

// ── Save all insights to the API ────────────────────────────────────

async function saveInsightsReview(btn) {
  if (!S.activeMeeting) return;
  const resolutions       = readIrAllResolutions();
  const actionItems       = readIrActions();
  const policyFlags       = readIrFlags();
  const suggestedProjects = readIrProjects();
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const updated = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
      resolutions, actionItems, policyFlags, suggestedProjects,
    });
    if (updated?.error) { showToast(updated.error, 'error'); return; }
    S.activeMeeting = { ...updated };
    // Also sync S.meetings cache if loaded
    if (S.meetings?.length) {
      S.meetings = S.meetings.map(m => m.id === S.activeMeeting.id ? S.activeMeeting : m);
    }
    showToast('Insights saved.', 'success');
    const projsToPromote = (updated?.suggestedProjects || []).filter(p => p.title);
    if (projsToPromote.length) {
      autoPromoteProjects(S.activeMeeting.id, projsToPromote);
    }
  } catch {
    showToast('Could not save insights. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── Promote a suggested project to the KPSC Projects page ──────────

async function promoteInsightProject(btn, meetingId, title, description, estimatedCost, priority, targetDate) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Promoting…';
  try {
    const res = await apiPost('kpsc-approve-meeting-projects', {
      meetingId,
      projects: [{ title, description, estimatedCost: estimatedCost || 0, priority: priority || 'medium', targetDate: targetDate || '' }],
      createdBy: S.user?.name || '',
    });
    if (res?.error) { showToast(res.error, 'error'); return; }
    showToast(`"${title}" added to Projects.`, 'success');
    // Remove from S.meetings suggested projects cache
    if (S.meetings?.length) {
      S.meetings = S.meetings.map(m => {
        if (String(m.id) !== String(meetingId)) return m;
        return { ...m, suggestedProjects: (m.suggestedProjects || []).filter(p => p.title !== title) };
      });
    }
    // Append new project to S.projects cache if it's loaded
    if (Array.isArray(res?.projects) && res.projects.length && Array.isArray(S.projects)) {
      S.projects = [...S.projects, ...res.projects];
    }
    // Re-render insights so the promoted card disappears
    rerenderInsightsList();
  } catch {
    showToast('Could not promote project. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function autoPromoteProjects(meetingId, projects) {
  try {
    const res = await apiPost('kpsc-approve-meeting-projects', {
      meetingId,
      projects: projects.map(p => ({
        title: p.title,
        description: p.description || '',
        estimatedCost: p.estimatedCost || 0,
        priority: p.priority || 'medium',
        targetDate: p.targetDate || '',
      })),
      createdBy: S.user?.name || '',
    });
    if (res?.error || !res?.saved) return;
    S.activeMeeting = { ...S.activeMeeting, suggestedProjects: [] };
    if (S.meetings?.length) {
      S.meetings = S.meetings.map(m => m.id === meetingId ? S.activeMeeting : m);
    }
    if (Array.isArray(res.projects) && Array.isArray(S.projects)) {
      S.projects = [...S.projects, ...res.projects];
    }
    showToast(`${res.saved} project suggestion${res.saved !== 1 ? 's' : ''} added to Projects automatically.`, 'success');
  } catch { /* silent */ }
}

// ───────────────────────────────────────────────────────────────────

function minutesActionsHtml(m) {
  const reviewed = !!m.reviewedAt;
  const rg = reviewed ? '' : 'disabled title="Approve and save the review before this action is available."';
  const _role = String(S.user?.role || '').toLowerCase();
  const isChairOrSecretary = _role === 'acting_chairman' || _role === 'general_secretary';
  return `
    <button class="kbtn kbtn-sm" onclick="Kpsc.printMinutes('${m.id}')" aria-disabled="${reviewed ? 'false' : 'true'}" ${rg}>🖨 Print / Save PDF</button>
    <button class="kbtn kbtn-sm" onclick="Kpsc.shareMinutesWhatsApp('${m.id}')" aria-disabled="${reviewed ? 'false' : 'true'}" ${rg}>📲 Share via WhatsApp</button>
    ${m.publicShareToken && isChairOrSecretary ? `<button class="kbtn kbtn-sm" onclick="Kpsc.revokeMinutesPublicLink('${m.id}')">🔒 Revoke Public Link</button>` : ''}
    <button class="kbtn kbtn-sm" id="btn-plain-english-${m.id}" onclick="Kpsc.togglePlainEnglish('${m.id}')" data-plain-english="false">📖 Read in plain English</button>
    ${isChairOrSecretary ? `<button class="kbtn kbtn-sm kbtn-ghost" style="margin-left:8px" onclick="Kpsc.reGenerateMinutes('${m.id}', this)">🔄 Re-generate Minutes</button>` : ''}
  `;
}

async function reGenerateMinutes(meetingId, btn) {
  if (!confirm('Re-generate AI minutes? This will clear the current approved minutes and restart the AI processing pipeline.')) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Resetting…';
  try {
    const res = await apiPost(`ai-secretary-meetings/${meetingId}/reset-for-reprocess`, {});
    if (res.error) { showToast(res.error, 'error'); return; }
    S.activeMeeting = res;
    _dashCache.ts = 0; // invalidate dashboard cache
    renderPage('meeting');
    showToast('Meeting reset — you can now generate new minutes.', 'success');
  } catch {
    showToast('Failed to reset meeting. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── Post-Meeting Closure: Agenda Outcomes Panel ──────────────────────────
// After a meeting is processed, let the secretary mark each agenda item's outcome.
// Outcomes are saved to the linked WhatsApp draft via the outcomes API.

/**
 * Renders an inline AI-suggestion badge for an agenda outcome item.
 * Shows the AI's suggested status and confidence level when no manual selection
 * has been made yet. Confidence maps to badge colour: high=blue, medium=amber, low=gray.
 *
 * @param {object|undefined} suggestion  AI suggestion object from S._meetingOutcomeSuggestions
 * @param {string}           currentStatus  Currently selected status for this item (empty string = none)
 * @returns {string} HTML badge string (empty if no suggestion or already selected)
 */
function outcomeConfidenceBadge(suggestion, currentStatus) {
  if (!suggestion || currentStatus) return '';
  const cls = suggestion.confidence === 'high' ? 'badge-blue'
    : suggestion.confidence === 'medium' ? 'badge-amber' : 'badge-gray';
  const prefix = suggestion.confidence === 'high' ? '🤖 AI: '
    : suggestion.confidence === 'medium' ? '🤖 AI (unsure): ' : '🤖 AI (needs review): ';
  return `<span class="kbadge ${cls}" style="font-size:10px;margin-left:4px" title="${esc(suggestion.rationale || '')}">${prefix}${esc(suggestion.label || '')}</span>`;
}

function renderPostMeetingOutcomes(m) {
  // Determine the agenda items to display. Priority:
  // 1. AI-extracted agendaItems from meeting processing (most accurate)
  // 2. Selected items from the linked Agenda Builder draft
  // 3. Parsed lines from raw agendaText (fallback)
  let items = [];

  if (Array.isArray(m.agendaItems) && m.agendaItems.length) {
    // AI has already analysed and extracted the structured agenda items
    items = m.agendaItems.filter(i => String(i).trim().length > 1);
  }

  if (!items.length) {
    // Try to get the selected items from the linked Agenda Builder draft
    const draft = (S.agendaBuilderDraftsHistory || []).find(d => d.linkedMeetingId === m.id);
    if (draft && Array.isArray(draft.agendaItems) && draft.agendaItems.length) {
      items = draft.agendaItems.filter(i => String(i).trim().length > 1);
    }
  }

  if (!items.length && m.agendaText) {
    // Last resort: parse raw agendaText line by line
    const rawLines = m.agendaText.split('\n').map(l => l.trim()).filter(Boolean);
    items = rawLines
      .map(l => l.replace(/^[\d]+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim())
      .filter(l => l.length > 1);
  }

  if (!items.length) return '';

  // S._meetingAgendaOutcomes holds in-memory state for the current session.
  // It is keyed by meeting id so it survives tab switches within the same session.
  if (!S._meetingAgendaOutcomes) S._meetingAgendaOutcomes = {};
  if (!S._meetingAgendaOutcomes[m.id]) {
    // Pre-populate from any previously saved outcomes if the linked draft is loaded.
    const draft = (S.agendaBuilderDraftsHistory || []).find(d => d.linkedMeetingId === m.id);
    const savedOutcomes = Array.isArray(draft?.agendaOutcomes) ? draft.agendaOutcomes : [];
    S._meetingAgendaOutcomes[m.id] = {};
    for (const o of savedOutcomes) {
      if (o.topic) S._meetingAgendaOutcomes[m.id][o.topic] = o.status;
    }
  }
  // S._meetingOutcomeSuggestions holds AI-suggested outcomes per meeting (topic → {status, confidence, rationale})
  if (!S._meetingOutcomeSuggestions) S._meetingOutcomeSuggestions = {};
  const outcomes = S._meetingAgendaOutcomes[m.id];
  const suggestions = S._meetingOutcomeSuggestions[m.id] || {};

  const STATUS_OPTIONS = [
    { value: 'resolved',      label: '✅ Resolved',      color: '#16a34a' },
    { value: 'carry_forward', label: '🔁 Carry Forward', color: '#d97706' },
    { value: 'not_discussed', label: '⏭️ Not Discussed', color: '#6b7280' },
  ];

  const rowsHtml = items.map((item, i) => {
    const cur = outcomes[item] || '';
    const sug = suggestions[item];
    return `
      <div class="k-outcome-row" id="km-outcome-row-${i}">
        <div class="k-outcome-topic">${esc(item)}${outcomeConfidenceBadge(sug, cur)}</div>
        <div class="k-outcome-btns">
          ${STATUS_OPTIONS.map(o => `
            <button class="kbtn kbtn-sm ${cur === o.value ? 'kbtn-primary' : 'kbtn-ghost'}"
              style="${cur === o.value ? `background:${o.color};border-color:${o.color}` : ''}"
              onclick="Kpsc.abSetOutcome(${esc(JSON.stringify(m.id))},${esc(JSON.stringify(item))},${esc(JSON.stringify(o.value))},${i})"
            >${esc(o.label)}</button>
          `).join('')}
        </div>
      </div>`;
  }).join('');

  const doneCount = items.filter(t => outcomes[t]).length;
  const allDone = doneCount === items.length;
  const hasTranscriptOrMinutes = !!(m.transcriptText || m.minutesMarkdown);

  return `
    <details class="k-collapsible" ${!allDone ? 'open' : ''} style="margin-top:16px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <summary class="k-collapsible-hdr" style="padding:12px 14px;background:var(--card);cursor:pointer">
        <span class="k-collapsible-title" style="font-size:14px;font-weight:600">
          🏁 Post-Meeting Closure — Agenda Outcomes
          <span class="kbadge ${allDone ? 'badge-green' : 'badge-amber'}" style="margin-left:8px">${doneCount}/${items.length} marked</span>
        </span>
      </summary>
      <div style="padding:12px 14px 16px;background:var(--surface,#f8fafc)">
        <p class="k-hint" style="margin:0 0 10px;font-size:12px">Mark each agenda item's outcome. Carry-forward items will appear at the top of the next meeting's Agenda Builder.</p>
        ${hasTranscriptOrMinutes ? `
        <div style="margin-bottom:12px">
          <button class="kbtn kbtn-sm kbtn-ai" id="km-ai-outcomes-btn" onclick="Kpsc.abAiAnalyseOutcomes(${esc(JSON.stringify(m.id))},this)">
            🤖 AI Analyse Outcomes from Minutes
          </button>
          <span id="km-ai-outcomes-status" style="font-size:12px;color:var(--text3);margin-left:8px"></span>
        </div>` : ''}
        <div id="km-outcomes-list">
          ${rowsHtml}
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="kbtn kbtn-primary" onclick="Kpsc.abSaveOutcomes(${esc(JSON.stringify(m.id))},this)" id="km-save-outcomes-btn">
            💾 Save Outcomes
          </button>
          ${allDone ? '<span class="k-hint" style="font-size:12px;color:var(--success,#16a34a)">✅ All outcomes saved — carry-forward items will appear in the next meeting\'s agenda.</span>' : ''}
        </div>
      </div>
    </details>`;
}

function renderMinutesPanel(m) {
  if (!m?.minutesMarkdown) return '';
  const reviewed = !!m.reviewedAt;
  const publicUrl = m.publicShareToken ? `${window.location.origin}/kpsc/minutes/?token=${encodeURIComponent(m.publicShareToken)}` : '';

  return `
    <section class="k-section k-minutes-section">
      <h3 class="k-sec-title">Meeting Minutes</h3>
      ${m.summaryShort ? `<div class="k-summary">${esc(m.summaryShort)}</div>` : ''}
      ${m.summaryLong ? `<details class="k-summary-detail"><summary>Detailed summary — click to expand</summary><pre>${esc(m.summaryLong)}</pre></details>` : ''}

      ${renderReviewPanel(m)}

      <div id="k-minutes-actions" class="k-room-actions" style="margin-bottom:4px;margin-top:16px">
        ${minutesActionsHtml(m)}
      </div>
      <p id="k-minutes-review-hint" class="k-hint" style="margin-top:4px;margin-bottom:12px;${reviewed ? 'display:none' : ''}">Approve and save the review first before printing or sharing minutes.</p>
      ${m.publicShareToken ? `<div class="k-hint" style="margin-top:-4px;margin-bottom:12px">Public minutes link is active: <a href="${esc(publicUrl)}" target="_blank" rel="noopener noreferrer">${esc(publicUrl)}</a></div>` : ''}

      <details class="k-collapsible">
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">📄 Minutes Preview</span>
          <span class="k-collapsible-summary">${reviewed ? '✓ Approved — click to expand' : 'Draft — click to expand'}</span>
        </summary>
        <div class="k-minutes-body" id="minutes-body-${m.id}">${minutesHtml(m.minutesMarkdown)}</div>
        <div class="k-plain-english-indicator" id="pe-indicator-${m.id}" style="display:none;font-size:0.9em;color:#666;margin-top:8px;padding:8px;background:#f5f5f5;border-radius:4px;">📖 Showing plain English version</div>
      </details>

      ${renderInsightsReviewSection(m)}
    </section>`;
}


function readReviewResolutions() {
  return (S.activeMeeting?.resolutions || []).map((r, i) => {
    const approvedRaw = document.getElementById(`kr-res-approved-${i}`)?.value || 'null';
    return {
      ...r,
      text: document.getElementById(`kr-res-text-${i}`)?.value.trim() || '',
      resolutionType: document.getElementById(`kr-res-type-${i}`)?.value.trim() || 'decision',
      category: document.getElementById(`kr-res-category-${i}`)?.value.trim() || 'other',
      approved: approvedRaw === 'true' ? true : approvedRaw === 'false' ? false : null,
      amount: document.getElementById(`kr-res-amount-${i}`)?.value.trim() || '',
      voteSummary: document.getElementById(`kr-res-vote-${i}`)?.value.trim() || '',
    };
  }).filter(r => r.text);
}

function readReviewActions() {
  return (S.activeMeeting?.actionItems || []).map((a, i) => ({
    ...a,
    task: document.getElementById(`kr-act-task-${i}`)?.value.trim() || '',
    assignee: document.getElementById(`kr-act-assignee-${i}`)?.value.trim() || 'Unassigned',
    dueDate: document.getElementById(`kr-act-due-${i}`)?.value.trim() || '',
    status: document.getElementById(`kr-act-status-${i}`)?.value || 'pending',
  })).filter(a => a.task);
}

async function saveMinutesReview(btn) {
  if (!S.activeMeeting) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    // MISSING-05: auto-save insights if the insights edit form is currently open
    const insightsEditForm = document.querySelector('#k-insights-review .kbtn[onclick*="saveInsightsReview"]');
    if (insightsEditForm) {
      try { await saveInsightsReview(insightsEditForm); } catch (_) { /* non-blocking — proceed with approval */ }
    }
    const reviewedAt = new Date().toISOString();
    const res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
      summaryShort: document.getElementById('kr-summary-short')?.value || '',
      summaryLong: document.getElementById('kr-summary-long')?.value || '',
      minutesMarkdown: document.getElementById('kr-minutes')?.value || '',
      resolutions: readReviewResolutions(),
      actionItems: readReviewActions(),
      policyFlags: S.activeMeeting.policyFlags || [],
      reviewedAt,
      reviewedBy: S.user?.name || '',
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    S.activeMeeting = { ...res };
    S._reviewEditMode = false;
    persistMeetingUiState();
    // Re-render review panel in-place.
    const panel = document.getElementById('kr-panel');
    if (panel) {
      panel.outerHTML = renderReviewPanel(S.activeMeeting);
    } else {
      renderPage('meeting');
    }
    // Unlock Print / Share buttons immediately — no need to leave and return.
    const actionsEl = document.getElementById('k-minutes-actions');
    if (actionsEl) actionsEl.innerHTML = minutesActionsHtml(S.activeMeeting);
    const hintEl = document.getElementById('k-minutes-review-hint');
    if (hintEl) hintEl.style.display = 'none';
    showToast('Review approved and saved', 'success');

    // Trigger AI reconciliation of insights against the approved minutes in the background
    const approvedMinutes = res.minutesMarkdown || document.getElementById('kr-minutes')?.value || '';
    const hasInsights = (res.resolutions?.length || res.actionItems?.length || res.policyFlags?.length);
    if (approvedMinutes && hasInsights) {
      showToast('Reconciling insights with approved minutes…', 'info');
      reconcileInsightsAfterApproval(S.activeMeeting.id, approvedMinutes).catch(() => {
        showToast('Background AI analysis failed — you can continue, but insights may not reflect the latest minutes.', 'warn');
      });
    }

    // Auto-analyze agenda outcomes from approved minutes (best-effort)
    const hasAgendaItems = (Array.isArray(res.agendaItems) && res.agendaItems.length) || res.agendaText;
    if (approvedMinutes && hasAgendaItems) {
      const outcomesBtn = document.getElementById('km-ai-outcomes-btn');
      if (outcomesBtn) {
        showToast('Analysing agenda outcomes…', 'info');
        abAiAnalyseOutcomes(S.activeMeeting.id, outcomesBtn).catch(() => {
          showToast('Background AI analysis failed — you can continue, but insights may not reflect the latest minutes.', 'warn');
        });
      }
    }
  } catch {
    showToast('Review save failed. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function reconcileInsightsAfterApproval(meetingId, minutesMarkdown) {
  try {
    const result = await apiPost(`ai-secretary-meetings/${meetingId}/reconcile-insights`, { minutesMarkdown });
    if (!result || result.error) return;
    const changes = String(result.changes || '').trim();
    const noChange = !changes || changes.toLowerCase().includes('no changes');
    if (noChange) {
      showToast('Insights verified against approved minutes ✓', 'success');
      return;
    }
    // Apply AI-updated insights to the active meeting
    S.activeMeeting = {
      ...S.activeMeeting,
      resolutions:       result.resolutions       ?? S.activeMeeting.resolutions,
      actionItems:       result.actionItems        ?? S.activeMeeting.actionItems,
      policyFlags:       result.policyFlags        ?? S.activeMeeting.policyFlags,
      suggestedProjects: result.suggestedProjects  ?? S.activeMeeting.suggestedProjects,
    };
    if (S.meetings?.length) S.meetings = S.meetings.map(m => m.id === meetingId ? S.activeMeeting : m);
    // Re-render insights card view with the updated data
    const irSection = document.getElementById('k-insights-review');
    if (irSection) irSection.outerHTML = renderInsightsReviewSavedView(S.activeMeeting);
    showToast('AI updated resolutions and action items based on approved minutes. Review in the Insights tab.', 'success');
  } catch (err) { throw err; /* propagate so caller can show error toast */ }
}

function openReviewEditor() {
  S._reviewEditMode = true;
  persistMeetingUiState();
  const panel = document.getElementById('kr-panel');
  if (panel && S.activeMeeting) {
    panel.outerHTML = renderReviewPanel(S.activeMeeting);
  } else if (S.activeMeeting) {
    renderPage('meeting');
  }
}

function updateMinutesPreview() {
  const md = document.getElementById('kr-minutes')?.value || '';
  const preview = document.getElementById('kr-minutes-preview');
  if (preview) preview.innerHTML = minutesHtml(md);
}

async function aiProofreadMinutes(btn) {
  if (!S.activeMeeting) return;
  const minutesMarkdown = document.getElementById('kr-minutes')?.value || '';
  const secretaryNotes  = (document.getElementById('kr-secretary-notes')?.value || '').trim();
  const summaryShort    = document.getElementById('kr-summary-short')?.value || '';
  const summaryLong     = document.getElementById('kr-summary-long')?.value  || '';
  if (!minutesMarkdown.trim()) { showToast('No minutes draft to proofread.', 'error'); return; }

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'AI is proofreading…';
  try {
    const res = await apiPost(`ai-secretary-meetings/${S.activeMeeting.id}/ai-proofread`, {
      minutesMarkdown, secretaryNotes, summaryShort, summaryLong,
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    document.getElementById('kr-minutes').value = res.minutesMarkdown;
    updateMinutesPreview();
    if (secretaryNotes) document.getElementById('kr-secretary-notes').value = '';
    let summariesChanged = false;
    if (res.summaryShort && res.summaryShort !== summaryShort) {
      document.getElementById('kr-summary-short').value = res.summaryShort;
      if (S.activeMeeting) S.activeMeeting.summaryShort = res.summaryShort;
      summariesChanged = true;
    }
    if (res.summaryLong && res.summaryLong !== summaryLong) {
      document.getElementById('kr-summary-long').value = res.summaryLong;
      if (S.activeMeeting) S.activeMeeting.summaryLong = res.summaryLong;
      summariesChanged = true;
    }
    const msg = secretaryNotes
      ? (summariesChanged ? 'Notes integrated — minutes and summaries updated ✓' : 'Notes integrated and minutes polished ✓')
      : (summariesChanged ? 'Minutes and summaries updated ✓' : 'Minutes polished ✓');
    showToast(msg, 'success');
  } catch {
    showToast('AI proofread failed. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

/**
 * AI grammar and punctuation check for the current meeting minutes.
 * Sends the minutes to the AI proofread endpoint with `grammarOnly: true` so the
 * AI corrects ONLY language errors (spelling, grammar, punctuation) without
 * changing any factual content, names, amounts, or structure.
 * Summaries are updated only if they contain grammar errors.
 *
 * @param {HTMLButtonElement} btn  The clicked button (disabled during the request)
 */
async function aiGrammarCheck(btn) {
  if (!S.activeMeeting) return;
  const minutesMarkdown = document.getElementById('kr-minutes')?.value || '';
  const summaryShort    = document.getElementById('kr-summary-short')?.value || '';
  const summaryLong     = document.getElementById('kr-summary-long')?.value  || '';
  if (!minutesMarkdown.trim()) { showToast('No minutes draft to check.', 'error'); return; }

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking grammar…';
  try {
    const res = await apiPost(`ai-secretary-meetings/${S.activeMeeting.id}/ai-proofread`, {
      minutesMarkdown, secretaryNotes: '', summaryShort, summaryLong, grammarOnly: true,
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    document.getElementById('kr-minutes').value = res.minutesMarkdown;
    updateMinutesPreview();
    let summariesChanged = false;
    if (res.summaryShort && res.summaryShort !== summaryShort) {
      document.getElementById('kr-summary-short').value = res.summaryShort;
      if (S.activeMeeting) S.activeMeeting.summaryShort = res.summaryShort;
      summariesChanged = true;
    }
    if (res.summaryLong && res.summaryLong !== summaryLong) {
      document.getElementById('kr-summary-long').value = res.summaryLong;
      if (S.activeMeeting) S.activeMeeting.summaryLong = res.summaryLong;
      summariesChanged = true;
    }
    const msg = summariesChanged ? 'Grammar corrected — minutes and summaries updated ✓' : 'Grammar and punctuation corrected ✓';
    showToast(msg, 'success');
  } catch {
    showToast('Grammar check failed. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── SECRETARY NOTES — UPLOAD & VOICE RECORD ──────────────────────

const KrVoice = { mediaRecorder: null, chunks: [], stream: null };

async function krNotesUploadPhoto(input) {
  const files = getSelectedImageFiles(input);
  if (!files.length) return;
  const statusEl = document.getElementById('kr-notes-upload-status');
  if (statusEl) statusEl.innerHTML = `<div class="k-loading" style="padding:10px 0">🤖 Reading handwritten notes…</div>`;
  try {
    const ocr = await ocrNotesImages(files);
    if (!ocr.transcript) {
      if (statusEl) statusEl.innerHTML = `<div class="k-error-box">${esc(ocr.errors[0] || 'Could not read the image. Please use a clear, well-lit photo.')}</div>`;
      return;
    }
    const ta = document.getElementById('kr-secretary-notes');
    if (ta) ta.value = (ta.value ? ta.value + '\n' : '') + ocr.transcript;
    const note = ocr.errors.length ? ` (${ocr.errors.length} photo(s) skipped)` : '';
    if (statusEl) statusEl.innerHTML = `<div class="k-sn-success">✓ Text extracted from ${ocr.successCount} photo(s)${note}. Review and edit above before running AI Proofread.</div>`;
    input.value = '';
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<div class="k-error-box">Error: ${esc(e.message)}</div>`;
  }
}

async function krNotesToggleVoice(btn) {
  if (KrVoice.mediaRecorder && KrVoice.mediaRecorder.state === 'recording') {
    KrVoice.mediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Microphone not available on this device.', 'error'); return;
  }
  const statusEl = document.getElementById('kr-voice-status');
  try {
    KrVoice.chunks = [];
    KrVoice.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    KrVoice.mediaRecorder = new MediaRecorder(KrVoice.stream, mimeType ? { mimeType } : undefined);
    KrVoice.mediaRecorder.ondataavailable = e => { if (e.data?.size > 0) KrVoice.chunks.push(e.data); };
    KrVoice.mediaRecorder.onstop = () => krNotesTranscribeVoice(btn, statusEl);
    KrVoice.mediaRecorder.start(250);
    btn.textContent = '⏹ Stop recording';
    btn.classList.add('kbtn-recording');
    if (statusEl) statusEl.textContent = '● Recording…';
  } catch (e) {
    showToast('Could not access microphone: ' + e.message, 'error');
  }
}

async function krNotesTranscribeVoice(btn, statusEl) {
  KrVoice.stream?.getTracks().forEach(t => t.stop());
  btn.textContent = '🎙 Record voice';
  btn.classList.remove('kbtn-recording');
  if (statusEl) statusEl.textContent = 'Transcribing…';
  try {
    const blob = new Blob(KrVoice.chunks, { type: KrVoice.mediaRecorder?.mimeType || 'audio/webm' });
    const form = new FormData();
    form.append('audio', blob, 'notes.webm');
    form.append('mimeType', blob.type);
    const res = await fetch(`${API}/kpsc-transcribe-audio`, {
      method: 'POST',
      headers: { ...kpscSessionHeader() },
      body: form,
    }).then(r => r.json());
    if (res?.error || !res?.transcript) {
      if (statusEl) statusEl.textContent = '';
      showToast(res?.error || 'Transcription returned empty. Please try again.', 'error');
      return;
    }
    const ta = document.getElementById('kr-secretary-notes');
    if (ta) ta.value = (ta.value ? ta.value + '\n' : '') + res.transcript.trim();
    if (statusEl) statusEl.textContent = '✓ Voice transcribed';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3500);
  } catch (e) {
    if (statusEl) statusEl.textContent = '';
    showToast('Voice transcription failed: ' + e.message, 'error');
  }
}

// ── DRAFT AUTO-SAVE ───────────────────────────────────────────────
// Debounced auto-save for the Meeting Room form. The first change on a
// brand-new draft triggers a POST (creating the row); subsequent changes
// PUT. While a save is in flight, further edits flip a dirty flag and
// fire one more save when the inflight one returns.
const AUTOSAVE_DEBOUNCE_MS = 1500;
const Draft = {
  timer: null,
  inflight: false,
  dirty: false,
  meetingId: null,   // matches S.activeMeeting?.id when bound; used to detect re-bind
  pendingId: null,   // stable client-generated ID for the in-progress first POST of a new meeting
};

function setAutoSaveStatus(text, kind) {
  const el = document.getElementById('km-autosave-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind || '';
}

function scheduleAutoSave() {
  // Skip auto-save for locked meetings (form is readonly anyway).
  if (S.activeMeeting?.status === 'processed' || S.activeMeeting?.status === 'ended') return;
  clearTimeout(Draft.timer);
  setAutoSaveStatus('Unsaved changes…', 'pending');
  Draft.timer = setTimeout(() => { autoSaveNow(); }, AUTOSAVE_DEBOUNCE_MS);
}

async function autoSaveNow() {
  if (S.activeMeeting?.status === 'processed' || S.activeMeeting?.status === 'ended') return;
  if (Draft.inflight) { Draft.dirty = true; return; }
  Draft.inflight = true;
  Draft.dirty = false;
  setAutoSaveStatus('Saving…', 'pending');

  const title = document.getElementById('km-title')?.value.trim() || 'KPSC Meeting';
  const date  = document.getElementById('km-date')?.value  || today();
  const type  = document.getElementById('km-type')?.value  || 'routine';
  const trans = document.getElementById('km-transcript')?.value || '';
  const status = document.getElementById('km-status')?.value || 'draft';
  const participants = readAttendance();
  const scheduledFor = document.getElementById('km-scheduled-for')?.value || null;
  const venue = document.getElementById('km-venue')?.value.trim() || '';
  const agendaText = document.getElementById('km-agenda')?.value?.trim() ?? undefined;

  try {
    let res;
    if (S.activeMeeting) {
      res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
        title, meetingDate: date, meetingType: type, status, transcriptText: trans, participants, scheduledFor, venue,
        ...(agendaText !== undefined ? { agendaText } : {}),
      });
    } else {
      // Include a stable client-generated ID on the first POST. This makes the
      // create idempotent: if the network drops and the request is retried, the
      // server's INSERT OR IGNORE prevents a duplicate row being created.
      if (!Draft.pendingId) {
        Draft.pendingId = 'AIM-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      }
      res = await apiPost('ai-secretary-meetings', {
        id: Draft.pendingId,
        title, meetingDate: date, meetingType: type, status, transcriptText: trans, participants,
        createdBy: S.user?.name || '', scheduledFor, venue,
      });
    }
    if (res?.error) {
      setAutoSaveStatus(`Save failed: ${res.error}`, 'error');
    } else {
      const wasNew = !Draft.meetingId;
      const prevPendingId = Draft.pendingId;
      S.activeMeeting = res;
      Draft.meetingId = res.id;
      Draft.pendingId = null; // ID is now committed; subsequent saves will use PUT
      S._isNewMeeting = false;
      persistMeetingUiState();
      setAutoSaveStatus(`Saved · ${fmtClock(new Date())}`, 'ok');
      // Server now has the transcript — drop the local safety buffer for
      // both the pending and committed IDs (they can differ on the very
      // first save when the server assigns a fresh ID). Skip the clear
      // if the user kept typing while the save was in flight; the dirty
      // flag will trigger another save and we want the buffer to survive
      // until that one also lands.
      if (!Draft.dirty) {
        clearTranscriptBuffer(res.id);
        if (prevPendingId && prevPendingId !== res.id) clearTranscriptBuffer(prevPendingId);
      } else {
        // Refresh the buffer with the latest text so it covers the new edits.
        saveTranscriptBuffer();
      }
      // First save: meeting now has a DB id — inject End Meeting button into the
      // already-rendered action bar so upload-only secretaries can advance the meeting
      // without a full page re-render (which would discard any file input selections).
      if (wasNew && res.status === 'draft') {
        const actBar = document.querySelector('.k-room-actions');
        if (actBar && !document.getElementById('km-end-meeting-btn')) {
          const endBtn = document.createElement('button');
          endBtn.id = 'km-end-meeting-btn';
          endBtn.className = 'kbtn kbtn-amber';
          endBtn.setAttribute('onclick', 'Kpsc.endMeeting(this)');
          endBtn.textContent = '🔒 End Meeting';
          actBar.appendChild(endBtn);
        }
      }
    }
  } catch {
    setAutoSaveStatus('Offline — will retry on next change', 'error');
  } finally {
    Draft.inflight = false;
    if (Draft.dirty) autoSaveNow();
  }
}

function fmtClock(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function bindAutoSave() {
  clearTimeout(Draft.timer);
  Draft.timer = null;
  Draft.inflight = false;
  Draft.dirty = false;
  Draft.meetingId = S.activeMeeting?.id || null;
  // If we're opening an existing meeting, discard any leftover pendingId from a
  // prior new-meeting session so we never accidentally POST with a stale ID.
  if (S.activeMeeting) Draft.pendingId = null;

  const fire = () => { scheduleAutoSave(); updateCollapsibleSummaries(); persistMeetingUiState(); };
  const fireDetailChange = () => {
    setAutoSaveStatus('Meeting details changed… saving…', 'pending');
    fire();
  };
  const form = document.getElementById('km-title')?.closest('.k-page');
  if (!form) return;
  for (const sel of ['#km-title', '#km-transcript']) {
    const el = form.querySelector(sel);
    if (el) el.addEventListener('input', fire);
  }
  for (const sel of ['#km-date', '#km-type', '#km-scheduled-for']) {
    const el = form.querySelector(sel);
    if (el) el.addEventListener('change', fireDetailChange);
  }
  const att = form.querySelector('#km-attendance');
  if (att) {
    att.addEventListener('change', fire);
    att.addEventListener('input', fire);
  }
}

function updateCollapsibleSummaries() {
  const detailsSum = document.getElementById('km-details-summary');
  if (detailsSum) {
    const title = document.getElementById('km-title')?.value.trim() || 'KPSC Meeting';
    const date  = document.getElementById('km-date')?.value || today();
    const type  = document.getElementById('km-type')?.value || 'routine';
    const typeLabel = (MEETING_TYPES.find(t => t.value === type) || {}).label || '';
    detailsSum.textContent = `${title} · ${fmtDate(date)} · ${typeLabel}`;
  }
  const attSum = document.getElementById('km-attendance-summary');
  if (attSum) {
    const present = readAttendance().filter(p => p.present).length;
    attSum.textContent = `${present} present of ${S.members.length}`;
  }
}

// ── TRANSCRIPT BUFFER & PROGRESS HELPERS ──────────────────────────
// AI flows (audio upload transcription, OCR, diarization) update the
// transcript textarea programmatically. Programmatic value changes do
// not fire 'input' events, so the existing autosave never sees them.
// appendTranscriptText() is the single funnel for those writes: it
// mirrors the result to localStorage (so a poor-network save can't
// silently lose the text) and then triggers autoSaveNow() to push to
// the server immediately rather than after the 1.5 s debounce.
const TRANSCRIPT_BUFFER_PREFIX = 'kpsc:transcript-buffer:';

function transcriptBufferKey(idOverride) {
  const id = idOverride || S.activeMeeting?.id || Draft.pendingId || Draft.meetingId;
  return id ? TRANSCRIPT_BUFFER_PREFIX + id : '';
}

function saveTranscriptBuffer() {
  const key = transcriptBufferKey();
  if (!key) return;
  const el = document.getElementById('km-transcript');
  if (!el) return;
  try { localStorage.setItem(key, el.value || ''); } catch (_) { /* quota — ignore */ }
}

function readTranscriptBuffer(id) {
  if (!id) return '';
  try { return localStorage.getItem(TRANSCRIPT_BUFFER_PREFIX + id) || ''; } catch (_) { return ''; }
}

function clearTranscriptBuffer(id) {
  if (!id) return;
  try { localStorage.removeItem(TRANSCRIPT_BUFFER_PREFIX + id); } catch (_) { /* noop */ }
}

// Append text to the transcript textarea, mirror to the local buffer,
// and persist to the server immediately. Use this for every
// programmatic append (audio transcription, OCR, diarization apply).
function appendTranscriptText(text) {
  const el = document.getElementById('km-transcript');
  if (!el || !text) return;
  el.value = (el.value ? el.value + '\n\n' : '') + String(text);
  saveTranscriptBuffer();
  // Fire-and-forget — runs the network call now without blocking the UI.
  try { autoSaveNow(); } catch (_) { /* noop */ }
}

// On meeting-room render, if our local buffer is longer than what the
// server returned (i.e. an earlier autosave didn't make it), restore
// the buffered text into the textarea and re-trigger a save. Without
// this, navigating away after an AI append could appear to "lose" the
// transcript on return.
function restoreTranscriptFromBuffer() {
  const id = S.activeMeeting?.id || Draft.pendingId;
  if (!id) return;
  const buf = readTranscriptBuffer(id);
  if (!buf) return;
  const el = document.getElementById('km-transcript');
  if (!el) return;
  if (buf.length > (el.value || '').length) {
    el.value = buf;
    showToast('Restored unsaved transcript from this device.', 'info');
    // Best-effort flush so the server now reflects what's on screen.
    setTimeout(() => { try { autoSaveNow(); } catch (_) {} }, 300);
  } else if (buf === el.value) {
    // Server caught up; safe to clear local copy.
    clearTranscriptBuffer(id);
  }
}

// ── TRANSCRIBE PROGRESS UI ────────────────────────────────────────
function formatDurationSec(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function formatBytesPerSec(bps) {
  if (!isFinite(bps) || bps <= 0) return '';
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(2)} MB/s`;
}

function renderTranscribeProgress(statusEl, opts) {
  if (!statusEl) return;
  const { stage, message, percent, elapsedSec, etaSec, sub, kind } = opts || {};
  const accent = kind === 'warn' ? '#92400e' : (kind === 'error' ? '#991b1b' : '#0369a1');
  const bg     = kind === 'warn' ? '#fffbeb' : (kind === 'error' ? '#fef2f2' : '#f0f9ff');
  const border = kind === 'warn' ? '#fcd34d' : (kind === 'error' ? '#fca5a5' : '#bae6fd');
  const bar = percent != null ? `
    <div class="k-progress-row" style="margin-top:8px">
      <div class="k-progress-bar-bg"><div class="k-progress-bar" style="width:${Math.max(0, Math.min(100, percent))}%"></div></div>
      <div class="k-progress-label">${Math.round(percent)}%</div>
    </div>` : `
    <div class="k-indeterminate-bar" style="margin-top:8px" aria-hidden="true"><span></span></div>`;
  statusEl.innerHTML = `
    <div role="status" aria-live="polite" style="background:${bg};border:1px solid ${border};border-radius:10px;padding:14px;font-size:13px;line-height:1.5">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="font-weight:600;color:${accent}">${stage || ''}</div>
        ${elapsedSec != null ? `<div style="font-size:12px;color:${accent};opacity:.85">⏱ ${formatDurationSec(elapsedSec)}${etaSec != null && etaSec > 0 ? ` · est. ${formatDurationSec(etaSec)} left` : ''}</div>` : ''}
      </div>
      ${bar}
      ${message ? `<div style="margin-top:8px;font-size:12px;color:${accent}">${message}</div>` : ''}
      ${sub ? `<div style="margin-top:4px;font-size:11px;color:#64748b">${sub}</div>` : ''}
    </div>`;
}

// XHR-based upload so we can surface a real upload-progress %.
function uploadAudioXhr(endpoint, audioFile, mimeType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('audio', audioFile, audioFile.name);
    form.append('mimeType', mimeType || audioFile.type || 'audio/webm');
    xhr.open('POST', `${API}/${endpoint}`);
    for (const [k, v] of Object.entries(kpscSessionHeader())) xhr.setRequestHeader(k, v);
    xhr.timeout = 5 * 60 * 1000; // 5 minutes — covers ~25 MB on a 1 Mbps link
    xhr.upload.onprogress = e => {
      if (onProgress) onProgress({ loaded: e.loaded, total: e.lengthComputable ? e.total : audioFile.size });
    };
    xhr.upload.onload = () => {
      // Upload finished — fire one last 100% tick then let onload below handle the response.
      if (onProgress) onProgress({ loaded: audioFile.size, total: audioFile.size, uploaded: true });
    };
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText || '{}')); }
      catch (_) { reject(new Error('Server returned an unreadable response.')); }
    };
    xhr.onerror   = () => reject(new Error('Network error during upload.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Check your connection and try again.'));
    xhr.onabort   = () => reject(new Error('Upload was cancelled.'));
    xhr.send(form);
  });
}

// Wrap uploadAudioXhr with exponential backoff retries for transient
// network errors — important on the patchy mobile data this portal is
// often used over. Server-side errors (anything that returned a JSON
// body) are NOT retried — the caller handles them.
async function uploadAudioWithRetry(endpoint, audioFile, mimeType, onProgress, onRetry) {
  const backoff = [2000, 4000, 8000, 16000];
  let lastErr;
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    try {
      return await uploadAudioXhr(endpoint, audioFile, mimeType, onProgress);
    } catch (e) {
      lastErr = e;
      // If the user navigated away or hit cancel, don't keep retrying.
      const msg = String(e?.message || '');
      if (msg.includes('cancelled')) throw e;
      if (attempt >= backoff.length) break;
      const waitMs = backoff[attempt];
      if (onRetry) onRetry(attempt + 1, backoff.length + 1, waitMs, e);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr || new Error('Upload failed after multiple retries.');
}

// ── MEETING ACTIONS ───────────────────────────────────────────────
async function deleteMeeting(id, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  const m = S.meetings.find(x => x.id === id);
  if (!m) return;
  const role = String(S.user?.role || '').toLowerCase();
  const isAdmin = role === 'acting_chairman' || role === 'general_secretary' || role === 'it_admin';
  const isAuthor = isMeetingAuthor(m);
  const authorCanDelete = isAuthor && (m.status === 'draft' || m.status === 'recording');
  if (!isAdmin && !authorCanDelete) {
    showToast(
      isAuthor
        ? 'Authors can only delete meetings that are still in draft or recording phase.'
        : 'Only the meeting author, Acting Chairman, General Secretary, or IT Administrator can delete this meeting.',
      'error'
    );
    return;
  }
  const publicLinkWarning = m.publicShareToken ? ' This meeting currently has a public minutes link; deleting it will immediately break that shared link.' : '';
  if (!confirm(`Delete "${m.title || 'this meeting'}"? This action cannot be undone.${publicLinkWarning}`)) return;
  // No need to forward userName/userRole in the body — the session header carries
  // the verified identity and the server reads it from the authenticated session.
  const res = await apiDelete(`ai-secretary-meetings/${id}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  clearMeetingUiState(id);
  clearTranscriptBuffer(id);
  S.meetings = S.meetings.filter(x => x.id !== id);
  _dashCache.ts = 0; // invalidate dashboard cache
  const main = document.getElementById('kpsc-main');
  if (main) await renderDashboard(main);
  showToast('Meeting deleted.', 'success');
}

// Called from the Discard button inside the meeting room itself.
// For an unsaved new meeting: resets draft state and navigates back.
// For a saved draft/recording meeting: soft-deletes via API then navigates back.
async function discardMeetingFromRoom() {
  const m = S.activeMeeting;
  if (!m) {
    // Brand-new, never-saved meeting — just cancel and go back.
    clearMeetingUiState(Draft.pendingId);
    clearTranscriptBuffer(Draft.pendingId);
    Draft.pendingId = null;
    S._isNewMeeting = false;
    goBack();
    return;
  }
  if (!canDeleteMeeting(m)) {
    showToast('You do not have permission to discard this meeting.', 'error');
    return;
  }
  const publicLinkWarning = m.publicShareToken ? ' This meeting currently has a public minutes link; discarding it will immediately break that shared link.' : '';
  if (!confirm(`Discard "${m.title || 'this meeting'}"? This action cannot be undone.${publicLinkWarning}`)) return;
  const res = await apiDelete(`ai-secretary-meetings/${m.id}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  clearMeetingUiState(m.id);
  clearTranscriptBuffer(m.id);
  S.meetings = S.meetings.filter(x => x.id !== m.id);
  S.activeMeeting = null;
  Draft.pendingId = null;
  showToast('Meeting discarded.', 'success');
  goBack();
}

async function saveMeeting(btn) {
  const title = document.getElementById('km-title')?.value.trim() || 'KPSC Meeting';
  const date  = document.getElementById('km-date')?.value  || today();
  const type  = document.getElementById('km-type')?.value  || 'routine';
  const trans = document.getElementById('km-transcript')?.value || '';
  const rawStatus = document.getElementById('km-status')?.value || 'draft';
  const agendaText = document.getElementById('km-agenda')?.value?.trim() ?? undefined;

  // Preserve draft→recording transitions from the Start Meeting control, including new meetings.
  const status = rawStatus;
  const participants = readAttendance();
  const venue = document.getElementById('km-venue')?.value.trim() || '';

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    let res;
    if (S.activeMeeting) {
      res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
        title, meetingDate: date, meetingType: type, status, transcriptText: trans, participants, venue,
        ...(agendaText !== undefined ? { agendaText } : {}),
      });
    } else {
      res = await apiPost('ai-secretary-meetings', {
        title, meetingDate: date, meetingType: type, status, transcriptText: trans, participants,
        createdBy: S.user?.name || '', venue,
      });
    }
    if (res.error) { showToast(res.error, 'error'); return; }
    S.activeMeeting = res;
    S._isNewMeeting = false;
    document.getElementById('kpsc-page-title').textContent = 'Meeting Room';
    document.getElementById('km-status').value = res.status;
    updateStepperUI(res.status);
    showToast('Saved successfully', 'success');
  } catch {
    showToast('Save failed. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function endMeeting(btn) {
  if (!S.activeMeeting) { showToast('Save the meeting first.', 'error'); return; }
  if (!confirm('Mark this meeting as ended? Meeting details, attendance, transcript, and uploads will become read-only after this step.')) return;

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Ending…';

  // Stop recording if active
  if (Rec.status === 'recording' || Rec.status === 'paused') recStop();

  try {
    const trans = document.getElementById('km-transcript')?.value || S.activeMeeting.transcriptText || '';
    const participants = readAttendance();
    const title = document.getElementById('km-title')?.value.trim() || S.activeMeeting.title || 'KPSC Meeting';
    const meetingDate = document.getElementById('km-date')?.value || S.activeMeeting.meetingDate || today();
    const meetingType = document.getElementById('km-type')?.value || S.activeMeeting.meetingType || 'routine';
    const venue = document.getElementById('km-venue')?.value.trim() ?? S.activeMeeting.venue ?? '';
    const agendaText = document.getElementById('km-agenda')?.value?.trim() ?? S.activeMeeting.agendaText ?? undefined;
    const res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
      status: 'ended',
      endedAt: new Date().toISOString(),
      transcriptText: trans,
      participants,
      title,
      meetingDate,
      meetingType,
      venue,
      ...(agendaText !== undefined ? { agendaText } : {}),
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    S.activeMeeting = res;
    _dashCache.ts = 0; // invalidate dashboard cache
    renderPage('meeting');
  } catch {
    showToast('Failed to end meeting. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function processMeeting(btn) {
  if (!S.activeMeeting) return;
  if (!confirm('Generate AI minutes for this meeting? This may take 1–2 minutes and cannot be undone.')) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating minutes…';

  // Show a progress status message below the button
  let statusEl = document.getElementById('km-process-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'km-process-status';
    statusEl.style.cssText = 'font-size:13px;color:#6b7280;margin-top:8px;';
    btn.insertAdjacentElement('afterend', statusEl);
  }
  statusEl.textContent = 'This usually takes 1–2 minutes. Please keep this page open.';
  statusEl.style.display = '';

  try {
    const res = await apiPost(`ai-secretary-meetings/${S.activeMeeting.id}/process`, {});
    if (res.error) { showToast(res.error, 'error'); return; }
    S.activeMeeting = res;
    renderPage('meeting');
    showToast('Minutes generated! Scroll down to review and approve.', 'success');
    setTimeout(() => {
      document.getElementById('kr-review-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  } catch {
    showToast('Processing failed. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
    if (statusEl) statusEl.style.display = 'none';
  }
}

// ── MEMBERS ───────────────────────────────────────────────────────
async function renderMembers(main) {
  const settingsRes = await apiGet('settings');
  S.members = settingsRes.kpsc_members || [];

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>KPSC Roster</h2>
        <button class="kbtn kbtn-primary" onclick="Kpsc.addMember()">+ Add Member</button>
      </div>
      <p class="k-page-hint">These names pre-fill attendance at each meeting. Add all committee members here.</p>
      <div id="km-members-list">
        ${renderMembersList()}
      </div>
      <div class="k-members-actions">
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveMembers(this)">💾 Save Roster</button>
      </div>
    </div>`;
}

function renderMembersList() {
  if (S.members.length === 0) {
    return `<div class="k-empty">No members yet. Click "+ Add Member" to begin.</div>`;
  }
  return GROUPS.map(g => {
    const groupMembers = S.members.map((m, i) => ({ ...m, _idx: i })).filter(m => m.group === g.key);
    if (groupMembers.length === 0) return '';
    return `
      <div class="k-mem-group">
        <div class="k-mem-group-hdr">${g.icon} ${g.label}</div>
        ${groupMembers.map(m => memberRow(m._idx, m)).join('')}
      </div>`;
  }).join('') || `<div class="k-empty">No members yet.</div>`;
}

/**
 * Return a stable D1 ID for a member. Uses an existing voice_member_id if
 * present, otherwise generates one from group + name slug and stores it back
 * on the in-memory member object (will persist on next saveMembers call).
 */
function memberVoiceId(mem) {
  if (mem.voice_member_id) return mem.voice_member_id;
  const slug = String(mem.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const id = `vfp_${mem.group || 'x'}_${slug || 'unknown'}`;
  mem.voice_member_id = id;
  return id;
}

function memberRow(idx, mem) {
  const vfpEnrolled = !!mem.voice_enrolled_at;
  const vfpBadge = vfpEnrolled
    ? `<span class="k-vfp-badge k-vfp-enrolled" title="Voice fingerprint enrolled ${esc(mem.voice_enrolled_at || '')}">🎙&#xFE0F; FP</span>`
    : '';

  return `
    <div class="k-mem-row" id="kmem-row-${idx}">
      <select class="k-input k-input-sm k-mem-group" data-idx="${idx}" onchange="Kpsc.memberFieldChange(${idx},'group',this.value)">
        ${GROUPS.map(g => `<option value="${g.key}" ${mem.group === g.key ? 'selected' : ''}>${g.label}</option>`).join('')}
      </select>
      <input class="k-input k-input-sm k-mem-name" type="text" placeholder="Full name"
        value="${esc(mem.name || '')}" onchange="Kpsc.memberFieldChange(${idx},'name',this.value)" />
      <input class="k-input k-input-sm k-mem-pos" type="text" placeholder="Position (optional)"
        value="${esc(mem.position || '')}" onchange="Kpsc.memberFieldChange(${idx},'position',this.value)" />
      <input class="k-input k-input-sm k-mem-phone" type="tel" placeholder="Phone (for SMS)"
        value="${esc(mem.phone || '')}" onchange="Kpsc.memberFieldChange(${idx},'phone',this.value)" />
      ${vfpBadge}
      <button class="kbtn kbtn-sm kbtn-ghost k-vfp-enroll-btn" onclick="Kpsc.showVoiceFpEnrollModal(${idx})" title="${vfpEnrolled ? 'Re-enroll voice fingerprint' : 'Enroll voice fingerprint for meeting identification'}">
        ${vfpEnrolled ? '🔁 FP' : '🎙 FP'}
      </button>
      <button class="kbtn kbtn-sm kbtn-ghost kbtn-remove" onclick="Kpsc.removeMember(${idx})">✕</button>
    </div>`;
}

function memberFieldChange(idx, field, value) {
  if (S.members[idx]) S.members[idx][field] = value;
}

function addMember() {
  S.members.push({ group: 'men', name: '', position: '', phone: '' });
  const list = document.getElementById('km-members-list');
  if (list) list.innerHTML = renderMembersList();
}

function removeMember(idx) {
  S.members.splice(idx, 1);
  const list = document.getElementById('km-members-list');
  if (list) list.innerHTML = renderMembersList();
}

async function saveMembers(btn) {
  // Read current DOM state before saving
  document.querySelectorAll('.k-mem-row').forEach((row, i) => {
    const idx = parseInt(row.id.replace('kmem-row-', ''), 10);
    if (isNaN(idx) || !S.members[idx]) return;
    const groupEl = row.querySelector('.k-mem-group');
    const nameEl  = row.querySelector('.k-mem-name');
    const posEl   = row.querySelector('.k-mem-pos');
    const phoneEl = row.querySelector('.k-mem-phone');
    if (groupEl) S.members[idx].group    = groupEl.value;
    if (nameEl)  S.members[idx].name     = nameEl.value.trim();
    if (posEl)   S.members[idx].position = posEl.value.trim();
    if (phoneEl) S.members[idx].phone    = phoneEl.value.trim();
  });

  const valid = S.members.filter(m => m.name.trim());
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const res = await apiPost('settings', { kpsc_members: valid });
    if (res.error) { showToast(res.error, 'error'); return; }
    S.members = valid;
    showToast('Roster saved', 'success');
    document.getElementById('km-members-list').innerHTML = renderMembersList();
  } catch {
    showToast('Failed to save roster.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── VF-3 VOICE FINGERPRINT ENROLLMENT (new /api/voice-enroll path) ───────

const VFP_RECORD_DURATION_SEC = 5;

// State for the VF-3 enrollment modal recording.
// Uses raw PCM capture via AudioWorklet (same as the meeting room) so the
// enrollment signal matches identification — no Opus encoding in between.
// This eliminates the cross-codec cosine-similarity drop (~0.10-0.15)
// documented in ECAPA-TDNN research.
const VfpRec = {
  stream: null,
  audioCtx: null,
  sourceNode: null,
  workletNode: null,
  pcmChunks: [],          // Float32Array[] of raw mic samples at source rate
  sourceSampleRate: 0,    // AudioContext.sampleRate at capture time
  recording: false,
  blob: null,             // final 16 kHz WAV ready for upload
  blobUrl: null,
  timer: null,
  elapsed: 0,
  memberIdx: -1,
};

function vfpCleanup() {
  clearInterval(VfpRec.timer);
  VfpRec.timer = null;
  VfpRec.recording = false;
  try { VfpRec.workletNode?.disconnect(); } catch (_) { /* noop */ }
  try { VfpRec.sourceNode?.disconnect(); } catch (_) { /* noop */ }
  VfpRec.workletNode = null;
  VfpRec.sourceNode  = null;
  if (VfpRec.stream) { VfpRec.stream.getTracks().forEach(t => t.stop()); VfpRec.stream = null; }
  if (VfpRec.audioCtx && VfpRec.audioCtx.state !== 'closed') {
    VfpRec.audioCtx.close().catch(() => {});
  }
  VfpRec.audioCtx = null;
  if (VfpRec.blobUrl) { URL.revokeObjectURL(VfpRec.blobUrl); VfpRec.blobUrl = null; }
  VfpRec.pcmChunks = [];
  VfpRec.blob = null;
  VfpRec.elapsed = 0;
}

function showVoiceFpEnrollModal(idx) {
  const member = S.members[idx];
  if (!member || !member.name.trim()) {
    showToast('Please save the member name first.', 'warn');
    return;
  }

  document.getElementById('k-vfp-modal')?.remove();
  vfpCleanup();
  VfpRec.memberIdx = idx;

  const alreadyEnrolled = !!member.voice_enrolled_at;
  const modal = document.createElement('div');
  modal.id        = 'k-vfp-modal';
  modal.className = 'k-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'km-voice-enroll-title');
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title" id="km-voice-enroll-title">🎙 Voice Enrollment — ${esc(member.name)}</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closeVoiceFpModal()">✕</button>
      </div>
      <div class="k-modal-body">
        <p class="k-enroll-instruction">Voice enrollment stores a mathematical representation of <strong>${esc(member.name)}</strong>'s voice (192 numbers) that lets KPSC identify them in meetings. The raw recording is not kept. You can delete this data at any time.</p>
        ${alreadyEnrolled ? `<div class="k-enroll-warn">⚠ Already enrolled (${esc(new Date(member.voice_enrolled_at).toLocaleDateString())}${member.voice_sample_count ? ` · ${member.voice_sample_count} sample(s)` : ''}). Recording again will replace the existing data.</div>` : ''}
        <div style="margin:12px 0;padding:10px;background:var(--bg-warn,#fffbeb);border:1px solid var(--border-warn,#f59e0b);border-radius:6px">
          <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="km-voice-consent-cb" style="margin-top:2px;flex-shrink:0" onchange="(function(cb){ var btn=document.getElementById('k-vfp-record-btn'); if(btn) btn.disabled=!cb.checked; })(this)">
            <span>I confirm that <strong>${esc(member.name)}</strong> has given explicit consent to record and store a voice fingerprint for identification purposes.</span>
          </label>
        </div>
        <div id="k-vfp-status"></div>
        <div id="k-vfp-recording-ui" style="display:none">
          <div class="k-vfp-rec-indicator">
            <span class="k-vfp-dot"></span>
            <span id="k-vfp-countdown" class="k-enroll-timer">5</span>
          </div>
        </div>
        <div id="k-vfp-playback-ui" style="display:none">
          <audio id="k-vfp-audio" controls style="width:100%;margin-top:8px;"></audio>
        </div>
      </div>
      <div class="k-modal-footer" id="k-vfp-footer">
        <button class="kbtn kbtn-record" id="k-vfp-record-btn" onclick="Kpsc.startVoiceFpRecording()" disabled>🔴 Record 5 seconds</button>
        <button class="kbtn kbtn-primary" id="k-vfp-submit-btn" onclick="Kpsc.submitVoiceFpEnrollment()" disabled>Submit</button>
        ${alreadyEnrolled ? `<button class="kbtn kbtn-danger-outline" onclick="Kpsc.removeVoiceFpEnrollment(${idx})">🗑 Remove voice data</button>` : ''}
        <button class="kbtn kbtn-ghost" onclick="Kpsc.closeVoiceFpModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector('button, input')?.focus(), 50);
}

function closeVoiceFpModal() {
  vfpCleanup();
  if (VfpRec.mediaRecorder && VfpRec.mediaRecorder.state !== 'inactive') {
    try { VfpRec.mediaRecorder.stop(); } catch (_) { /* noop */ }
  }
  VfpRec.mediaRecorder = null;
  document.getElementById('k-vfp-modal')?.remove();
}

async function startVoiceFpRecording() {
  const recordBtn  = document.getElementById('k-vfp-record-btn');
  const submitBtn  = document.getElementById('k-vfp-submit-btn');
  const statusEl   = document.getElementById('k-vfp-status');
  const recUi      = document.getElementById('k-vfp-recording-ui');

  if (recordBtn) { recordBtn.disabled = true; recordBtn.textContent = '🎙 Recording…'; }
  if (submitBtn) submitBtn.disabled = true;
  vfpCleanup();

  try {
    VfpRec.stream    = await navigator.mediaDevices.getUserMedia({ audio: true });
    VfpRec.pcmChunks = [];
    VfpRec.elapsed   = 0;
    VfpRec.recording = true;

    // Set up an AudioContext + AudioWorklet that streams raw Float32 PCM
    // chunks to us. Identical pipeline to the meeting-room diarizer, so
    // enrolled embeddings live in the same acoustic space as live ones.
    VfpRec.audioCtx = new AudioContext();
    if (VfpRec.audioCtx.state === 'suspended') {
      try { await VfpRec.audioCtx.resume(); } catch (_) { /* noop */ }
    }
    VfpRec.sourceSampleRate = VfpRec.audioCtx.sampleRate;

    const workletBlob = new Blob([DG_WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl  = URL.createObjectURL(workletBlob);
    try {
      await VfpRec.audioCtx.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    VfpRec.sourceNode  = VfpRec.audioCtx.createMediaStreamSource(VfpRec.stream);
    VfpRec.workletNode = new AudioWorkletNode(VfpRec.audioCtx, 'pcm-capture-processor');
    VfpRec.workletNode.port.onmessage = (e) => {
      if (VfpRec.recording && e.data && e.data.length) {
        VfpRec.pcmChunks.push(new Float32Array(e.data));
      }
    };
    VfpRec.sourceNode.connect(VfpRec.workletNode);
    VfpRec.workletNode.connect(VfpRec.audioCtx.createMediaStreamDestination());

    if (recUi) recUi.style.display = '';
    const countdownEl = document.getElementById('k-vfp-countdown');
    if (countdownEl) countdownEl.textContent = String(VFP_RECORD_DURATION_SEC);

    VfpRec.timer = setInterval(() => {
      VfpRec.elapsed++;
      const remaining = VFP_RECORD_DURATION_SEC - VfpRec.elapsed;
      if (countdownEl) countdownEl.textContent = String(Math.max(0, remaining));
      if (VfpRec.elapsed >= VFP_RECORD_DURATION_SEC) {
        clearInterval(VfpRec.timer);
        VfpRec.timer = null;
        finishVoiceFpRecording();
      }
    }, 1000);

  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<div class="k-enroll-error">❌ Microphone error: ${esc(e.message)}</div>`;
    if (recordBtn) { recordBtn.disabled = false; recordBtn.textContent = '🔴 Record 5 seconds'; }
  }
}

// Concatenate captured Float32 → resample to 16 kHz → encode as 16-bit WAV.
// Matches the identification path exactly, so enrollment and identification
// produce ECAPA-TDNN embeddings in the same acoustic space.
function finishVoiceFpRecording() {
  VfpRec.recording = false;

  const recordBtn  = document.getElementById('k-vfp-record-btn');
  const submitBtn  = document.getElementById('k-vfp-submit-btn');
  const playbackUi = document.getElementById('k-vfp-playback-ui');
  const recUi      = document.getElementById('k-vfp-recording-ui');
  const statusEl   = document.getElementById('k-vfp-status');

  const totalLen = VfpRec.pcmChunks.reduce((a, c) => a + c.length, 0);
  if (totalLen === 0) {
    if (statusEl) statusEl.innerHTML = `<div class="k-enroll-error">❌ No audio captured. Please check your microphone and retry.</div>`;
    if (recordBtn) { recordBtn.disabled = false; recordBtn.textContent = '🔴 Record 5 seconds'; }
    vfpCleanup();
    return;
  }

  const float32 = new Float32Array(totalLen);
  let pos = 0;
  for (const c of VfpRec.pcmChunks) { float32.set(c, pos); pos += c.length; }

  const fromRate  = VfpRec.sourceSampleRate || DEFAULT_PCM_SAMPLE_RATE;
  const resampled = resampleTo16k(float32, fromRate);
  const int16     = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(resampled[i] * 32767)));
  }
  const wavBuf = pcm16ToWav(int16, 16000);
  VfpRec.blob  = new Blob([wavBuf], { type: 'audio/wav' });
  if (VfpRec.blobUrl) URL.revokeObjectURL(VfpRec.blobUrl);
  VfpRec.blobUrl = URL.createObjectURL(VfpRec.blob);

  const audio = document.getElementById('k-vfp-audio');
  if (audio) audio.src = VfpRec.blobUrl;

  // Tear down the capture pipeline but keep the encoded blob for playback + submit.
  try { VfpRec.workletNode?.disconnect(); } catch (_) { /* noop */ }
  try { VfpRec.sourceNode?.disconnect(); } catch (_) { /* noop */ }
  VfpRec.workletNode = null;
  VfpRec.sourceNode  = null;
  if (VfpRec.stream) { VfpRec.stream.getTracks().forEach(t => t.stop()); VfpRec.stream = null; }
  if (VfpRec.audioCtx && VfpRec.audioCtx.state !== 'closed') {
    VfpRec.audioCtx.close().catch(() => {});
  }
  VfpRec.audioCtx = null;
  VfpRec.pcmChunks = [];

  if (playbackUi) playbackUi.style.display = '';
  if (recUi) recUi.style.display = 'none';
  if (recordBtn) { recordBtn.disabled = false; recordBtn.textContent = '🔄 Re-record'; }
  if (submitBtn) submitBtn.disabled = false;
}

async function submitVoiceFpEnrollment() {
  const submitBtn = document.getElementById('k-vfp-submit-btn');
  const statusEl  = document.getElementById('k-vfp-status');

  if (!VfpRec.blob) { showToast('Please record audio first.', 'warn'); return; }
  const idx    = VfpRec.memberIdx;
  const member = S.members[idx];
  if (!member) return;

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

  try {
    // Step 1: sync the member to D1.
    const vid = memberVoiceId(member);
    const syncRes = await fetch(`${API}/voice-member-sync/${encodeURIComponent(vid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
      body: JSON.stringify({ name: member.name, group: member.group || '', position: member.position || '' }),
    });
    const syncData = await syncRes.json();
    if (syncData.error) throw new Error(syncData.error);

    // Step 2: enroll the audio (16 kHz WAV — same codec as identification).
    const form = new FormData();
    form.append('audio', VfpRec.blob, 'enrollment.wav');
    const enrollRes = await fetch(`${API}/voice-enroll/${encodeURIComponent(vid)}`, {
      method: 'POST',
      headers: { ...kpscSessionHeader() },
      body: form,
    });
    const enrollData = await enrollRes.json();
    if (enrollData.error) throw new Error(enrollData.error);

    // Step 3: persist enrollment metadata back on the JSON member.
    // Read-before-write: fetch the latest settings so concurrent enrollment
    // sessions don't overwrite each other's data.
    const latestSettings = await apiGet('settings');
    const latestMembers = latestSettings.kpsc_members || S.members;
    // Find the matching member by voice_member_id or by name+group to merge.
    const latestIdx = latestMembers.findIndex(
      m => (m.voice_member_id && m.voice_member_id === vid) ||
           (m.name === member.name && m.group === member.group)
    );
    if (latestIdx >= 0) {
      latestMembers[latestIdx].voice_enrolled_at  = enrollData.enrolledAt;
      latestMembers[latestIdx].voice_sample_count = enrollData.sampleCount;
      latestMembers[latestIdx].voice_member_id    = vid;
    }
    // Also update local S.members so the UI reflects the change.
    S.members[idx].voice_enrolled_at  = enrollData.enrolledAt;
    S.members[idx].voice_sample_count = enrollData.sampleCount;
    S.members[idx].voice_member_id    = vid;
    await apiPost('settings', { kpsc_members: latestMembers });

    showToast(`Voice enrolled for ${member.name}`, 'success');
    closeVoiceFpModal();

    // Refresh the member list row.
    const list = document.getElementById('km-members-list');
    if (list) list.innerHTML = renderMembersList();

  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<div class="k-enroll-error">❌ ${esc(e.message)}</div>`;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit'; }
  }
}

async function removeVoiceFpEnrollment(idx) {
  const member = S.members[idx];
  if (!member) return;
  if (!confirm(`This permanently deletes the voice enrollment for ${member.name}. Continue?`)) return;

  const vid = member.voice_member_id || memberVoiceId(member);
  try {
    const res = await fetch(`${API}/voice-enrollment/${encodeURIComponent(vid)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Clear local state.
    delete S.members[idx].voice_enrolled_at;
    delete S.members[idx].voice_sample_count;
    await apiPost('settings', { kpsc_members: S.members });

    showToast('Voice data removed', 'success');
    closeVoiceFpModal();

    const list = document.getElementById('km-members-list');
    if (list) list.innerHTML = renderMembersList();
  } catch (e) {
    showToast(`Failed to remove: ${e.message}`, 'error');
  }
}


function currentYear() {
  return new Date().getUTCFullYear();
}

function currentMonth() {
  return new Date().getUTCMonth() + 1;
}

function monthName(month) {
  return new Date(Date.UTC(currentYear(), Math.max(0, month - 1), 1)).toLocaleString('en-NG', { month: 'long', timeZone: 'UTC' });
}

// ── SMS character / page counter ─────────────────────────────────
const GSM7_CHARS = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
);
const GSM7_EXT = new Set('{}[]~^\\|€');

function smsCharInfo(text) {
  let charCount = 0;
  let isGsm7 = true;
  for (const ch of text) {
    if (GSM7_CHARS.has(ch)) { charCount++; }
    else if (GSM7_EXT.has(ch)) { charCount += 2; }
    else { isGsm7 = false; break; }
  }
  if (!isGsm7) {
    const len = [...text].length;
    const pageSize = len <= 70 ? 70 : 67;
    const pages = len === 0 ? 0 : Math.ceil(len / pageSize);
    return { chars: len, pages, encoding: 'Unicode' };
  }
  const pageSize = charCount <= 160 ? 160 : 153;
  const pages = charCount === 0 ? 0 : Math.ceil(charCount / pageSize);
  return { chars: charCount, pages, encoding: 'GSM-7' };
}

function updateSmsCounter(textarea) {
  const id = textarea?.id;
  if (!id) return;
  const counterId = 'sms-ctr-' + id;
  const el = document.getElementById(counterId);
  if (!el) return;
  const info = smsCharInfo(textarea.value || '');
  el.textContent = info.chars === 0
    ? ''
    : `${info.chars} char${info.chars !== 1 ? 's' : ''} · ${info.pages} SMS page${info.pages !== 1 ? 's' : ''} (${info.encoding})`;
  el.className = 'k-sms-counter';
  if (info.encoding === 'Unicode') el.classList.add('unicode');
  else if (info.pages >= 3) el.classList.add('danger');
  else if (info.pages === 2) el.classList.add('warn');
}

function initSmsCounters() {
  ['ks-sms-welcome','ks-sms-newmonth','ks-sms-anniversary',
   'ks-sms-milestone6','ks-sms-milestone12','ks-sms-premeeting','ks-sms-deadline',
   'ks-sms-payment-a','ks-sms-payment-b','ks-sms-payment-c',
   'ks-sms-reminder-a','ks-sms-reminder-b','ks-sms-reminder-c']
    .forEach(id => { const el = document.getElementById(id); if (el) updateSmsCounter(el); });
}

// ── PIN confirmation gate ─────────────────────────────────────────
function requirePin(title, subtitle, onConfirmed) {
  document.getElementById('k-pin-confirm-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'k-pin-confirm-overlay';
  overlay.id = 'k-pin-confirm-modal';
  overlay.innerHTML = `
    <div class="k-pin-confirm-box">
      <div class="k-pin-confirm-title">${esc(title)}</div>
      <div class="k-pin-confirm-sub">${esc(subtitle)}</div>
      <input id="k-pin-confirm-input" class="k-pin-confirm-input" type="password" inputmode="numeric" maxlength="6" placeholder="••••••" autofocus />
      <div class="k-pin-confirm-err" id="k-pin-confirm-err"></div>
      <div class="k-pin-confirm-btns">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-pin-confirm-modal')?.remove()">Cancel</button>
        <button class="kbtn kbtn-primary" id="k-pin-confirm-btn" onclick="Kpsc._submitPinConfirm()">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('keydown', e => { if (e.key === 'Enter') Kpsc._submitPinConfirm(); });
  document.getElementById('k-pin-confirm-input')?.focus();
  window._pinConfirmCallback = onConfirmed;
}

async function _submitPinConfirm() {
  const pin = document.getElementById('k-pin-confirm-input')?.value.trim() || '';
  const errEl = document.getElementById('k-pin-confirm-err');
  const btn = document.getElementById('k-pin-confirm-btn');
  if (!pin) { if (errEl) errEl.textContent = 'Please enter your PIN.'; return; }
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const res = await apiPost('kpsc-login', { accountId: S.user?.id, pin, role: S.user?.role }).catch(() => ({ error: 'Network error' }));
  if (btn) { btn.disabled = false; btn.textContent = orig; }
  if (res?.error) {
    if (errEl) errEl.textContent = 'Incorrect PIN. Please try again.';
    const input = document.getElementById('k-pin-confirm-input');
    if (input) { input.value = ''; input.focus(); }
    return;
  }
  document.getElementById('k-pin-confirm-modal')?.remove();
  if (typeof window._pinConfirmCallback === 'function') {
    window._pinConfirmCallback();
    window._pinConfirmCallback = null;
  }
}

// ── Record Payment modal ──────────────────────────────────────────
function openRecordPaymentModal(partnerId) {
  const partner = S.partners.find(p => p.id === partnerId);
  if (!partner) return;
  const year = (S._partnerDetailId === partnerId && S._partnerDetailYear) ? S._partnerDetailYear : S.partnersYear;
  const now = new Date();
  const currentMo = now.getUTCMonth() + 1;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const paidSet = new Set(
    S.partnerPayments
      .filter(p => p.partnerId === partnerId && p.year === year && p.paid && p.paymentType === 'monthly_pledge')
      .map(p => p.month)
  );
  const chips = MONTHS.map((mn, i) => {
    const mo = i + 1;
    const isPaid = paidSet.has(mo);
    return `<div class="k-month-chip${isPaid ? ' already-paid' : mo === currentMo ? ' selected' : ''}" data-month="${mo}" data-paid="${isPaid ? '1' : '0'}" onclick="Kpsc._togglePaymentChip(this);Kpsc._updatePaymentTotal()">${mn}</div>`;
  }).join('');

  document.getElementById('k-rec-payment-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'k-modal-overlay';
  modal.id = 'k-rec-payment-modal';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:520px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">💳 Record Payment</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-rec-payment-modal')?.remove()">✕</button>
      </div>
      <div class="k-modal-body">
        <div style="background:var(--bg);border-radius:10px;padding:10px 12px;margin-bottom:14px;">
          <div style="font-weight:700;font-size:15px;color:var(--navy)">${esc(partner.fullName)}</div>
          <div style="font-size:13px;color:var(--text2);margin-top:2px">
            Monthly pledge: <strong>₦${Number(partner.monthlyPledge || 0).toLocaleString('en-NG')}</strong> &nbsp;·&nbsp; Year: ${year}
          </div>
        </div>

        <div class="k-form-group">
          <label class="k-label">Select Month(s) to Record</label>
          <p class="k-hint" style="margin-bottom:6px">Tap to select. Green months already have a payment. You can select multiple months for catch-up or upfront payment.</p>
          <div class="k-month-chips" id="k-pay-month-chips">${chips}</div>
        </div>

        <div class="k-form-group">
          <label class="k-label">Amount per Month</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="k-pay-amount" class="k-input" type="number" min="0" step="100"
              value="${Number(partner.monthlyPledge || 0)}" style="flex:1;min-width:140px" placeholder="Amount (₦)"
              oninput="Kpsc._updatePaymentTotal()" />
            <button class="kbtn kbtn-sm" onclick="document.getElementById('k-pay-amount').value='${Number(partner.monthlyPledge || 0)}';Kpsc._updatePaymentTotal()">Use pledge (₦${Number(partner.monthlyPledge || 0).toLocaleString('en-NG')})</button>
          </div>
          <div id="k-pay-total" style="margin-top:8px;padding:8px 12px;background:var(--bg);border-radius:8px;font-size:14px;font-weight:600;color:var(--navy);display:none"></div>
          <p class="k-hint" style="margin-top:4px">Each selected month gets this amount recorded. Enter a higher amount if they paid more than the pledge.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">Payment Method</label>
          <div style="display:flex;gap:12px;margin-top:4px">
            <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer">
              <input type="radio" name="k-pay-method" value="cash" checked /> Cash
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer">
              <input type="radio" name="k-pay-method" value="transfer" /> Transfer
            </label>
          </div>
        </div>

        <div class="k-form-group">
          <label class="k-label">Notes <span style="font-weight:400;color:var(--text3)">(optional)</span></label>
          <textarea id="k-pay-notes" class="k-input k-textarea" rows="2" placeholder="e.g. Paid via bank app, reference 12345"></textarea>
        </div>

        <div class="k-form-group">
          <label class="k-label">Recorded in physical card? <span style="color:var(--red)">*</span></label>
          <div class="k-cardrec-group" id="k-pay-card-group">
            <label class="k-cardrec-option" data-value="yes" onclick="Kpsc._selectCardRecorded(this,'yes')">
              <input type="radio" name="k-pay-card-recorded" value="yes" /> ✅ Yes
            </label>
            <label class="k-cardrec-option" data-value="no" onclick="Kpsc._selectCardRecorded(this,'no')">
              <input type="radio" name="k-pay-card-recorded" value="no" /> ❌ Not yet
            </label>
          </div>
          <div id="k-pay-card-err" class="k-cardrec-error">Please select whether this payment has been recorded in the physical card.</div>
        </div>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-rec-payment-modal')?.remove()">Cancel</button>
        <button class="kbtn kbtn-primary" id="k-rec-payment-save-btn" onclick="Kpsc.saveRecordedPayments('${partnerId}', this)">Save Payment</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  // Show total immediately if current month is pre-selected
  _updatePaymentTotal();
}

function _selectCardRecorded(labelEl, value) {
  const group = labelEl.closest('.k-cardrec-group');
  if (!group) return;
  group.querySelectorAll('.k-cardrec-option').forEach(el => el.classList.remove('selected', 'yes', 'no'));
  labelEl.classList.add('selected', value);
  const err = group.nextElementSibling;
  if (err && err.classList.contains('k-cardrec-error')) err.style.display = 'none';
}

function _togglePaymentChip(chip) {
  if (chip.dataset.paid === '1') return;
  chip.classList.toggle('selected');
}

function _updatePaymentTotal() {
  const chips = document.querySelectorAll('#k-pay-month-chips .k-month-chip.selected');
  const count = chips.length;
  const amount = Number(document.getElementById('k-pay-amount')?.value || 0);
  const totalEl = document.getElementById('k-pay-total');
  if (!totalEl) return;
  if (count === 0 || amount <= 0) { totalEl.style.display = 'none'; return; }
  const total = count * amount;
  const monthNames = [...chips].map(c => {
    const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mn[Number(c.dataset.month) - 1] || '';
  }).join(', ');
  totalEl.style.display = 'block';
  totalEl.innerHTML = `${count} month${count > 1 ? 's' : ''} × ₦${amount.toLocaleString('en-NG')} = <span style="color:var(--green,#059669)">₦${total.toLocaleString('en-NG')} total</span><br><span style="font-size:11px;font-weight:400;color:var(--text2)">${monthNames}</span>`;
}

function _handleIllustrationUpload(targetInputId, fileInput, targetW, targetH, quality = 0.82) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      // Cover-fit: scale to fill the canvas without distorting
      const scale = Math.max(targetW / img.width, targetH / img.height);
      const sw = img.width * scale, sh = img.height * scale;
      ctx.drawImage(img, (targetW - sw) / 2, (targetH - sh) / 2, sw, sh);
      document.getElementById(targetInputId).value = canvas.toDataURL('image/jpeg', quality);
      fileInput.value = '';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function deletePartnerPayment(paymentId, partnerId) {
  const res = await apiDelete(`kpsc-partner-payments/${paymentId}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  showToast('Payment record deleted.', 'success');
  const year = S._partnerDetailYear || S.partnersYear;
  await loadPartnerData(year);
  const main = document.getElementById('kpsc-main');
  if (S.page === 'partnerDetail') renderPartnerDetail(main);
  else {
    const list = document.getElementById('kpsc-partners-list');
    if (list) list.innerHTML = renderPartnersList(canManagePartners());
  }
}

function deletePartnerPaymentWithPin(paymentId, partnerId) {
  requirePin(
    'Delete Payment Record',
    'Enter your PIN to delete this payment. The linked finance entry will also be removed.',
    () => deletePartnerPayment(paymentId, partnerId)
  );
}

function editPartnerPaymentWithPin(paymentId, partnerId) {
  const payment = S.partnerPayments.find(p => p.id === paymentId);
  if (!payment) { showToast('Payment not found.', 'error'); return; }
  requirePin(
    'Edit Payment Record',
    `Enter your PIN to edit the ${monthName(payment.month)} ${payment.year} payment.`,
    () => openEditPartnerPaymentModal(payment, partnerId)
  );
}

function openEditPartnerPaymentModal(payment, partnerId) {
  document.getElementById('k-edit-payment-modal')?.remove();
  const method = String(payment.reference || '').toLowerCase() || 'cash';
  const modal = document.createElement('div');
  modal.className = 'k-modal-overlay';
  modal.id = 'k-edit-payment-modal';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:400px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">✏️ Edit Payment — ${esc(monthName(payment.month))} ${payment.year}</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-edit-payment-modal')?.remove()">✕</button>
      </div>
      <div class="k-modal-body">
        <label class="k-label">Amount (₦)</label>
        <input id="k-ep-amount" class="k-input" type="number" min="0" step="100" value="${Number(payment.amount || 0)}" />
        <label class="k-label" style="margin-top:12px">Payment Method</label>
        <div style="display:flex;gap:12px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer">
            <input type="radio" name="k-ep-method" value="cash" ${method !== 'transfer' ? 'checked' : ''} /> Cash
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer">
            <input type="radio" name="k-ep-method" value="transfer" ${method === 'transfer' ? 'checked' : ''} /> Transfer
          </label>
        </div>
        <label class="k-label" style="margin-top:12px">Notes <span style="font-weight:400;color:var(--text3)">(optional)</span></label>
        <textarea id="k-ep-notes" class="k-input k-textarea" rows="2">${esc(payment.notes || '')}</textarea>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-edit-payment-modal')?.remove()">Cancel</button>
        <button class="kbtn kbtn-primary" id="k-ep-save-btn" onclick="Kpsc.saveEditedPartnerPayment('${payment.id}','${partnerId}','${payment.month}','${payment.year}','${payment.paymentType || 'monthly_pledge'}',this)">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function saveEditedPartnerPayment(paymentId, partnerId, month, year, paymentType, btn) {
  const amount = Number(document.getElementById('k-ep-amount')?.value || 0);
  const method = document.querySelector('input[name="k-ep-method"]:checked')?.value || 'cash';
  const notes = document.getElementById('k-ep-notes')?.value.trim() || '';
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  const res = await apiPost('kpsc-partner-payments', {
    partnerId, year: Number(year), month: Number(month), amount,
    paymentType, source: 'partnership', paid: true,
    reference: method, recordedBy: S.user?.name || '', notes,
  });
  btn.disabled = false; btn.textContent = orig;
  if (res?.error) { showToast(res.error, 'error'); return; }
  document.getElementById('k-edit-payment-modal')?.remove();
  showToast('Payment updated.', 'success');
  const yr = S._partnerDetailYear || S.partnersYear;
  await loadPartnerData(yr);
  const main = document.getElementById('kpsc-main');
  if (S.page === 'partnerDetail') renderPartnerDetail(main);
  else {
    const list = document.getElementById('kpsc-partners-list');
    if (list) list.innerHTML = renderPartnersList(canManagePartners());
  }
}

async function saveRecordedPayments(partnerId, btn) {
  const year = S._partnerDetailId === partnerId ? (S._partnerDetailYear || S.partnersYear) : S.partnersYear;
  const chips = document.querySelectorAll('#k-pay-month-chips .k-month-chip.selected');
  const selectedMonths = [...chips].map(c => Number(c.dataset.month)).filter(m => m > 0);
  if (!selectedMonths.length) { showToast('Please select at least one month.', 'warn'); return; }
  const amount = Number(document.getElementById('k-pay-amount')?.value || 0);
  if (amount < 0) { showToast('Amount cannot be negative.', 'warn'); return; }
  const cardRecordedVal = document.querySelector('input[name="k-pay-card-recorded"]:checked')?.value;
  if (cardRecordedVal !== 'yes' && cardRecordedVal !== 'no') {
    const err = document.getElementById('k-pay-card-err');
    if (err) err.style.display = 'block';
    document.getElementById('k-pay-card-group')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Please select whether this payment has been recorded in the physical card.', 'warn');
    return;
  }
  const cardRecorded = cardRecordedVal === 'yes';
  const method = document.querySelector('input[name="k-pay-method"]:checked')?.value || 'cash';
  const notes = document.getElementById('k-pay-notes')?.value.trim() || '';
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = `Saving ${selectedMonths.length} payment${selectedMonths.length > 1 ? 's' : ''}…`;
  const now = new Date().toISOString();
  let errorCount = 0;
  for (const month of selectedMonths) {
    const res = await apiPost('kpsc-partner-payments', {
      partnerId, year, month, amount,
      paymentType: 'monthly_pledge',
      source: 'partnership',
      paid: true,
      paidAt: now,
      reference: method,
      recordedBy: S.user?.name || '',
      notes,
      cardRecorded,
      skipSms: true,  // batch SMS is sent once below instead of per-payment
    });
    if (res?.error) errorCount++;
  }
  // Send one combined thank-you SMS for all months instead of one per month
  if (!errorCount) {
    apiPost('kpsc-partner-batch-sms', {
      partnerId, months: selectedMonths, year, amount,
    }).catch(() => {});  // fire-and-forget; SMS failure must not block UI
  }
  btn.disabled = false;
  btn.textContent = orig;
  document.getElementById('k-rec-payment-modal')?.remove();
  if (errorCount) showToast(`${errorCount} payment(s) failed to save. Check and retry.`, 'error');
  else showToast(`Payment recorded for ${selectedMonths.length} month${selectedMonths.length > 1 ? 's' : ''}.`, 'success');
  if (!errorCount && method === 'cash') loadCashCollection(); // fire-and-forget — updates cash widget
  await Promise.all([loadPartnerData(year), loadPendingCardPayments()]);
  const main = document.getElementById('kpsc-main');
  if (S.page === 'partnerDetail' && S._partnerDetailId === partnerId) {
    renderPartnerDetail(main);
  } else {
    const list = document.getElementById('kpsc-partners-list');
    if (list) list.innerHTML = renderPartnersList(canManagePartners());
  }
}

// Quick "the physical card has been updated" action — flips cardRecorded to true
// for one payment without resending thank-you/milestone SMS.
async function markPaymentCardRecorded(paymentId, btn) {
  const payment = S.partnerPayments.find(p => p.id === paymentId);
  if (!payment) return;
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const res = await apiPost('kpsc-partner-payments', {
    partnerId: payment.partnerId, year: payment.year, month: payment.month,
    paymentType: payment.paymentType || 'monthly_pledge', source: payment.source || 'partnership',
    paid: true, paidAt: payment.paidAt, amount: payment.amount, reference: payment.reference,
    recordedBy: payment.recordedBy, notes: payment.notes,
    cardRecorded: true, skipSms: true,
  });
  if (res?.error) {
    showToast(res.error, 'error');
    if (btn) { btn.disabled = false; btn.textContent = orig; }
    return;
  }
  showToast('Marked as recorded in the physical card.', 'success');
  const year = S._partnerDetailYear || S.partnersYear;
  await Promise.all([loadPartnerData(year), loadPendingCardPayments()]);
  const main = document.getElementById('kpsc-main');
  if (S.page === 'partnerDetail') renderPartnerDetail(main);
  else if (S.page === 'partner-progress') renderPage('partner-progress');
  else if (S.page === 'partners') {
    const list = document.getElementById('kpsc-partners-list');
    if (list) list.innerHTML = renderPartnersList(canManagePartners());
  }
}

function catLabel(c) {
  return String(c || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

async function loadPendingCardPayments() {
  try {
    const res = await apiGet('kpsc-partner-payments-pending-card');
    S.pendingCardPayments = Array.isArray(res) ? res : [];
  } catch { S.pendingCardPayments = []; }
}

// Concise banner naming partners with a paid record not yet updated in their
// physical partnership card. Clicking a name jumps straight to their card (View Info).
function renderPendingCardBanner() {
  const items = S.pendingCardPayments || [];
  if (!items.length) return '';
  const names = items.map(p =>
    `<a href="javascript:void(0)" onclick="Kpsc.openPartnerDetail('${p.partnerId}')">${esc(p.partnerName)}</a>${p.count > 1 ? ` (${p.count})` : ''}`
  ).join(', ');
  return `<div class="k-cardrec-banner">📇 <strong>${items.length} partner${items.length !== 1 ? 's' : ''}</strong> paid but not yet recorded in the physical card: ${names}.</div>`;
}

async function loadPartnerData(year = currentYear()) {
  const [partnersRes, paymentsRes] = await Promise.all([
    apiGet('kpsc-partners'),
    apiGet(`kpsc-partner-payments?year=${year}`),
  ]);
  if (partnersRes?.error) throw new Error(partnersRes.error);
  if (paymentsRes?.error) throw new Error(paymentsRes.error);
  S.partners = Array.isArray(partnersRes) ? partnersRes : [];
  S.partnerPayments = Array.isArray(paymentsRes) ? paymentsRes : [];
}

// ── CASH COLLECTION TRACKER v2 ───────────────────────────────────────────────

async function loadCashCollection() {
  if (!canManageFinance()) return;
  try {
    const res = await apiGet('kpsc-cash-collection');
    if (res?.error) return;
    S.cashCollection = { ...res, loaded: true };
  } catch { /* silent — cards stay hidden on network failure */ }
  refreshCashCards();
}

function refreshCashCards() {
  document.querySelectorAll('#k-cash-card-mount').forEach(mount => {
    mount.innerHTML = renderCashCard();
  });
}

function renderCashCard() {
  if (!canManageFinance()) return '';
  const { loaded, pendingTotal, collectedTotal, spentTotal, holders } = S.cashCollection;
  if (!loaded || pendingTotal <= 0) return '';
  const fmtN = n => '₦' + Number(n || 0).toLocaleString('en-NG');
  const showBreakdown = collectedTotal !== pendingTotal && spentTotal > 0;

  const holderRows = holders.map(h => {
    const spentLine = h.spent > 0 ? ` · spent ${fmtN(h.spent)}` : '';
    const todayCount = h.lots.filter(l => l.isToday).length;
    const todayLine = todayCount > 0 ? ` · ${todayCount} today` : '';
    return `<div class="k-cash-holder-row">
      <div>
        <div class="k-cash-holder-name">${esc(h.name)}</div>
        <div class="k-cash-holder-meta">Collected ${fmtN(h.collected)}${spentLine} · ${h.lots.length} payment${h.lots.length !== 1 ? 's' : ''}${todayLine}</div>
      </div>
      <div class="k-cash-holder-amount">${fmtN(h.inHand)}</div>
    </div>`;
  }).join('');

  return `<div class="k-cash-card">
    <div class="k-cash-card-hdr">
      <div class="k-cash-card-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><circle cx="12" cy="14" r="2"/></svg>
        Cash in Hand
      </div>
      <div class="k-cash-card-total">${fmtN(pendingTotal)}</div>
    </div>
    ${showBreakdown ? `<div class="k-cash-card-summary">Collected ${fmtN(collectedTotal)} · Spent ${fmtN(spentTotal)} · In hand ${fmtN(pendingTotal)}</div>` : ''}
    ${holders.length > 0 ? `<div class="k-cash-holders">${holderRows}</div>` : ''}
    <div class="k-cash-card-actions">
      <button class="kbtn kbtn-primary kbtn-sm" onclick="Kpsc.openTransferModal()">Transfer to Bank</button>
      <button class="kbtn kbtn-sm" style="background:#f0faf5;color:var(--green);border:1px solid #b7dfc9" onclick="Kpsc.openSpendModal()">Spend from Cash</button>
      <button class="kbtn kbtn-ghost kbtn-sm" onclick="Kpsc.openCashDetailsModal()">Details</button>
    </div>
  </div>`;
}

function openTransferModal(holderName) {
  document.getElementById('k-transfer-modal')?.remove();
  const { holders } = S.cashCollection;
  if (!holders.length) { showToast('No pending cash to transfer.', 'error'); return; }
  const defaultHolder = holderName || holders[0].name;
  const fmtN = n => '₦' + Number(n || 0).toLocaleString('en-NG');
  const fmtD = s => s ? new Date(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '';

  const holderOptions = holders.map(h => `<option value="${esc(h.name)}" ${h.name === defaultHolder ? 'selected' : ''}>${esc(h.name)} — in hand ${fmtN(h.inHand)}</option>`).join('');

  const buildLotRows = h => h ? h.lots.map(lot => `
    <label class="k-transfer-lot">
      <input type="checkbox" name="k-transfer-lot" value="${esc(lot.id)}" data-amount="${lot.amount}" checked onchange="Kpsc._updateTransferAmount()"/>
      <div class="k-transfer-lot-body">
        <div class="k-transfer-lot-name">${esc(lot.partnerName)}</div>
        <div class="k-transfer-lot-meta">${fmtD(lot.date)}${lot.isToday ? ' · today' : ''}</div>
      </div>
      <div class="k-transfer-lot-amount">${fmtN(lot.amount)}</div>
    </label>`).join('') : '';

  const currentHolder = holders.find(h => h.name === defaultHolder);
  const spentNote = currentHolder?.spent > 0 ? `<div class="k-cash-spent-note">Spent from this cash: ${fmtN(currentHolder.spent)} (will be reconciled)</div>` : '';

  const modal = document.createElement('div');
  modal.id = 'k-transfer-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Transfer Cash to Bank</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-transfer-modal').remove()">✕</button>
      </div>
      <div class="k-modal-body">
        ${holders.length > 1 ? `<div class="k-form-group"><label class="k-label">Holder</label><select id="k-transfer-holder" class="k-input" onchange="Kpsc._rebuildTransferLots(this.value)">${holderOptions}</select></div>` : `<input type="hidden" id="k-transfer-holder" value="${esc(defaultHolder)}"/>`}
        <div class="k-form-group">
          <label class="k-label">Select Payments to Include</label>
          <div id="k-transfer-lot-list" class="k-transfer-lot-list">${buildLotRows(currentHolder)}</div>
        </div>
        ${spentNote}
        <div class="k-form-group">
          <label class="k-label">Amount to Transfer (₦)</label>
          <input id="k-transfer-amount" class="k-input" type="number" min="1" step="100" inputmode="decimal"/>
          <p class="k-hint" style="margin-top:4px">Auto-filled from ticked payments. Edit if keeping some change.</p>
        </div>
        <div class="k-form-group">
          <label class="k-label">Date</label>
          <input id="k-transfer-date" class="k-input" type="date" value="${new Date().toISOString().slice(0,10)}"/>
        </div>
        <div class="k-form-group">
          <label class="k-label">Notes <span style="font-weight:400;color:var(--text3)">(optional)</span></label>
          <textarea id="k-transfer-notes" class="k-input k-textarea" rows="2" placeholder="e.g. GTB Onitsha branch, teller receipt #12345" style="min-height:60px"></textarea>
        </div>
        <div id="k-transfer-err" style="display:none;color:var(--red);font-size:13px;margin-top:4px"></div>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-transfer-modal').remove()">Cancel</button>
        <button id="k-transfer-submit" class="kbtn kbtn-primary" onclick="Kpsc.submitCashHandover(this)">Confirm Transfer</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _updateTransferAmount();
}

function _rebuildTransferLots(holderName) {
  const holder = S.cashCollection.holders.find(h => h.name === holderName);
  const fmtN = n => '₦' + Number(n || 0).toLocaleString('en-NG');
  const fmtD = s => s ? new Date(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '';
  const list = document.getElementById('k-transfer-lot-list');
  if (!list) return;
  if (!holder) { list.innerHTML = ''; _updateTransferAmount(); return; }
  list.innerHTML = holder.lots.map(lot => `
    <label class="k-transfer-lot">
      <input type="checkbox" name="k-transfer-lot" value="${esc(lot.id)}" data-amount="${lot.amount}" checked onchange="Kpsc._updateTransferAmount()"/>
      <div class="k-transfer-lot-body">
        <div class="k-transfer-lot-name">${esc(lot.partnerName)}</div>
        <div class="k-transfer-lot-meta">${fmtD(lot.date)}${lot.isToday ? ' · today' : ''}</div>
      </div>
      <div class="k-transfer-lot-amount">${fmtN(lot.amount)}</div>
    </label>`).join('');
  const spentNote = document.querySelector('.k-cash-spent-note');
  if (spentNote) spentNote.textContent = holder.spent > 0 ? `Spent from this cash: ${fmtN(holder.spent)} (will be reconciled)` : '';
  _updateTransferAmount();
}

function _updateTransferAmount() {
  const checks = [...document.querySelectorAll('input[name="k-transfer-lot"]:checked')];
  const total = checks.reduce((s, c) => s + Number(c.dataset.amount || 0), 0);
  const holderName = document.getElementById('k-transfer-holder')?.value || '';
  const holder = S.cashCollection.holders.find(h => h.name === holderName);
  const net = Math.max(0, total - (holder?.spent || 0));
  const amtEl = document.getElementById('k-transfer-amount');
  if (amtEl) amtEl.value = net.toFixed(0);
}

async function submitCashHandover(btn) {
  const holder = document.getElementById('k-transfer-holder')?.value || '';
  const paymentIds = [...document.querySelectorAll('input[name="k-transfer-lot"]:checked')].map(c => c.value);
  const amount = Number(document.getElementById('k-transfer-amount')?.value || 0);
  const notes = (document.getElementById('k-transfer-notes')?.value || '').trim();
  const date = document.getElementById('k-transfer-date')?.value || '';
  const errEl = document.getElementById('k-transfer-err');
  if (!paymentIds.length) {
    if (errEl) { errEl.textContent = 'Tick at least one payment.'; errEl.style.display = 'block'; }
    return;
  }
  if (amount <= 0) {
    if (errEl) { errEl.textContent = 'Please enter a valid amount.'; errEl.style.display = 'block'; }
    return;
  }
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  const res = await apiPost('kpsc-cash-handovers', { holder, paymentIds, amount, notes, date });
  btn.disabled = false; btn.textContent = orig;
  if (res?.error) {
    if (errEl) { errEl.textContent = res.error; errEl.style.display = 'block'; }
    showToast('Transfer failed: ' + res.error, 'error');
    return;
  }
  const changeMsg = res?.changeRetained > 0 ? ` ₦${Number(res.changeRetained).toLocaleString('en-NG')} change kept in hand.` : '';
  showToast(`₦${amount.toLocaleString('en-NG')} transfer recorded.${changeMsg}`, 'success');
  document.getElementById('k-transfer-modal')?.remove();
  await loadCashCollection();
}

function openSpendModal(holderName) {
  document.getElementById('k-spend-modal')?.remove();
  const { holders } = S.cashCollection;
  const defaultHolder = holderName || S.user?.name || (holders[0]?.name || '');
  const holderOptions = holders.map(h => `<option value="${esc(h.name)}" ${h.name === defaultHolder ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
  const expCats = (S.settings?.kpsc_expense_categories || ['projects','welfare','committee_operations','church_support']).map(c =>
    `<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'k-spend-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Spend from Cash</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-spend-modal').remove()">✕</button>
      </div>
      <div class="k-modal-body">
        <p class="k-hint" style="margin-bottom:14px">Record a cash expense paid from money physically in hand. This reduces the holder's cash balance and logs the expense in Finance.</p>
        ${holders.length > 1 ? `<div class="k-form-group"><label class="k-label">Whose cash?</label><select id="k-spend-holder" class="k-input">${holderOptions}</select></div>` : `<input type="hidden" id="k-spend-holder" value="${esc(defaultHolder)}"/>`}
        <div class="k-form-group">
          <label class="k-label">Category</label>
          <select id="k-spend-category" class="k-input">${expCats}</select>
        </div>
        <div class="k-form-group">
          <label class="k-label">Amount (₦)</label>
          <input id="k-spend-amount" class="k-input" type="number" min="1" step="100" inputmode="decimal" placeholder="e.g. 5000"/>
        </div>
        <div class="k-form-group">
          <label class="k-label">Description</label>
          <textarea id="k-spend-narration" class="k-input k-textarea" rows="2" placeholder="What was this cash spent on?" style="min-height:60px"></textarea>
        </div>
        <div class="k-form-group">
          <label class="k-label">Date</label>
          <input id="k-spend-date" class="k-input" type="date" value="${new Date().toISOString().slice(0,10)}"/>
        </div>
        <div id="k-spend-err" style="display:none;color:var(--red);font-size:13px;margin-top:4px"></div>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-spend-modal').remove()">Cancel</button>
        <button class="kbtn kbtn-primary" onclick="Kpsc.submitCashExpense(this)">Record Expense</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function submitCashExpense(btn) {
  const cashHolder = document.getElementById('k-spend-holder')?.value || '';
  const category = document.getElementById('k-spend-category')?.value || '';
  const amount = Number(document.getElementById('k-spend-amount')?.value || 0);
  const narration = (document.getElementById('k-spend-narration')?.value || '').trim();
  const date = document.getElementById('k-spend-date')?.value || new Date().toISOString().slice(0, 10);
  const errEl = document.getElementById('k-spend-err');

  if (amount <= 0) {
    if (errEl) { errEl.textContent = 'Please enter a valid amount.'; errEl.style.display = 'block'; }
    return;
  }
  if (!category) {
    if (errEl) { errEl.textContent = 'Please select a category.'; errEl.style.display = 'block'; }
    return;
  }

  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  const res = await apiPost('kpsc-finance', {
    entryType: 'expense', category, amount,
    paymentMethod: 'cash', narration, date,
    recordedBy: S.user?.name || '',
    cashBoxExpense: true, cashHolder,
  });
  btn.disabled = false; btn.textContent = orig;

  if (res?.error) {
    if (errEl) { errEl.textContent = res.error; errEl.style.display = 'block'; }
    showToast('Failed to record expense: ' + res.error, 'error');
    return;
  }
  showToast(`₦${amount.toLocaleString('en-NG')} expense recorded.`, 'success');
  document.getElementById('k-spend-modal')?.remove();
  await loadCashCollection();
  // Refresh finance entry list if the finance page is currently showing
  const finList = document.getElementById('kf-entry-list');
  if (finList) {
    const finRes = await apiGet(`kpsc-finance?year=${S.financeYear}${S.financeMonth ? `&month=${S.financeMonth}` : ''}`);
    if (!finRes?.error) {
      S.financeEntries = Array.isArray(finRes) ? finRes : [];
      finList.innerHTML = renderFinanceEntryList(canManageFinance(), canDeleteFinanceEntries());
    }
  }
}

function openCashDetailsModal() {
  document.getElementById('k-cash-details-modal')?.remove();
  const { holders, recentHandovers } = S.cashCollection;
  const fmtN = n => '₦' + Number(n || 0).toLocaleString('en-NG');
  const fmtD = s => s ? new Date(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: '2-digit' }) : '';

  const holderSections = holders.map(h => {
    const lotRows = h.lots.map(lot => `
      <div class="k-cash-detail-row">
        <div>
          <div class="k-cash-detail-name">${esc(lot.partnerName)}</div>
          <div class="k-cash-detail-meta">${fmtD(lot.date)}${lot.isToday ? ' · today' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="k-cash-detail-amount">${fmtN(lot.amount)}</span>
          <button class="kbtn kbtn-sm kbtn-ghost" style="font-size:11px;padding:2px 8px" onclick="Kpsc._promptReassign('${esc(lot.id)}')">Reassign</button>
        </div>
      </div>`).join('');
    const expRows = h.expenses.map(exp => `
      <div class="k-cash-detail-row k-cash-detail-expense">
        <div>
          <div class="k-cash-detail-name">${esc(exp.narration || catLabel(exp.category))}</div>
          <div class="k-cash-detail-meta">${fmtD(exp.date)} · ${esc(catLabel(exp.category))}</div>
        </div>
        <span class="k-cash-detail-amount" style="color:var(--red)">−${fmtN(exp.amount)}</span>
      </div>`).join('');
    return `
      <div class="k-cash-section-title" style="margin-top:16px">${esc(h.name)} — in hand ${fmtN(h.inHand)}</div>
      ${lotRows}
      ${expRows || ''}
      <div class="k-cash-holder-subtotal">
        ${h.spent > 0 ? `<span>Collected ${fmtN(h.collected)} · Spent ${fmtN(h.spent)}</span>` : `<span>${h.lots.length} payment${h.lots.length !== 1 ? 's' : ''}</span>`}
        <span style="font-weight:700">In hand: ${fmtN(h.inHand)}</span>
      </div>`;
  }).join('');

  const handoverRows = recentHandovers.map(h => `
    <div class="k-handover-item">
      <div class="k-handover-item-top">
        <span class="k-handover-item-amount">${fmtN(h.amount)}</span>
        <span class="k-handover-item-count">${h.payment_count} payment${Number(h.payment_count) !== 1 ? 's' : ''}${h.holder ? ' · ' + esc(h.holder) : ''}</span>
      </div>
      <div class="k-handover-item-meta">${fmtD(h.transferred_at)} · by ${esc(h.transferred_by || '')}${h.notes ? ' · ' + esc(h.notes) : ''}${Number(h.expense_total) > 0 ? ` · spent ${fmtN(h.expense_total)}` : ''}</div>
    </div>`).join('');

  const modal = document.createElement('div');
  modal.id = 'k-cash-details-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:520px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Cash Collection Details</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-cash-details-modal').remove()">✕</button>
      </div>
      <div class="k-modal-body" style="max-height:70vh;overflow-y:auto">
        ${holderSections || '<div class="k-empty">No pending cash.</div>'}
        ${recentHandovers.length ? `<div class="k-cash-section-title" style="margin-top:20px">Recent Transfers</div>${handoverRows}` : ''}
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-cash-details-modal').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function _promptReassign(paymentId) {
  const newHolder = prompt('Reassign to (enter exact name):');
  if (!newHolder || !newHolder.trim()) return;
  apiPost('kpsc-cash-reassign', { paymentId, holder: newHolder.trim() }).then(res => {
    if (res?.error) { showToast('Reassign failed: ' + res.error, 'error'); return; }
    showToast('Reassigned.', 'success');
    document.getElementById('k-cash-details-modal')?.remove();
    loadCashCollection();
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function partnerPaymentsByPartner(partnerId, year = currentYear()) {
  return S.partnerPayments.filter(p => p.partnerId === partnerId && Number(p.year) === Number(year) && p.paid);
}

function partnerMonthlyPaid(partnerId, month, year = currentYear()) {
  return S.partnerPayments.some(p =>
    p.partnerId === partnerId && Number(p.year) === Number(year) && Number(p.month) === Number(month) && p.paid && p.paymentType === 'monthly_pledge'
  );
}

// Comma-separated list of a partner's unpaid month names over the last 12
// months, excluding months before they joined (month-granular). Mirrors the
// backend computeUnpaidMonths() so {{unpaidMonths}} reads the same whether a
// reminder is sent by the cron or manually from the Reminders page. Always
// returns at least the current month name.
function computeUnpaidMonthsStr(partner, month, year) {
  let lbYear = year, lbMonth = month - 11;
  if (lbMonth < 1) { lbMonth += 12; lbYear--; }
  let startOrdinal = -Infinity;
  const sd = /^(\d{4})-(\d{2})/.exec(String(partner?.startDate || ''));
  if (sd) startOrdinal = Number(sd[1]) * 12 + Number(sd[2]);
  const out = [];
  for (let y = lbYear, m = lbMonth; (y < year) || (y === year && m <= month); ) {
    const ordinal = y * 12 + m;
    if (!partnerMonthlyPaid(partner.id, m, y) && ordinal >= startOrdinal) out.push(monthName(m));
    if (++m > 12) { m = 1; y++; }
  }
  return out.length ? out.join(', ') : monthName(month);
}

async function renderPartners(main) {
  await Promise.all([loadPartnerData(S.partnersYear), loadPendingCardPayments()]);
  const canManage = canManagePartners();
  const nowYear = currentYear();
  const monthOpts = Array.from({length: 12}, (_, i) => {
    const m = i + 1;
    return `<option value="${m}" ${S.partnersMonth === m ? 'selected' : ''}>${monthName(m)}</option>`;
  }).join('');
  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>Partnership Management</h2>
        ${canManage ? `<button class="kbtn kbtn-primary" onclick="Kpsc.addPartner()">+ Add Partner</button>` : ''}
      </div>
      <p class="k-page-hint">Track God's Kingdom Partners and Covenant Partners, monthly pledges, and payment progress.</p>
      ${renderPendingCardBanner()}
      <div id="k-cash-card-mount"></div>
      <input class="k-input k-partners-search" type="search" placeholder="🔍 Search by name…"
        value="${esc(S.partnersSearch)}" oninput="Kpsc.setPartnersSearch(this.value)" />
      <div class="k-partners-controls">
        <div class="k-tabs" id="k-partner-status-tabs">
          <button class="k-tab ${S.partnersFilter === 'active' ? 'active' : ''}" onclick="Kpsc.setPartnersFilter('active')">Active</button>
          <button class="k-tab ${S.partnersFilter === 'all' ? 'active' : ''}" onclick="Kpsc.setPartnersFilter('all')">All</button>
          <button class="k-tab ${S.partnersFilter === 'inactive' ? 'active' : ''}" onclick="Kpsc.setPartnersFilter('inactive')">Inactive</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <select class="k-input k-input-sm" style="min-width:160px" onchange="Kpsc.setPartnersTypeFilter(this.value)">
            <option value="" ${S.partnersTypeFilter === '' ? 'selected' : ''}>All Types</option>
            <option value="gods_kingdom_partner" ${S.partnersTypeFilter === 'gods_kingdom_partner' ? 'selected' : ''}>God's Kingdom Partner</option>
            <option value="covenant_partner" ${S.partnersTypeFilter === 'covenant_partner' ? 'selected' : ''}>Covenant Partner</option>
          </select>
          <select class="k-input k-input-sm" onchange="Kpsc.setPartnersMonth(this.value)">${monthOpts}</select>
          <select class="k-input k-input-sm k-year-select" onchange="Kpsc.setPartnersYear(this.value)">
            ${[nowYear, nowYear-1, nowYear-2].map(y => `<option value="${y}" ${S.partnersYear === y ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="k-tabs k-tabs-wide" id="k-partner-payment-tabs" style="margin-bottom:16px">
        <button class="k-tab ${S.partnersPaymentFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="Kpsc.setPartnersPaymentFilter('all')">All</button>
        <button class="k-tab ${S.partnersPaymentFilter === 'paid' ? 'active' : ''}" data-filter="paid" onclick="Kpsc.setPartnersPaymentFilter('paid')">Paid this month</button>
        <button class="k-tab ${S.partnersPaymentFilter === 'unpaid' ? 'active' : ''}" data-filter="unpaid" onclick="Kpsc.setPartnersPaymentFilter('unpaid')">Unpaid this month</button>
        <button class="k-tab ${S.partnersPaymentFilter === 'not-started' ? 'active' : ''}" data-filter="not-started" onclick="Kpsc.setPartnersPaymentFilter('not-started')">Not started</button>
      </div>
      <div id="kpsc-partners-list">${renderPartnersList(canManage)}</div>
    </div>`;
  loadCashCollection(); // refresh embedded card after partners page loads
}

function setPartnersSearch(val) {
  S.partnersSearch = String(val || '').trim();
  const list = document.getElementById('kpsc-partners-list');
  if (list) list.innerHTML = renderPartnersList(canManagePartners());
}

function renderPartnersList(canManage) {
  const year = S.partnersYear;
  const month = S.partnersMonth;
  let partners = S.partners;
  if (S.partnersFilter === 'active') partners = partners.filter(p => p.status === 'active');
  else if (S.partnersFilter === 'inactive') partners = partners.filter(p => p.status === 'inactive');
  if (S.partnersTypeFilter) partners = partners.filter(p => p.partnershipType === S.partnersTypeFilter);
  const q = S.partnersSearch.toLowerCase();
  if (q) partners = partners.filter(p => p.fullName.toLowerCase().includes(q));
  if (S.partnersPaymentFilter === 'paid') partners = partners.filter(p => partnerMonthlyPaid(p.id, month, year));
  else if (S.partnersPaymentFilter === 'unpaid') partners = partners.filter(p => !partnerMonthlyPaid(p.id, month, year) && !isBeforePartnerStart(p, month, year));
  else if (S.partnersPaymentFilter === 'not-started') partners = partners.filter(p => isBeforePartnerStart(p, month, year));
  if (!partners.length) {
    return `<div class="k-empty">${q ? `No partners matching "${esc(S.partnersSearch)}".` : `No ${S.partnersFilter === 'all' ? '' : S.partnersFilter + ' '}partners found.`}</div>`;
  }
  const canFinance = canManageFinance();
  return `<div class="k-meeting-list">${partners.map(partner => {
    const paidMonths = partnerPaymentsByPartner(partner.id, year).filter(p => p.paymentType === 'monthly_pledge').length;
    const currentPaid = partnerMonthlyPaid(partner.id, month, year);
    const notStartedYet = !currentPaid && isBeforePartnerStart(partner, month, year);
    const pct = Math.round((paidMonths / 12) * 100);
    const nameHtml = q
      ? esc(partner.fullName).replace(new RegExp(esc(S.partnersSearch).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'), m => `<mark>${m}</mark>`)
      : esc(partner.fullName);
    return `
      <div class="k-meeting-card" style="position:relative">
        ${canManage ? cardCtxMenu('partner-' + partner.id,
          { label: '✏️ Edit', onclick: `Kpsc.editPartner('${partner.id}')` },
          { label: '🗑 Delete', onclick: `Kpsc.deletePartner('${partner.id}')`, danger: true },
        ) : ''}
        <div class="k-mc-top">
          <div style="flex:1;padding-right:${canManage ? '32px' : '0'}">
            <div class="k-mc-title">${nameHtml}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;line-height:1.4">
              ${esc(partnerTypeLabel(partner.partnershipType))}
              &nbsp;·&nbsp;
              <span style="color:${partner.status === 'active' ? '#065f46' : 'var(--text3)'}">
                ${partner.status === 'active' ? 'Active' : 'Inactive'}
              </span>
              ${canManageFinance() ? `&nbsp;·&nbsp; ₦${Number(partner.monthlyPledge||0).toLocaleString('en-NG')}/mo` : ''}
              ${partner.dndFlagged ? `&nbsp;·&nbsp; <span title="DND — SMS delivery failed">🚫 DND</span>` : ''}
              ${partner.optedOut ? `&nbsp;·&nbsp; <span title="Opted out of SMS">📵 Opted-out</span>` : ''}
            </div>
            <div style="margin-top:5px">
              <span class="kbadge ${currentPaid ? 'badge-green' : notStartedYet ? 'badge-gray' : 'badge-amber'}" style="white-space:nowrap">${currentPaid ? '✓ Paid this month' : notStartedYet ? '· Not started' : '✗ Unpaid this month'}</span>
            </div>
            <div class="k-progress-row">
              <div class="k-progress-bar-bg"><div class="k-progress-bar" style="width:${pct}%"></div></div>
              <span class="k-progress-label">${paidMonths}/12 months paid (${year})</span>
            </div>
          </div>
        </div>
        <div class="k-room-actions" style="flex-wrap:wrap">
          <button class="kbtn kbtn-sm" onclick="Kpsc.openPartnerDetail('${partner.id}')">📅 View Info</button>
          ${canFinance ? `<button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.openRecordPaymentModal('${partner.id}')">💳 Record Payment</button>` : ''}
        </div>
      </div>`;
  }).join('')}</div>`;
}

function addPartner() {
  showPartnerModal();
}

function editPartner(id) {
  const partner = S.partners.find(p => p.id === id);
  if (!partner) return;
  showPartnerModal(partner);
}

function _partnerPhoneParts(stored) {
  const p = String(stored || '').replace(/\D/g, '');
  if (!p) return { cc: '234', local: '' };
  // If number starts with a known country code prefix (default 234), split it
  if (p.startsWith('234') && p.length > 3) return { cc: '234', local: p.slice(3) };
  // Legacy local number stored without country code (starts with 0 or just digits)
  return { cc: '234', local: p.replace(/^0+/, '') };
}

function _normalizePartnerPhone(cc, local) {
  const c = String(cc || '234').replace(/\D/g, '') || '234';
  const l = String(local || '').replace(/\D/g, '').replace(/^0+/, '');
  return l ? c + l : '';
}

function showPartnerModal(partner = null) {
  document.getElementById('kpsc-partner-modal')?.remove();
  // Other partners' names (lowercased), for a live duplicate-name warning below.
  const otherNames = S.partners
    .filter(p => !partner || p.id !== partner.id)
    .map(p => String(p.fullName || '').trim().toLowerCase())
    .filter(Boolean);
  const modal = document.createElement('div');
  modal.id = 'kpsc-partner-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title">${partner ? 'Edit Partner' : 'Add Partner'}</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closePartnerModal()">✕</button>
      </div>
      <div class="k-modal-body">
        <label class="k-label">Full Name</label>
        <input id="kp-full-name" class="k-input" value="${esc(partner?.fullName || '')}" />
        <div id="kp-name-warn" class="k-hint" style="color:var(--amber);display:none;margin-top:2px">⚠️ A partner with this name already exists — check it's not a duplicate.</div>
        <script>
          (function(){
            var names = ${JSON.stringify(otherNames)};
            var input = document.getElementById('kp-full-name');
            var warn = document.getElementById('kp-name-warn');
            function check(){ if(!input||!warn) return; var v=(input.value||'').trim().toLowerCase(); warn.style.display = v && names.indexOf(v) !== -1 ? 'block' : 'none'; }
            if (input) { input.addEventListener('input', check); check(); }
          })();
        </script>
        <label class="k-label">Phone</label>
        <div style="display:flex;gap:8px;align-items:flex-start">
          <div style="flex:0 0 auto">
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Country code</div>
            <input id="kp-phone-cc" class="k-input" type="tel" inputmode="numeric"
              style="width:76px;text-align:center" maxlength="5"
              value="${esc(_partnerPhoneParts(partner?.phone).cc)}" placeholder="234" />
          </div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Number (with or without leading 0)</div>
            <input id="kp-phone-local" class="k-input" type="tel" inputmode="numeric"
              value="${esc(_partnerPhoneParts(partner?.phone).local)}"
              placeholder="09157870471 or 9157870471" />
          </div>
        </div>
        <p class="k-hint" style="margin-top:4px">Saved as <code id="kp-phone-preview">${esc(_normalizePartnerPhone(_partnerPhoneParts(partner?.phone).cc, _partnerPhoneParts(partner?.phone).local) || '—')}</code>
          <script>
            (function(){
              function upd(){var cc=document.getElementById('kp-phone-cc'),loc=document.getElementById('kp-phone-local'),pre=document.getElementById('kp-phone-preview');if(!cc||!loc||!pre)return;var c=cc.value.replace(/\\D/g,''),l=loc.value.replace(/\\D/g,'').replace(/^0+/,'');pre.textContent=c&&l?c+l:'—';}
              ['kp-phone-cc','kp-phone-local'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener('input',upd);});
            })();
          </script>
        </p>
        <label class="k-label">Partnership Type</label>
        <select id="kp-type" class="k-input">
          <option value="gods_kingdom_partner" ${(partner?.partnershipType || '') === 'gods_kingdom_partner' ? 'selected' : ''}>God's Kingdom Partner</option>
          <option value="covenant_partner" ${(partner?.partnershipType || '') === 'covenant_partner' ? 'selected' : ''}>Covenant Partner</option>
        </select>
        <label class="k-label">Monthly Pledge (private)</label>
        <input id="kp-pledge" class="k-input" type="number" min="0" value="${Number(partner?.monthlyPledge || 0)}" />
        <label class="k-label">Status</label>
        <select id="kp-status" class="k-input">
          <option value="active" ${(partner?.status || 'active') === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${(partner?.status || '') === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
        <label class="k-label">Start Date</label>
        <input id="kp-start-date" type="date" class="k-input" value="${esc(partner?.startDate || today())}" />
        <label class="k-label">Reminder Preference</label>
        <select id="kp-reminder-pref" class="k-input">
          <option value="sms" ${(partner?.reminderPreference || 'sms') === 'sms' ? 'selected' : ''}>SMS</option>
          <option value="whatsapp" ${(partner?.reminderPreference || '') === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
          <option value="none" ${(partner?.reminderPreference || '') === 'none' ? 'selected' : ''}>None</option>
        </select>
        <label class="k-label">Notes (private)</label>
        <textarea id="kp-notes" class="k-input k-textarea" style="min-height:60px">${esc(partner?.notes || '')}</textarea>
        <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:10px">Public Partnership Page</div>
          <label class="k-label">Location / City (shown publicly if listed)</label>
          <input id="kp-location" class="k-input" placeholder="e.g. Aguleri · Lagos · London, UK" value="${esc(partner?.location || '')}" />
          <label style="display:flex;align-items:flex-start;gap:10px;margin-top:10px;cursor:pointer;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg)">
            <input type="checkbox" id="kp-public-listing" style="margin-top:2px;accent-color:var(--green)" ${partner?.publicListing ? 'checked' : ''} />
            <span>
              <span style="display:block;font-size:13px;font-weight:600;color:var(--text)">List name on public Partners Wall</span>
              <span style="display:block;font-size:12px;color:var(--text2);margin-top:2px">Shows name and location only — pledge amount is never shown publicly</span>
            </span>
          </label>
        </div>
        ${partner ? `
        <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:10px">SMS Delivery Controls</div>
          <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg)">
            <input type="checkbox" id="kp-opted-out" style="margin-top:2px;accent-color:var(--red)" ${partner?.optedOut ? 'checked' : ''} />
            <span>
              <span style="display:block;font-size:13px;font-weight:600;color:var(--text)">Opted out of SMS</span>
              <span style="display:block;font-size:12px;color:var(--text2);margin-top:2px">Check this if the partner has asked not to receive any automated SMS. All sends (reminders, thank-you, welcome, etc.) will be skipped for them.</span>
            </span>
          </label>
          ${partner?.dndFlagged ? `
          <label style="display:flex;align-items:flex-start;gap:10px;margin-top:8px;cursor:pointer;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg)">
            <input type="checkbox" id="kp-clear-dnd" style="margin-top:2px;accent-color:var(--green)" />
            <span>
              <span style="display:block;font-size:13px;font-weight:600;color:var(--text)">🚫 Currently flagged DND — clear this flag</span>
              <span style="display:block;font-size:12px;color:var(--text2);margin-top:2px">Termii reported this number as being on the Do-Not-Disturb registry, so it's excluded from all automated SMS. Check this box and save if you've confirmed the number is fine (e.g. it received a message directly, or this was a false positive).</span>
            </span>
          </label>` : ''}
        </div>` : ''}
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-primary" onclick="Kpsc.savePartner('${partner?.id || ''}', this)">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function closePartnerModal() {
  document.getElementById('kpsc-partner-modal')?.remove();
}

async function savePartner(id, btn) {
  const fullName = document.getElementById('kp-full-name')?.value.trim() || '';
  if (!fullName) { showToast('Full name is required.', 'warn'); return; }
  const monthlyPledge = Number(document.getElementById('kp-pledge')?.value || 0);
  if (!Number.isFinite(monthlyPledge) || monthlyPledge < 0) {
    showToast('Monthly pledge cannot be negative.', 'warn');
    return;
  }
  const localRaw = document.getElementById('kp-phone-local')?.value || '';
  const localDigits = String(localRaw).replace(/\D/g, '').replace(/^0+/, '');
  const reminderPreference = document.getElementById('kp-reminder-pref')?.value || 'sms';
  if (localDigits && (localDigits.length < 7 || localDigits.length > 11)) {
    showToast('That phone number looks incomplete — check the digits and try again.', 'warn');
    return;
  }
  if (!localDigits && reminderPreference !== 'none') {
    showToast('Add a phone number, or set Reminder Preference to "None" if this partner has none.', 'warn');
    return;
  }
  const payload = {
    fullName,
    phone: _normalizePartnerPhone(
      document.getElementById('kp-phone-cc')?.value,
      localRaw
    ),
    partnershipType: document.getElementById('kp-type')?.value || 'gods_kingdom_partner',
    monthlyPledge,
    status: document.getElementById('kp-status')?.value || 'active',
    startDate: document.getElementById('kp-start-date')?.value || '',
    reminderPreference,
    notes: document.getElementById('kp-notes')?.value.trim() || '',
    location: document.getElementById('kp-location')?.value.trim() || '',
    publicListing: document.getElementById('kp-public-listing')?.checked ? 1 : 0,
    optedOut: document.getElementById('kp-opted-out')?.checked ? 1 : 0,
    createdBy: S.user?.name || '',
  };
  // Only clear the DND flag when the admin explicitly checks it — it's otherwise
  // a one-way flag set by delivery reports, so don't touch it unless asked to.
  if (document.getElementById('kp-clear-dnd')?.checked) payload.dndFlagged = 0;
  btn.disabled = true;
  const res = id ? await apiPut(`kpsc-partners/${id}`, payload) : await apiPost('kpsc-partners', payload);
  if (res?.error) {
    showToast(res.error, 'error');
    btn.disabled = false;
    return;
  }
  closePartnerModal();
  await renderPartners(document.getElementById('kpsc-main'));
  showToast('Partner saved', 'success');
}

function togglePartnerMonth(partnerId, month, year, paid) {
  if (paid) {
    // Marking a month paid must go through the same mandatory "recorded in physical
    // card?" question as the Record Payment modal, so this shortcut can't be used to
    // create paid records that silently skip that tracking.
    _confirmMarkMonthPaid(partnerId, month, year);
    return;
  }
  const mName = monthName(month);
  requirePin(
    `Confirm: ${mName} ${year}`,
    `Enter your PIN to mark as unpaid for this partner. This helps prevent accidental changes.`,
    () => _doTogglePartnerMonth(partnerId, month, year, false)
  );
}

function _confirmMarkMonthPaid(partnerId, month, year) {
  document.getElementById('k-pin-confirm-modal')?.remove();
  const mName = monthName(month);
  const overlay = document.createElement('div');
  overlay.className = 'k-pin-confirm-overlay';
  overlay.id = 'k-pin-confirm-modal';
  overlay.innerHTML = `
    <div class="k-pin-confirm-box">
      <div class="k-pin-confirm-title">Confirm: ${esc(mName)} ${year}</div>
      <div class="k-pin-confirm-sub">Enter your PIN to mark as paid for this partner.</div>
      <div style="text-align:left;margin:10px 0 4px">
        <label class="k-label" style="font-size:12px">Recorded in physical card? <span style="color:var(--red)">*</span></label>
        <div class="k-cardrec-group" id="k-quickpay-card-group">
          <label class="k-cardrec-option" data-value="yes" onclick="Kpsc._selectCardRecorded(this,'yes')">
            <input type="radio" name="k-quickpay-card-recorded" value="yes" /> ✅ Yes
          </label>
          <label class="k-cardrec-option" data-value="no" onclick="Kpsc._selectCardRecorded(this,'no')">
            <input type="radio" name="k-quickpay-card-recorded" value="no" /> ❌ Not yet
          </label>
        </div>
        <div id="k-quickpay-card-err" class="k-cardrec-error">Please select whether this has been recorded in the physical card.</div>
      </div>
      <input id="k-pin-confirm-input" class="k-pin-confirm-input" type="password" inputmode="numeric" maxlength="6" placeholder="••••••" autofocus />
      <div class="k-pin-confirm-err" id="k-pin-confirm-err"></div>
      <div class="k-pin-confirm-btns">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-pin-confirm-modal')?.remove()">Cancel</button>
        <button class="kbtn kbtn-primary" id="k-pin-confirm-btn" onclick="Kpsc._submitQuickPayConfirm('${partnerId}', ${month}, ${year})">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('keydown', e => { if (e.key === 'Enter') Kpsc._submitQuickPayConfirm(partnerId, month, year); });
  document.getElementById('k-pin-confirm-input')?.focus();
}

async function _submitQuickPayConfirm(partnerId, month, year) {
  const cardVal = document.querySelector('input[name="k-quickpay-card-recorded"]:checked')?.value;
  if (cardVal !== 'yes' && cardVal !== 'no') {
    const err = document.getElementById('k-quickpay-card-err');
    if (err) err.style.display = 'block';
    return;
  }
  const pin = document.getElementById('k-pin-confirm-input')?.value.trim() || '';
  const errEl = document.getElementById('k-pin-confirm-err');
  const btn = document.getElementById('k-pin-confirm-btn');
  if (!pin) { if (errEl) errEl.textContent = 'Please enter your PIN.'; return; }
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const res = await apiPost('kpsc-login', { accountId: S.user?.id, pin, role: S.user?.role }).catch(() => ({ error: 'Network error' }));
  if (btn) { btn.disabled = false; btn.textContent = orig; }
  if (res?.error) {
    if (errEl) errEl.textContent = 'Incorrect PIN. Please try again.';
    const input = document.getElementById('k-pin-confirm-input');
    if (input) { input.value = ''; input.focus(); }
    return;
  }
  document.getElementById('k-pin-confirm-modal')?.remove();
  _doTogglePartnerMonth(partnerId, month, year, true, cardVal === 'yes');
}

async function _doTogglePartnerMonth(partnerId, month, year, paid, cardRecorded) {
  if (!paid) {
    const payment = S.partnerPayments.find(p => p.partnerId === partnerId && p.month === month && p.year === year && p.paymentType === 'monthly_pledge');
    if (payment) {
      const res = await apiDelete(`kpsc-partner-payments/${payment.id}`);
      if (res?.error) { showToast(res.error, 'error'); return; }
    }
  } else {
    const partner = S.partners.find(p => p.id === partnerId);
    const res = await apiPost('kpsc-partner-payments', {
      partnerId,
      year,
      month,
      amount: Number(partner?.monthlyPledge || 0),
      paymentType: 'monthly_pledge',
      source: 'partnership',
      paid: true,
      paidAt: new Date().toISOString(),
      recordedBy: S.user?.name || '',
      cardRecorded: !!cardRecorded,
    });
    if (res?.error) { showToast(res.error, 'error'); return; }
  }
  await Promise.all([loadPartnerData(year), loadPendingCardPayments()]);
  if (S._partnerDetailId) {
    renderPartnerDetail(document.getElementById('kpsc-main'));
  } else {
    const list = document.getElementById('kpsc-partners-list');
    if (list) list.innerHTML = renderPartnersList(canManagePartners());
  }
}

function partnerTypeLabel(type) {
  const map = {
    gods_kingdom_partner: "God's Kingdom Partner",
    covenant_partner: 'Covenant Partner',
  };
  return map[String(type || '').toLowerCase()] || String(type || '').replace(/_/g, ' ');
}

function setPartnersFilter(filter) {
  S.partnersFilter = filter;
  const list = document.getElementById('kpsc-partners-list');
  if (list) list.innerHTML = renderPartnersList(canManagePartners());
  const statusTabs = document.getElementById('k-partner-status-tabs');
  if (statusTabs) {
    statusTabs.querySelectorAll('.k-tab').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === filter));
  }
}

function setPartnersTypeFilter(type) {
  S.partnersTypeFilter = type || '';
  const list = document.getElementById('kpsc-partners-list');
  if (list) list.innerHTML = renderPartnersList(canManagePartners());
}

async function setPartnersYear(year) {
  S.partnersYear = Number(year) || currentYear();
  await loadPartnerData(S.partnersYear);
  const list = document.getElementById('kpsc-partners-list');
  if (list) list.innerHTML = renderPartnersList(canManagePartners());
}

function setPartnersMonth(month) {
  S.partnersMonth = Number(month) || currentMonth();
  const list = document.getElementById('kpsc-partners-list');
  if (list) list.innerHTML = renderPartnersList(canManagePartners());
}

function setPartnersPaymentFilter(filter) {
  S.partnersPaymentFilter = String(filter || 'all');
  const list = document.getElementById('kpsc-partners-list');
  if (list) list.innerHTML = renderPartnersList(canManagePartners());
  const paymentTabs = document.getElementById('k-partner-payment-tabs');
  if (paymentTabs) {
    paymentTabs.querySelectorAll('.k-tab').forEach(b => b.classList.toggle('active', b.dataset.filter === S.partnersPaymentFilter));
  }
}

function isBeforePartnerStart(partner, month, year) {
  if (!partner.startDate) return false;
  const d = new Date(partner.startDate);
  const sy = d.getUTCFullYear(), sm = d.getUTCMonth() + 1;
  return year < sy || (year === sy && month < sm);
}

function deletePartner(id) {
  const partner = S.partners.find(p => p.id === id);
  if (!partner) return;
  document.getElementById('k-delete-partner-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'k-modal-overlay';
  modal.id = 'k-delete-partner-modal';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:420px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">🗑 Delete Partner</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-delete-partner-modal')?.remove()">✕</button>
      </div>
      <div class="k-modal-body">
        <p style="font-size:14px;color:var(--text2);line-height:1.65">
          Delete <strong>${esc(partner.fullName)}</strong>? Their profile and monthly payment log will be removed from this list.
          Money already recorded in Finance for past payments stays on the books — it just won't be linked to this partner's name anymore.
        </p>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-delete-partner-modal')?.remove()">Cancel</button>
        <button class="kbtn kbtn-danger" onclick="document.getElementById('k-delete-partner-modal')?.remove();Kpsc._confirmDeletePartner('${id}')">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function _confirmDeletePartner(id) {
  const res = await apiDelete(`kpsc-partners/${id}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  await renderPartners(document.getElementById('kpsc-main'));
  showToast('Partner deleted.', 'success');
}

async function openPartnerDetail(partnerId) {
  const main = document.getElementById('kpsc-main');
  main.innerHTML = '<div class="k-loading">Loading partner history…</div>';
  document.getElementById('kpsc-back-btn').style.display = '';
  document.getElementById('kpsc-page-title').textContent = 'Partner History';
  S.page = 'partnerDetail';
  S.group = 'money';
  S.subTab = null;
  document.querySelectorAll('.ka-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.group === 'money');
  });
  updateFab();
  S._partnerDetailId = partnerId;
  S._partnerDetailYear = S.partnersYear;
  await loadPartnerData(S._partnerDetailYear);
  renderPartnerDetail(main);
}

function renderPartnerDetail(main) {
  const partner = S.partners.find(p => p.id === S._partnerDetailId);
  if (!partner) { main.innerHTML = '<div class="k-page"><div class="k-empty">Partner not found.</div></div>'; return; }
  const year = S._partnerDetailYear;
  const canManage = canManagePartners();
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const now = new Date();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;

  const gridCells = months.map(m => {
    const payment = S.partnerPayments.find(p => p.partnerId === partner.id && Number(p.month) === m && Number(p.year) === year && p.paid && p.paymentType === 'monthly_pledge');
    const isPaid = !!payment;
    const isFuture = year > nowYear || (year === nowYear && m > nowMonth);
    const isPreStart = !isPaid && isBeforePartnerStart(partner, m, year);
    const cls = isPreStart ? 'k-pgrid-cell k-pgrid-prestart' : isFuture ? 'k-pgrid-cell k-pgrid-future' : isPaid ? 'k-pgrid-cell k-pgrid-paid' : 'k-pgrid-cell k-pgrid-unpaid';
    const icon = isPreStart ? '·' : isFuture ? '·' : isPaid ? '✓' : '✗';
    const clickable = canManage && !isFuture && !isPreStart;
    const amtHtml = isPaid && payment.amount > 0 ? `<span class="k-pgrid-amount">₦${Number(payment.amount).toLocaleString('en-NG')}</span>` : '';
    const recHtml = isPaid && payment.recordedBy ? `<span class="k-pgrid-recorder">${esc(payment.recordedBy.split(' ')[0])}</span>` : '';
    const titleTip = isPaid
      ? `${monthName(m)} · ₦${Number(payment.amount||0).toLocaleString('en-NG')}${payment.recordedBy ? ' · by ' + payment.recordedBy : ''}${payment.reference ? ' · ' + payment.reference : ''}`
      : isPreStart ? `${monthName(m)}: Not started yet` : monthName(m);
    return `<div class="${cls}${clickable ? ' k-pgrid-clickable' : ''}" title="${esc(titleTip)}" ${clickable ? `onclick="Kpsc.togglePartnerMonth('${partner.id}', ${m}, ${year}, ${!isPaid})"` : ''}>
      <span class="k-pgrid-month">${monthName(m).slice(0,3)}</span>
      <span class="k-pgrid-icon">${icon}</span>
      ${amtHtml}${recHtml}
    </div>`;
  }).join('');

  const paidCount = months.filter(m => partnerMonthlyPaid(partner.id, m, year)).length;
  const yearOptions = [nowYear, nowYear-1, nowYear-2].map(y => `<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('');

  const yearPayments = S.partnerPayments
    .filter(p => p.partnerId === partner.id && Number(p.year) === year && p.paid && p.paymentType === 'monthly_pledge')
    .sort((a, b) => Number(a.month) - Number(b.month));

  const totalPaid = yearPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingCardMonths = yearPayments.filter(p => p.cardRecorded === false);

  const paymentLogRows = yearPayments.length ? yearPayments.map(p => {
    const method = String(p.reference || '').toLowerCase();
    const methodBadge = method === 'transfer'
      ? `<span class="pl-method pl-transfer">🏦 Transfer</span>`
      : method === 'cash'
      ? `<span class="pl-method pl-cash">💵 Cash</span>`
      : method ? `<span class="pl-method pl-cash">${esc(method)}</span>` : '—';
    const dateStr = p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-NG', { day:'numeric', month:'short' }) : '—';
    const canFin = canManageFinance();
    const menuId = `pl-ctx-${p.id}`;
    const ctxMenu = canFin ? `
      <div style="position:relative;display:inline-block">
        <button class="k-card-ctx-btn" style="font-size:16px;width:28px;height:28px" onclick="event.stopPropagation();const m=document.getElementById('${menuId}');m.style.display=m.style.display==='block'?'none':'block'">⋮</button>
        <div id="${menuId}" class="k-card-ctx-menu" style="display:none;right:0;left:auto;min-width:120px" onclick="event.stopPropagation()">
          <button onclick="document.getElementById('${menuId}').style.display='none';Kpsc.editPartnerPaymentWithPin('${p.id}','${partner.id}')">✏️ Edit</button>
          <button class="k-ctx-danger" onclick="document.getElementById('${menuId}').style.display='none';Kpsc.deletePartnerPaymentWithPin('${p.id}','${partner.id}')">🗑 Delete</button>
        </div>
      </div>` : '';
    return `<tr>
      <td><strong>${monthName(Number(p.month))}</strong></td>
      <td class="pl-amount">₦${Number(p.amount||0).toLocaleString('en-NG')}</td>
      <td>${methodBadge}</td>
      <td style="color:var(--text2)">${esc(p.recordedBy || '—')}</td>
      <td style="color:var(--text3)">${dateStr}</td>
      <td style="text-align:right">${ctxMenu}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px">No payments recorded for ${year}.</td></tr>`;

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section">
        <div class="k-section-hdr" style="margin-bottom:8px">
          <h2>${esc(partner.fullName)}</h2>
          <select class="k-input k-input-sm" style="width:auto" onchange="Kpsc.setPartnerDetailYear(this.value)">${yearOptions}</select>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span class="kbadge badge-type">${esc(partnerTypeLabel(partner.partnershipType))}</span>
          <span class="kbadge ${partner.status === 'active' ? 'badge-green' : 'badge-gray'}">${partner.status === 'active' ? 'Active' : 'Inactive'}</span>
          ${partner.startDate ? `<span class="kbadge badge-gray">Since ${esc(fmtDate(partner.startDate))}</span>` : ''}
          ${partner.phone ? `<span class="kbadge badge-gray">📞 ${esc(partner.phone)}</span>` : ''}
        </div>
        <div class="k-about-row"><span class="k-about-label">Year</span><span>${year}</span></div>
        <div class="k-about-row"><span class="k-about-label">Months Paid</span><span>${paidCount} / 12</span></div>
        <div class="k-about-row"><span class="k-about-label">Progress</span><span>${Math.round((paidCount/12)*100)}%</span></div>
        ${canManageFinance() ? `<div class="k-about-row"><span class="k-about-label">Monthly Pledge</span><span>₦${Number(partner.monthlyPledge||0).toLocaleString('en-NG')}/mo</span></div>` : ''}
        ${canManageFinance() && totalPaid > 0 ? `<div class="k-about-row"><span class="k-about-label">Total Paid (${year})</span><span style="font-weight:700;color:var(--navy)">₦${totalPaid.toLocaleString('en-NG')}</span></div>` : ''}
      </div>
      <div class="k-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <h3 class="k-sec-title" style="margin:0">${year} Payment Calendar</h3>
          ${canManageFinance() ? `<button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.openRecordPaymentModal('${partner.id}')">💳 Record Payment</button>` : ''}
        </div>
        ${canManage ? `<p class="k-hint" style="margin-bottom:12px">Tap a month to toggle paid/unpaid (PIN required). Green cells show the amount paid. Hover for details.</p>` : ''}
        <div class="k-payment-grid">${gridCells}</div>
        ${pendingCardMonths.length ? `
        <div class="k-cardrec-pending-list">
          <div class="k-cardrec-pending-hdr">📇 Not yet recorded in the physical card:</div>
          ${pendingCardMonths.map(p => `
            <div class="k-cardrec-pending-row">
              <span>${monthName(Number(p.month))} ${year} — ₦${Number(p.amount || 0).toLocaleString('en-NG')}</span>
              ${canManageFinance() ? `<button class="kbtn kbtn-sm kbtn-success" onclick="Kpsc.markPaymentCardRecorded('${p.id}', this)">✓ Mark card updated</button>` : ''}
            </div>`).join('')}
        </div>` : ''}
      </div>
      <div class="k-section">
        <h3 class="k-sec-title">${year} Payment Log</h3>
        <div style="overflow-x:auto">
          <table class="k-payment-log">
            <thead><tr><th>Month</th><th>Amount</th><th>Method</th><th>Recorded by</th><th>Date</th><th></th></tr></thead>
            <tbody>${paymentLogRows}</tbody>
          </table>
        </div>
      </div>
      ${partner.notes ? `<div class="k-section"><h3 class="k-sec-title">Notes (private)</h3><p style="font-size:14px;color:var(--text2);line-height:1.65">${esc(partner.notes)}</p></div>` : ''}
      <div style="margin-top:12px">
        <button class="kbtn" onclick="Kpsc.goBack()">← Back</button>
      </div>
    </div>`;
}

async function setPartnerDetailYear(year) {
  S._partnerDetailYear = Number(year) || currentYear();
  await loadPartnerData(S._partnerDetailYear);
  renderPartnerDetail(document.getElementById('kpsc-main'));
}

const INGEST_OUTCOME_LABELS = {
  inserted: 'Recorded',
  skipped_not_charge: 'Not a charge',
  skipped_duplicate: 'Duplicate',
  skipped_wrong_account: 'Wrong account',
  error: 'Error',
  pending: 'Pending',
};
const INGEST_OUTCOME_BADGES = {
  inserted: 'badge-green',
  skipped_not_charge: 'badge-gray',
  skipped_duplicate: 'badge-gray',
  skipped_wrong_account: 'badge-red',
  error: 'badge-red',
  pending: 'badge-blue',
};

function renderEmailIngestStatusCard(ingestLogRes) {
  const entries = Array.isArray(ingestLogRes?.entries) ? ingestLogRes.entries : [];
  const counts = ingestLogRes?.counts || {};
  const needsAttention = !!ingestLogRes?.needsAttention;
  const flaggedCount = (counts.error || 0) + (counts.skipped_wrong_account || 0);

  const statusClass = needsAttention ? 'k-status-warn' : (entries.length ? 'k-status-ai' : 'k-status-rule');
  const statusText = needsAttention
    ? `⚠️ Needs attention — ${flaggedCount} item${flaggedCount === 1 ? '' : 's'} flagged in recent activity`
    : (entries.length ? `🤖 Automation healthy — last activity ${esc(fmtDateTime(ingestLogRes.lastActivityAt))}` : 'No automated bank-charge emails processed yet.');

  return `
    <details class="k-collapsible kf-email-automation" id="kf-email-automation" style="margin-bottom:16px">
      <summary class="k-collapsible-hdr">
        <span class="k-collapsible-title">🤖 Bank Charge Automation</span>
        <span class="k-collapsible-summary">${needsAttention ? '⚠️ Needs attention' : (entries.length ? '✅ Healthy' : 'No activity yet')}</span>
      </summary>
      <div class="k-settings-status ${statusClass}">
        ${statusText}
        ${needsAttention ? `<button class="kbtn kbtn-sm kbtn-ghost" style="margin-left:10px" onclick="Kpsc.ackEmailIngestAttention('${esc(ingestLogRes.lastActivityAt || '')}')">Mark as reviewed</button>` : ''}
      </div>
      ${entries.length ? `
      <div class="kf-email-automation-counts">
        <span>✅ ${counts.inserted || 0} recorded</span>
        <span>⏭️ ${(counts.skipped_not_charge || 0) + (counts.skipped_duplicate || 0)} skipped</span>
        <span style="color:${(counts.skipped_wrong_account || 0) > 0 ? 'var(--red)' : 'inherit'}">🚫 ${counts.skipped_wrong_account || 0} wrong account</span>
        <span style="color:${(counts.error || 0) > 0 ? 'var(--red)' : 'inherit'}">❌ ${counts.error || 0} error${counts.error === 1 ? '' : 's'}</span>
      </div>
      <div class="k-meeting-list" style="max-height:280px;overflow-y:auto">
        ${entries.map(e => `
          <div class="k-meeting-card" style="cursor:default">
            <div class="k-mc-top">
              <div class="k-mc-title">${esc(e.subject || '(no subject)')}</div>
              <span class="kbadge ${INGEST_OUTCOME_BADGES[e.outcome] || 'badge-gray'}">${esc(INGEST_OUTCOME_LABELS[e.outcome] || e.outcome)}</span>
            </div>
            <div class="k-mc-meta"><span class="k-hint">${esc(fmtDateTime(e.createdAt))}</span></div>
            ${(e.outcome === 'error' || e.outcome === 'skipped_wrong_account') && e.errorDetail ? `<div class="k-page-hint" style="margin-top:4px;color:var(--red)">⚠️ ${esc(e.errorDetail)}</div>` : ''}
          </div>`).join('')}
      </div>` : ''}
    </details>`;
}

async function ackEmailIngestAttention(lastActivityAt) {
  await apiPost('settings', { kpsc_email_ingest_ack_at: lastActivityAt || '' });
  await renderFinance(document.getElementById('kpsc-main'));
}

async function renderFinance(main) {
  const year = S.financeYear;
  const month = S.financeMonth;
  const [financeRes, partnersRes, allTimeRes, settingsRes, ingestLogRes] = await Promise.all([
    apiGet(`kpsc-finance?year=${year}${month ? `&month=${month}` : ''}`),
    apiGet('kpsc-partners'),
    apiGet('kpsc-finance?year=all'),
    apiGet('settings'),
    apiGet('kpsc-email-ingest-log'),
  ]);
  if (financeRes?.error) throw new Error(financeRes.error);
  if (partnersRes?.error) throw new Error(partnersRes.error);
  S.financeEntries = Array.isArray(financeRes) ? financeRes : [];
  S.partners = Array.isArray(partnersRes) ? partnersRes : [];
  S.allFinanceEntries = Array.isArray(allTimeRes) ? allTimeRes : [];
  const minimumBalance = Number(settingsRes?.kpsc_minimum_balance || 0);
  S.financeMinimumBalance = minimumBalance;
  _cacheRechargeBankDetails(settingsRes);

  // Reset filter/sort state on every full page load
  S.financeSearch = '';
  S.financeTypeFilter = 'all';
  S.financeCatFilter = '';
  S.financeMethodFilter = '';
  S.financeSortCol = 'date';
  S.financeSortAsc = false;

  const canManage = canManageFinance();
  const canDelete = canDeleteFinanceEntries();

  const incomeEntries  = S.financeEntries.filter(e => e.entryType === 'income');
  const expenseEntries = S.financeEntries.filter(e => e.entryType === 'expense');
  const incomeTotal  = incomeEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const expenseTotal = expenseEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const partnerIncome = incomeEntries.filter(e => (e.category || '').startsWith('partnership')).reduce((s, e) => s + Number(e.amount || 0), 0);
  const unlinkedCount = incomeEntries.filter(e => (e.category || '').startsWith('partnership') && !e.partnerId).length;

  const nowYear = currentYear();
  const nowMonth = new Date().getUTCMonth() + 1;
  const isCurrentPeriod = year === nowYear && (!month || month === nowMonth);

  // Compute cumulative balance as of end of selected period
  let balanceCutoff;
  if (month) {
    balanceCutoff = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  } else {
    balanceCutoff = year === nowYear
      ? new Date().toISOString().slice(0, 10)
      : `${year}-12-31`;
  }
  const balanceEntries = isCurrentPeriod
    ? S.allFinanceEntries
    : S.allFinanceEntries.filter(e => (e.date || '') <= balanceCutoff);
  const balanceIncome  = balanceEntries.filter(e => e.entryType === 'income').reduce((s, e) => s + Number(e.amount || 0), 0);
  const balanceExpense = balanceEntries.filter(e => e.entryType === 'expense').reduce((s, e) => s + Number(e.amount || 0), 0);
  const currentBalance = balanceIncome - balanceExpense;
  S.financeBalance = currentBalance;
  S.financeBalanceIsCurrentPeriod = isCurrentPeriod;
  const availableForProjects = currentBalance - minimumBalance;
  const yearOpts = [nowYear, nowYear-1, nowYear-2].map(y => `<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('');
  const monthOpts = [0,1,2,3,4,5,6,7,8,9,10,11,12].map(m =>
    `<option value="${m}" ${month===m?'selected':''}>${m===0?'All Months':monthName(m)}</option>`
  ).join('');

  const allCategories = [...new Set(S.financeEntries.map(e => e.category).filter(Boolean))].sort();
  const catFilterOpts = `<option value="">All Categories</option>` +
    allCategories.map(c => `<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('');
  const methodFilterOpts = `<option value="">All Methods</option>` +
    ['cash','bank_transfer','pos','cheque','other'].map(m =>
      `<option value="${m}">${m.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())}</option>`
    ).join('');
  const periodLabel = month ? `${monthName(month)} ${year}` : `Year ${year}`;

  main.innerHTML = `
    <div class="k-page">

      <div class="k-dash-stats kf-stat-6">
        <div class="k-stat">
          <div class="k-stat-val" style="color:var(--green)">₦${Math.round(incomeTotal).toLocaleString('en-NG')}</div>
          <div class="k-stat-sub">${incomeEntries.length} entr${incomeEntries.length===1?'y':'ies'}</div>
          <div class="k-stat-lbl">Income</div>
        </div>
        <div class="k-stat">
          <div class="k-stat-val" style="color:var(--red)">₦${Math.round(expenseTotal).toLocaleString('en-NG')}</div>
          <div class="k-stat-sub">${expenseEntries.length} entr${expenseEntries.length===1?'y':'ies'}</div>
          <div class="k-stat-lbl">Expenses</div>
        </div>
        <div class="k-stat k-stat-balance ${currentBalance < 0 ? 'k-stat-balance-deficit' : ''}">
          <div class="k-stat-val" style="color:${currentBalance>=0?'var(--navy)':'var(--red)'}">₦${Math.round(Math.abs(currentBalance)).toLocaleString('en-NG')}</div>
          <div class="k-stat-sub" style="color:${currentBalance>=0?'var(--green)':'var(--red)'}">${currentBalance>=0?'Surplus':'Deficit'}</div>
          <div class="k-stat-lbl">${isCurrentPeriod ? 'Current Balance' : `Balance · end of ${periodLabel}`}</div>
        </div>
        <div class="k-stat">
          <div class="k-stat-val" style="color:var(--navy)">₦${Math.round(partnerIncome).toLocaleString('en-NG')}</div>
          <div class="k-stat-lbl">Partner Income</div>
        </div>
        <div class="k-stat ${availableForProjects < 0 ? 'k-stat-balance-deficit' : 'k-stat-highlight'}" title="${minimumBalance > 0 ? `Balance above the ₦${Math.round(minimumBalance).toLocaleString('en-NG')} minimum kept in reserve` : 'Set a minimum balance in Settings to compute this'}">
          <div class="k-stat-val" style="color:${availableForProjects<0?'var(--red)':'var(--amber)'}">₦${Math.round(Math.abs(availableForProjects)).toLocaleString('en-NG')}</div>
          <div class="k-stat-sub" style="color:${availableForProjects<0?'var(--red)':'var(--text3)'}">${availableForProjects<0 ? 'Below minimum balance' : `above ₦${Math.round(minimumBalance).toLocaleString('en-NG')} minimum`}</div>
          <div class="k-stat-lbl">Available for Projects</div>
        </div>
        <div class="k-stat ${unlinkedCount > 0 ? 'k-stat-highlight' : ''}">
          <div class="k-stat-val" style="color:${unlinkedCount>0?'var(--amber)':'var(--navy)'}">${unlinkedCount}</div>
          <div class="k-stat-lbl">Unlinked Entries</div>
        </div>
      </div>

      ${renderEmailIngestStatusCard(ingestLogRes)}

      ${canManage ? '<div id="k-cash-card-mount"></div>' : ''}

      <div class="k-section-hdr">
        <h2>Finance Entries</h2>
        <div class="kf-controls-right">
          <select class="k-input k-input-sm" style="width:auto" onchange="Kpsc.setFinanceYear(this.value)">${yearOpts}</select>
          <select class="k-input k-input-sm" style="width:auto" onchange="Kpsc.setFinanceMonth(this.value)">${monthOpts}</select>
          ${canManage ? `<button class="kbtn kbtn-primary kbtn-sm" onclick="Kpsc.openFinanceModal()">+ New Entry</button>` : ''}
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.exportFinanceCsv()" title="Download as CSV">⬇ CSV</button>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.openFinanceReportModal()" title="Generate Finance Report">📊 Report</button>
        </div>
      </div>

      <div class="kf-filter-bar">
        <input type="search" id="kf-search" class="k-input kf-search-input" placeholder="Search narration, reference, partner…" oninput="Kpsc.setFinanceSearch(this.value)" />
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="kbtn kbtn-sm kf-type-chip active" data-type="all" onclick="Kpsc.setFinanceTypeFilter('all')">All</button>
          <button class="kbtn kbtn-sm kf-type-chip" data-type="income" onclick="Kpsc.setFinanceTypeFilter('income')">Income</button>
          <button class="kbtn kbtn-sm kf-type-chip" data-type="expense" onclick="Kpsc.setFinanceTypeFilter('expense')">Expense</button>
        </div>
        ${allCategories.length > 1 ? `<select class="k-input k-input-sm" style="width:auto;flex-shrink:0" onchange="Kpsc.setFinanceCatFilter(this.value)">${catFilterOpts}</select>` : ''}
        <select class="k-input k-input-sm" style="width:auto;flex-shrink:0" onchange="Kpsc.setFinanceMethodFilter(this.value)">${methodFilterOpts}</select>
      </div>

      ${S.financeEntries.length > 0 ? `
      <details class="k-collapsible" id="kf-breakdown">
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">Category Breakdown</span>
          <span class="k-collapsible-summary">${esc(periodLabel)} — ${S.financeEntries.length} entries</span>
        </summary>
        ${renderFinanceCategoryBreakdown(incomeEntries, expenseEntries, incomeTotal, expenseTotal)}
      </details>` : ''}

      <div id="kf-entry-list">
        ${renderFinanceEntryList(canManage, canDelete)}
      </div>

      ${canManage ? `
      <details class="k-collapsible" id="kf-reconciliation" style="margin-top:16px">
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">Bank Reconciliation</span>
          <span class="k-collapsible-summary">Upload statement to cross-check ledger</span>
        </summary>
        <p class="k-hint" style="margin-bottom:12px">Upload your bank statement PDF for AI-assisted reconciliation, or paste the data manually as JSON.</p>
        <div class="k-tabs" style="margin-bottom:16px">
          <button class="k-tab active" id="krec-tab-pdf" onclick="Kpsc.setReconciliationTab('pdf')">📄 Upload PDF</button>
          <button class="k-tab" id="krec-tab-json" onclick="Kpsc.setReconciliationTab('json')">{ } Paste JSON</button>
        </div>
        <div id="krec-pdf-panel">
          <label class="k-label">Bank Statement PDF</label>
          <input id="krec-pdf-input" type="file" accept=".pdf,application/pdf" class="k-input" style="padding:8px" />
          <p class="k-hint">Upload a digital PDF (not scanned). The AI will extract the transaction lines automatically.</p>
          <div id="krec-stepper" style="display:none" aria-live="polite"></div>
          <div class="k-room-actions" style="margin-top:10px">
            <button class="kbtn kbtn-primary" onclick="Kpsc.runPdfReconciliation(this)">🤖 Upload &amp; Reconcile</button>
          </div>
        </div>
        <div id="krec-json-panel" style="display:none">
          <textarea id="krec-items" class="k-input k-textarea" placeholder='Paste statement JSON items here'></textarea>
          <p class="k-hint">Example: [{"date":"${year}-01-05","amount":5000,"type":"income","reference":"TRF001"}]</p>
          <div class="k-room-actions" style="margin-top:10px">
            <button class="kbtn kbtn-primary" onclick="Kpsc.runReconciliation(this)">Run Reconciliation</button>
          </div>
        </div>
        <div id="krec-result"></div>
      </details>` : ''}

    </div>`;
  if (canManage) loadCashCollection(); // refresh embedded card after finance page loads
}

async function openFinanceModal(entryToEdit = null) {
  document.getElementById('kpsc-finance-modal')?.remove();
  const settingsRes = await apiGet('settings');
  const incomeCategories = Array.isArray(settingsRes?.kpsc_income_categories) ? settingsRes.kpsc_income_categories : ['partnership_payment','one_time_donation','wealth_development_offering','other_income'];
  const expenseCategoriesBase = Array.isArray(settingsRes?.kpsc_expense_categories) ? settingsRes.kpsc_expense_categories : ['projects','welfare','rent','church_support','committee_operations'];
  const expenseCategories = expenseCategoriesBase.includes('bank_charges') ? expenseCategoriesBase : [...expenseCategoriesBase, 'bank_charges'];

  const e = entryToEdit;
  const isEdit = !!e?.id;
  const incomeOpts = incomeCategories.map(c=>`<option value="${esc(c)}" ${(e?.category||''===c)?'selected':''}>${esc(catLabel(c))}</option>`).join('');
  const expenseOpts = expenseCategories.map(c=>`<option value="${esc(c)}" ${(e?.category||''===c)?'selected':''}>${esc(catLabel(c))}</option>`).join('');
  const isExpense = (e?.entryType || '') === 'expense';
  const catOpts = isExpense ? expenseOpts : incomeOpts;

  // Partner select for income + partnership_payment entries
  const partnerOpts = (S.partners || [])
    .filter(p => p.status === 'active')
    .slice().sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')))
    .map(p => `<option value="${esc(p.id)}" ${(e?.partnerId || '') === p.id ? 'selected' : ''}>${esc(p.fullName || p.name || p.id)}</option>`)
    .join('');
  const showPartner = !isExpense && e?.category === 'partnership_payment';

  const modal = document.createElement('div');
  modal.id = 'kpsc-finance-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr"><span class="k-modal-title">${isEdit ? 'Edit Finance Entry' : 'New Finance Entry'}</span><button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closeFinanceModal()">✕</button></div>
      <div class="k-modal-body">
        ${!isEdit ? `<div class="kf-scan-block">
          <input type="file" id="kf-receipt-file" accept="image/*" capture="environment" style="display:none" onchange="Kpsc.scanReceiptPhoto(this)" />
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('kf-receipt-file').click()">📷 Scan Receipt</button>
          <span id="kf-scan-status" class="k-hint" style="margin-left:8px"></span>
          <div id="kf-receipt-preview"></div>
        </div>` : ''}
        <label class="k-label">Date</label>
        <input id="kf-date" type="date" class="k-input" value="${esc(e?.date || today())}" />
        <label class="k-label">Entry Type</label>
        <select id="kf-type" class="k-input" onchange="Kpsc.updateFinanceCategoryOptions()">
          <option value="income" ${!isExpense?'selected':''}>Income</option>
          <option value="expense" ${isExpense?'selected':''}>Expense</option>
        </select>
        <label class="k-label">Category</label>
        <select id="kf-category" class="k-input" onchange="Kpsc.onFinanceCategoryChange()">${catOpts}</select>
        <div id="kf-welfare-wrap" style="display:${isExpense && (e?.category || '') === 'welfare' ? 'block' : 'none'}">
          <label class="k-label">Number of People Given Welfare Support</label>
          <select id="kf-welfare-count" class="k-input">
            ${[1,2,3,4,5,6,7,8,9,10,15,20,25,30].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </div>
        <div id="kf-partner-wrap" style="display:${showPartner ? 'block' : 'none'}">
          <label class="k-label">Partner (optional)</label>
          <select id="kf-partner" class="k-input">
            <option value="">— Not linked to a partner —</option>
            ${partnerOpts}
          </select>
          <p class="k-hint">Select to link this income to a specific partner's record.</p>
        </div>
        <label class="k-label">Amount (₦)</label>
        <input id="kf-amount" type="number" min="0" class="k-input" placeholder="0" value="${e?.amount != null ? Number(e.amount) : ''}" />
        <label class="k-label">Payment Method</label>
        <select id="kf-method" class="k-input">
          <option value="cash" ${(e?.paymentMethod||'')==='cash'?'selected':''}>Cash</option>
          <option value="bank_transfer" ${(e?.paymentMethod||'')==='bank_transfer'?'selected':''}>Bank Transfer</option>
          <option value="pos" ${(e?.paymentMethod||'')==='pos'?'selected':''}>POS</option>
          <option value="cheque" ${(e?.paymentMethod||'')==='cheque'?'selected':''}>Cheque</option>
          <option value="other" ${(e?.paymentMethod||'')==='other'?'selected':''}>Other</option>
        </select>
        <label class="k-label">Reference</label>
        <input id="kf-ref" class="k-input" placeholder="e.g. receipt number, transaction ID" value="${esc(e?.reference||'')}" />
        <label class="k-label">Narration</label>
        <textarea id="kf-note" class="k-input k-textarea" style="min-height:70px" placeholder="Brief description of this transaction…">${esc(e?.narration||'')}</textarea>
      </div>
      <div class="k-modal-footer"><button class="kbtn kbtn-primary" onclick="Kpsc.saveFinanceEntry(this)">${isEdit ? 'Save Changes' : 'Save Entry'}</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal._incomeOpts = incomeOpts;
  modal._expenseOpts = expenseOpts;
  modal._editId = e?.id || null;
  // After inserting, set the category <select> to the right value
  if (isEdit && e?.category) {
    const catEl = document.getElementById('kf-category');
    if (catEl) catEl.value = e.category;
  }
}

// Pure helper — maps raw OCR receipt response → form-field values.
// Canonical source: src/js/receipt-ocr-utils.js (ES module version used by unit tests).
function mapReceiptOcrToFormFields(ocr) {
  // date: accept YYYY-MM-DD only
  let date = null;
  if (typeof ocr?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ocr.date.trim())) {
    date = ocr.date.trim();
  }

  // amount: parse numbers permissively (strip commas, reject negative)
  let amount = null;
  if (ocr?.amount !== null && ocr?.amount !== undefined) {
    const raw = String(ocr.amount).replace(/,/g, '').trim();
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) amount = n;
  }

  // reference: prefer receipt reference, fall back to vendor
  let ref = null;
  if (typeof ocr?.reference === 'string' && ocr.reference.trim()) ref = ocr.reference.trim();
  else if (typeof ocr?.vendor === 'string' && ocr.vendor.trim()) ref = ocr.vendor.trim();

  // note: "vendor — itemsSummary"
  const parts = [
    typeof ocr?.vendor === 'string' && ocr.vendor.trim() ? ocr.vendor.trim() : null,
    typeof ocr?.itemsSummary === 'string' && ocr.itemsSummary.trim() ? ocr.itemsSummary.trim() : null,
  ].filter(Boolean);
  const note = parts.join(' — ') || null;

  return { date, amount, ref, note };
}

async function scanReceiptPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;

  const preview = document.getElementById('kf-receipt-preview');
  const status = document.getElementById('kf-scan-status');

  // Show thumbnail preview while scanning
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  if (preview) preview.innerHTML = `<img src="${dataUrl}" class="kf-receipt-thumb kf-receipt-thumb--scanning" alt="Receipt preview" />`;
  if (status) status.textContent = 'Scanning…';

  try {
    const base64 = dataUrl.split(',')[1];
    const mimeType = file.type || 'image/jpeg';
    const res = await apiPost('kpsc-ocr-receipt', { imageBase64: base64, mimeType });

    if (preview) preview.querySelector('img')?.classList.remove('kf-receipt-thumb--scanning');
    if (status) status.textContent = '';

    if (res?.error) {
      showToast('Could not read receipt. Please enter manually.', 'warn');
      return;
    }

    const fields = mapReceiptOcrToFormFields(res);
    if (fields.date) {
      const dateEl = document.getElementById('kf-date');
      if (dateEl) dateEl.value = fields.date;
    }
    if (fields.amount !== null) {
      const amtEl = document.getElementById('kf-amount');
      if (amtEl) amtEl.value = fields.amount;
    }
    if (fields.ref) {
      const refEl = document.getElementById('kf-ref');
      if (refEl) refEl.value = fields.ref;
    }
    if (fields.note) {
      const noteEl = document.getElementById('kf-note');
      if (noteEl) noteEl.value = fields.note;
    }
    if (fields.date || fields.amount !== null || fields.ref || fields.note) {
      showToast('Receipt scanned — please review and correct if needed.', 'info');
    } else {
      showToast('Could not read receipt. Please enter manually.', 'warn');
    }
  } catch (_) {
    if (preview) preview.querySelector('img')?.classList.remove('kf-receipt-thumb--scanning');
    if (status) status.textContent = '';
    showToast('Could not read receipt. Please enter manually.', 'warn');
  }
}

function closeFinanceModal() {
  document.getElementById('kpsc-finance-modal')?.remove();
}

function updateFinanceCategoryOptions() {
  const modal = document.getElementById('kpsc-finance-modal');
  if (!modal) return;
  const type = document.getElementById('kf-type')?.value;
  const cat = document.getElementById('kf-category');
  if (!cat) return;
  cat.innerHTML = type === 'expense' ? modal._expenseOpts : modal._incomeOpts;
  onFinanceCategoryChange();
}

function onFinanceCategoryChange() {
  const type = document.getElementById('kf-type')?.value;
  const cat = document.getElementById('kf-category')?.value;
  const welfareWrap = document.getElementById('kf-welfare-wrap');
  if (welfareWrap) welfareWrap.style.display = (type === 'expense' && cat === 'welfare') ? 'block' : 'none';
  const partnerWrap = document.getElementById('kf-partner-wrap');
  if (partnerWrap) partnerWrap.style.display = (type === 'income' && cat === 'partnership_payment') ? 'block' : 'none';
}


async function saveFinanceEntry(btn) {
  btn.disabled = true;
  const modal = document.getElementById('kpsc-finance-modal');
  const editId = modal?._editId || null;
  const category = document.getElementById('kf-category')?.value.trim() || '';
  const entryType = document.getElementById('kf-type')?.value || '';
  const welfareCount = (entryType === 'expense' && category === 'welfare')
    ? Number(document.getElementById('kf-welfare-count')?.value || 0)
    : 0;
  const partnerId = (entryType === 'income' && category === 'partnership_payment')
    ? (document.getElementById('kf-partner')?.value?.trim() || null)
    : null;
  const payload = {
    date: document.getElementById('kf-date')?.value || '',
    entryType,
    category,
    amount: Number(document.getElementById('kf-amount')?.value || 0),
    paymentMethod: document.getElementById('kf-method')?.value.trim() || '',
    reference: document.getElementById('kf-ref')?.value.trim() || '',
    narration: document.getElementById('kf-note')?.value.trim() || '',
    recordedBy: S.user?.name || '',
    welfareCount,
    partnerId,
  };
  const res = editId
    ? await apiPut(`kpsc-finance/${editId}`, payload)
    : await apiPost('kpsc-finance', payload);
  if (res?.error) {
    showToast(res.error, 'error');
    btn.disabled = false;
    return;
  }
  closeFinanceModal();
  await renderFinance(document.getElementById('kpsc-main'));
  showToast(editId ? 'Finance entry updated.' : 'Finance entry saved.', 'success');
}

async function setFinanceYear(year) {
  S.financeYear = Number(year) || currentYear();
  await renderFinance(document.getElementById('kpsc-main'));
}

async function setFinanceMonth(month) {
  S.financeMonth = Number(month) || 0;
  await renderFinance(document.getElementById('kpsc-main'));
}

function editFinanceEntryWithPin(id) {
  const entry = S.financeEntries.find(e => e.id === id);
  if (!entry) { showToast('Entry not found.', 'error'); return; }
  requirePin('Edit Finance Entry', 'Enter your PIN to edit this finance entry.', () => openFinanceModal(entry));
}

function deleteFinanceEntryWithPin(id) {
  if (!canDeleteFinanceEntries()) {
    showToast('Only the Acting Chairman or IT Administrator may delete finance entries.', 'error');
    return;
  }
  requirePin(
    'Delete Finance Entry',
    'Enter your PIN to permanently delete this entry. This action cannot be undone.',
    async () => {
      const res = await apiDelete(`kpsc-finance/${id}`);
      if (res?.error) { showToast(res.error, 'error'); return; }
      await renderFinance(document.getElementById('kpsc-main'));
      showToast('Entry deleted.', 'success');
    }
  );
}

async function deleteFinanceEntry(id) {
  if (!canDeleteFinanceEntries()) {
    showToast('Only the Acting Chairman or IT Administrator may delete finance entries.', 'error');
    return;
  }
  const res = await apiDelete(`kpsc-finance/${id}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  await renderFinance(document.getElementById('kpsc-main'));
  showToast('Entry deleted.', 'success');
}

// ── FINANCE FILTER / SORT / EXPORT HELPERS ──────────────────────────────────

function getFilteredFinanceEntries() {
  let entries = S.financeEntries.slice();
  if (S.financeTypeFilter !== 'all') {
    entries = entries.filter(e => e.entryType === S.financeTypeFilter);
  }
  if (S.financeCatFilter) {
    entries = entries.filter(e => e.category === S.financeCatFilter);
  }
  if (S.financeMethodFilter) {
    entries = entries.filter(e => e.paymentMethod === S.financeMethodFilter);
  }
  const q = (S.financeSearch || '').trim().toLowerCase();
  if (q) {
    entries = entries.filter(e =>
      String(e.narration || '').toLowerCase().includes(q) ||
      String(e.reference || '').toLowerCase().includes(q) ||
      String(e.partnerName || '').toLowerCase().includes(q) ||
      catLabel(e.category).toLowerCase().includes(q)
    );
  }
  const col = S.financeSortCol || 'date';
  entries.sort((a, b) => {
    let av, bv;
    if (col === 'amount') {
      av = Number(a.amount || 0); bv = Number(b.amount || 0);
    } else if (col === 'date') {
      av = a.date || ''; bv = b.date || '';
    } else {
      av = String(a[col] || '').toLowerCase();
      bv = String(b[col] || '').toLowerCase();
    }
    if (av < bv) return S.financeSortAsc ? -1 : 1;
    if (av > bv) return S.financeSortAsc ? 1 : -1;
    return 0;
  });
  return entries;
}

function renderFinanceEntryList(canManage, canDelete) {
  const entries = getFilteredFinanceEntries();
  if (!entries.length) {
    return '<div class="k-empty">No entries match the current filters.</div>';
  }
  const thCls = col => {
    if (S.financeSortCol !== col) return 'kf-sortable';
    return S.financeSortAsc ? 'kf-sortable kf-sort-active kf-sort-asc' : 'kf-sortable kf-sort-active';
  };
  const tableRows = entries.map(e => {
    const amtColor = e.entryType === 'income' ? 'var(--green)' : 'var(--red)';
    const actionCells = (canManage || canDelete) ? `<td class="kf-td-actions">
        ${canManage ? `<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.editFinanceEntryWithPin('${e.id}')" title="Edit">✏️</button>` : ''}
        ${canDelete ? `<button class="kbtn kbtn-sm kbtn-ghost" style="color:var(--red)" onclick="Kpsc.deleteFinanceEntryWithPin('${e.id}')" title="Delete">🗑</button>` : ''}
      </td>` : '';
    return `<tr>
        <td>${esc(fmtDate(e.date))}</td>
        <td><span class="kbadge ${e.entryType==='income'?'badge-green':'badge-red'}">${esc(e.entryType)}</span></td>
        <td>${esc(catLabel(e.category))}</td>
        <td style="color:var(--text3)">${esc(e.partnerName || '—')}</td>
        <td class="kf-td-amount" style="color:${amtColor}">₦${Number(e.amount||0).toLocaleString('en-NG')}</td>
        <td>${esc((e.paymentMethod||'—').replace(/_/g,' '))}</td>
        <td style="color:var(--text3);font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.reference||'—')}</td>
        ${actionCells}
      </tr>`;
  }).join('');
  const actionHead = (canManage || canDelete) ? '<th></th>' : '';
  const table = `
    <div class="kf-table-wrap">
      <table class="kf-table">
        <thead><tr>
          <th class="${thCls('date')}" onclick="Kpsc.sortFinanceBy('date')">Date</th>
          <th>Type</th>
          <th class="${thCls('category')}" onclick="Kpsc.sortFinanceBy('category')">Category</th>
          <th>Partner</th>
          <th class="${thCls('amount')}" onclick="Kpsc.sortFinanceBy('amount')">Amount</th>
          <th class="${thCls('paymentMethod')}" onclick="Kpsc.sortFinanceBy('paymentMethod')">Method</th>
          <th class="${thCls('reference')}" onclick="Kpsc.sortFinanceBy('reference')">Reference</th>
          ${actionHead}
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
  const cards = entries.map(e => `
    <div class="k-meeting-card" style="position:relative">
      ${(canManage || canDelete) ? cardCtxMenu('fin-' + e.id, ...[
        ...(canManage ? [{ label: '✏️ Edit', onclick: `Kpsc.editFinanceEntryWithPin('${e.id}')` }] : []),
        ...(canDelete ? [{ label: '🗑 Delete', onclick: `Kpsc.deleteFinanceEntryWithPin('${e.id}')`, danger: true }] : []),
      ]) : ''}
      <div class="k-mc-top">
        <div style="flex:1;padding-right:${(canManage || canDelete) ? '32px' : '0'}">
          <div class="k-mc-title">${esc(catLabel(e.category))} — ₦${Number(e.amount || 0).toLocaleString('en-NG')}</div>
          <div class="k-mc-meta" style="margin-top:4px">
            <span>${esc(fmtDate(e.date))}</span>
            <span class="kbadge ${e.entryType==='income'?'badge-green':'badge-red'}">${esc(e.entryType)}</span>
            ${e.paymentMethod ? `<span class="kbadge badge-gray">${esc(e.paymentMethod.replace(/_/g,' '))}</span>` : ''}
          </div>
          ${e.narration ? `<div class="k-page-hint" style="margin-top:6px">${esc(e.narration)}</div>` : ''}
          ${e.reference ? `<div style="font-size:12px;color:var(--text3);margin-top:2px">Ref: ${esc(e.reference)}</div>` : ''}
          ${e.partnerName ? `<div style="font-size:12px;color:var(--text3);margin-top:2px">Partner: ${esc(e.partnerName)}</div>` : ''}
          ${e.recordedBy ? `<div style="font-size:11px;color:var(--text3)">Recorded by: ${esc(e.recordedBy)}</div>` : ''}
        </div>
      </div>
    </div>`).join('');
  return `${table}<div class="kf-cards--mobile k-meeting-list" style="margin-top:0">${cards}</div>`;
}

function rerenderFinanceEntryList() {
  const el = document.getElementById('kf-entry-list');
  if (!el) return;
  el.innerHTML = renderFinanceEntryList(canManageFinance(), canDeleteFinanceEntries());
}

function renderFinanceCategoryBreakdown(incomeEntries, expenseEntries, incomeTotal, expenseTotal) {
  function buildRows(list, total, barClass) {
    const cats = {};
    list.forEach(e => { const c = e.category || 'other'; cats[c] = (cats[c] || 0) + Number(e.amount || 0); });
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return '<div class="k-hint" style="padding:6px 0">No entries</div>';
    return sorted.map(([cat, amt]) => {
      const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
      return `<div class="kf-cat-row">
        <div class="kf-cat-label">${esc(catLabel(cat))}</div>
        <div class="kf-cat-bar-wrap"><div class="kf-cat-bar ${barClass}" style="width:${pct}%"></div></div>
        <div class="kf-cat-amount">₦${Math.round(amt).toLocaleString('en-NG')}</div>
        <div class="kf-cat-pct">${pct}%</div>
      </div>`;
    }).join('');
  }
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:4px 0 8px">
      <div>
        <div class="kf-breakdown-title" style="color:var(--green)">Income</div>
        ${buildRows(incomeEntries, incomeTotal, 'kf-cat-bar--income')}
      </div>
      <div>
        <div class="kf-breakdown-title" style="color:var(--red)">Expenses</div>
        ${buildRows(expenseEntries, expenseTotal, 'kf-cat-bar--expense')}
      </div>
    </div>`;
}

function setFinanceSearch(val) {
  S.financeSearch = String(val || '');
  rerenderFinanceEntryList();
}

function setFinanceTypeFilter(type) {
  S.financeTypeFilter = type || 'all';
  document.querySelectorAll('.kf-type-chip').forEach(el =>
    el.classList.toggle('active', el.dataset.type === S.financeTypeFilter)
  );
  rerenderFinanceEntryList();
}

function setFinanceCatFilter(val) {
  S.financeCatFilter = val || '';
  rerenderFinanceEntryList();
}

function setFinanceMethodFilter(val) {
  S.financeMethodFilter = val || '';
  rerenderFinanceEntryList();
}

function sortFinanceBy(col) {
  if (S.financeSortCol === col) {
    S.financeSortAsc = !S.financeSortAsc;
  } else {
    S.financeSortCol = col;
    S.financeSortAsc = col !== 'date';
  }
  rerenderFinanceEntryList();
}

function exportFinanceCsv() {
  const entries = getFilteredFinanceEntries();
  const periodLabel = S.financeMonth
    ? `${monthName(S.financeMonth)}-${S.financeYear}`
    : String(S.financeYear);
  const headers = ['Date','Type','Category','Partner','Amount (NGN)','Payment Method','Reference','Narration','Recorded By'];
  const rows = entries.map(e => [
    e.date || '',
    e.entryType || '',
    catLabel(e.category),
    e.partnerName || '',
    Number(e.amount || 0).toFixed(2),
    (e.paymentMethod || '').replace(/_/g, ' '),
    e.reference || '',
    e.narration || '',
    e.recordedBy || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = '﻿' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kpsc-finance-${periodLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function openFinanceReportModal() {
  document.getElementById('kf-report-modal')?.remove();
  const year = S.financeYear;
  const curMonth = S.financeMonth;
  const preSelected = curMonth ? [curMonth] : [1,2,3,4,5,6,7,8,9,10,11,12];
  const monthCheckboxes = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
    const checked = preSelected.includes(m) ? 'checked' : '';
    return `<label class="kf-month-check"><input type="checkbox" name="kf-month" value="${m}" ${checked} /><span>${monthName(m)}</span></label>`;
  }).join('');
  const modal = document.createElement('div');
  modal.id = 'kf-report-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:440px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Generate Finance Report</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('kf-report-modal')?.remove()">✕</button>
      </div>
      <div class="k-modal-body">
        <p class="k-hint" style="margin-bottom:12px">Select one or more months to include in the <strong>${year}</strong> report. You can combine months e.g. March &amp; April.</p>
        <div class="kf-month-grid">${monthCheckboxes}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc._selectAllReportMonths(true)">Select All</button>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc._selectAllReportMonths(false)">Clear</button>
        </div>
      </div>
      <div class="k-modal-footer" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="kbtn kbtn-primary" style="flex:1" onclick="Kpsc._generateLocalReport()">📄 Generate Report</button>
        <button class="kbtn kbtn-ghost" style="flex:1" onclick="Kpsc._generateShareableLink(this)">🔗 Shareable Link</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function _selectAllReportMonths(checked) {
  document.querySelectorAll('input[name="kf-month"]').forEach(cb => { cb.checked = checked; });
}

function _getSelectedReportMonths() {
  return [...document.querySelectorAll('input[name="kf-month"]:checked')].map(cb => Number(cb.value));
}

function _generateLocalReport() {
  const months = _getSelectedReportMonths();
  if (!months.length) { showToast('Please select at least one month.', 'warn'); return; }
  document.getElementById('kf-report-modal')?.remove();
  generateFinanceReport(months);
}

async function _generateShareableLink(btn) {
  const months = _getSelectedReportMonths();
  if (!months.length) { showToast('Please select at least one month.', 'warn'); return; }
  const origText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creating…';
  const res = await apiPost('kpsc-finance-share', { year: S.financeYear, months });
  btn.disabled = false; btn.textContent = origText;
  if (res?.error) { showToast(res.error, 'error'); return; }
  document.getElementById('kf-report-modal')?.remove();
  showShareLinkModal(res.url, res.expiresAt, months);
}

function showShareLinkModal(url, expiresAt, months) {
  document.getElementById('kf-share-link-modal')?.remove();
  const monthsLabel = months.length === 12 ? 'Full Year' : months.map(m => monthName(m)).join(', ');
  const expiryDate = expiresAt ? new Date(expiresAt).toLocaleDateString('en-NG', { dateStyle: 'long' }) : '30 days';
  const waMsg = encodeURIComponent(`KPSC Finance Report — ${monthsLabel} ${S.financeYear}\n${url}`);
  const modal = document.createElement('div');
  modal.id = 'kf-share-link-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:440px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Shareable Report Link</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('kf-share-link-modal')?.remove()">✕</button>
      </div>
      <div class="k-modal-body">
        <p class="k-hint" style="margin-bottom:10px">Anyone with this link can view the finance report without logging in. Share it directly on WhatsApp.</p>
        <div style="background:#f4f6f9;border-radius:8px;padding:12px;word-break:break-all;font-size:12px;margin-bottom:12px;border:1px solid #dde">${esc(url)}</div>
        <p class="k-hint">Period: <strong>${esc(monthsLabel)} ${S.financeYear}</strong> &nbsp;·&nbsp; Expires: ${esc(expiryDate)}</p>
      </div>
      <div class="k-modal-footer" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="kbtn kbtn-primary" style="flex:1" onclick="Kpsc.copyText(${JSON.stringify(url)}, this)">📋 Copy Link</button>
        <a class="kbtn kbtn-ghost" href="https://wa.me/?text=${waMsg}" target="_blank" rel="noopener" style="flex:1;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.46 0 .1 5.36.1 11.94c0 2.1.55 4.15 1.6 5.95L0 24l6.27-1.64a11.9 11.9 0 0 0 5.76 1.47h.01c6.58 0 11.94-5.36 11.94-11.94 0-3.19-1.24-6.18-3.46-8.41Z"/></svg>
          WhatsApp
        </a>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

// Kept as alias for any existing callers; delegates to generateFinanceReport for the current period.
function printFinanceReport() {
  const months = S.financeMonth ? [S.financeMonth] : [1,2,3,4,5,6,7,8,9,10,11,12];
  generateFinanceReport(months);
}

function generateFinanceReport(months) {
  function escPrint(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const year = S.financeYear;
  // Filter all-time entries by year + selected months
  const allEntries = Array.isArray(S.allFinanceEntries) ? S.allFinanceEntries : [];
  const entries = allEntries.filter(e => {
    const d = e.date || '';
    if (!d) return false;
    const eYear = Number(d.slice(0, 4));
    const eMonth = Number(d.slice(5, 7));
    return eYear === year && months.includes(eMonth);
  });
  const monthsSorted = [...months].sort((a, b) => a - b);
  const periodLabel = monthsSorted.length === 12
    ? `Full Year ${year}`
    : monthsSorted.length === 1
      ? `${monthName(monthsSorted[0])} ${year}`
      : `${monthsSorted.map(m => monthName(m)).join(', ')} ${year}`;
  const generatedDate = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
  const preparedBy = S.user?.name || '';
  const incomeEntries  = entries.filter(e => e.entryType === 'income').slice().sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1);
  const expenseEntries = entries.filter(e => e.entryType === 'expense').slice().sort((a, b) => (a.date || '') > (b.date || '') ? 1 : -1);
  const incomeTotal  = incomeEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const expenseTotal = expenseEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const net = incomeTotal - expenseTotal;
  const netColor = net >= 0 ? '#1a5e3a' : '#8b1a1a';
  const netLabel = net >= 0 ? 'Surplus' : 'Deficit';
  const reportBalance = typeof S.financeBalance === 'number' ? S.financeBalance : null;
  const balanceColor = reportBalance !== null ? (reportBalance >= 0 ? '#1e3a5f' : '#8b1a1a') : '#555';
  const balanceLabel = S.financeBalanceIsCurrentPeriod ? 'Current Balance' : `Balance (end of ${periodLabel})`;
  const minimumBalance = Number(S.financeMinimumBalance || 0);
  const available = reportBalance !== null ? reportBalance - minimumBalance : null;
  const availableColor = available !== null ? (available >= 0 ? '#8a6d00' : '#8b1a1a') : '#555';
  const safeFilename = `KPSC-Finance-Report-${monthsSorted.map(m => monthName(m).slice(0,3)).join('-')}-${year}`.replace(/[^a-zA-Z0-9-]/g, '-');

  function catSummaryRows(list, total) {
    const cats = {};
    list.forEach(e => { const c = e.category || 'other'; cats[c] = (cats[c] || 0) + Number(e.amount || 0); });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
      const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
      return `<tr><td>${escPrint(catLabel(cat))}</td><td style="text-align:right;font-weight:600">₦${Math.round(amt).toLocaleString('en-NG')}</td><td style="text-align:right;color:#666">${pct}%</td></tr>`;
    }).join('');
  }

  function entryRows(list, showPartner) {
    if (!list.length) return `<tr><td colspan="${showPartner ? 8 : 7}" style="text-align:center;color:#888;padding:12px">No entries recorded</td></tr>`;
    return list.map(e => `<tr>
      <td style="white-space:nowrap">${escPrint(e.date || '')}</td>
      <td>${escPrint(catLabel(e.category))}</td>
      ${showPartner ? `<td>${escPrint(e.partnerName || '—')}</td>` : ''}
      <td>${escPrint((e.paymentMethod || '—').replace(/_/g, ' '))}</td>
      <td style="font-size:11px">${escPrint(e.reference || '—')}</td>
      <td style="font-size:11px;color:#555">${escPrint(e.narration || '—')}</td>
      <td style="text-align:right;font-weight:600;white-space:nowrap">₦${Number(e.amount || 0).toLocaleString('en-NG')}</td>
      <td style="color:#777;font-size:11px">${escPrint(e.recordedBy || '—')}</td>
    </tr>`).join('');
  }

  let prose;
  if (!entries.length) {
    prose = `No financial transactions were recorded for <strong>${escPrint(periodLabel)}</strong>.`;
  } else if (net >= 0) {
    prose = `During <strong>${escPrint(periodLabel)}</strong>, the committee received a total of <strong style="color:#1a5e3a">₦${Math.round(incomeTotal).toLocaleString('en-NG')}</strong> in income across ${incomeEntries.length} entr${incomeEntries.length === 1 ? 'y' : 'ies'}, and spent <strong style="color:#8b1a1a">₦${Math.round(expenseTotal).toLocaleString('en-NG')}</strong> across ${expenseEntries.length} entr${expenseEntries.length === 1 ? 'y' : 'ies'}. This leaves a <strong style="color:#1a5e3a">surplus of ₦${Math.round(net).toLocaleString('en-NG')}</strong>.`;
  } else {
    prose = `During <strong>${escPrint(periodLabel)}</strong>, the committee received a total of <strong style="color:#1a5e3a">₦${Math.round(incomeTotal).toLocaleString('en-NG')}</strong> in income across ${incomeEntries.length} entr${incomeEntries.length === 1 ? 'y' : 'ies'}, and spent <strong style="color:#8b1a1a">₦${Math.round(expenseTotal).toLocaleString('en-NG')}</strong> across ${expenseEntries.length} entr${expenseEntries.length === 1 ? 'y' : 'ies'}. Expenses exceeded income, resulting in a <strong style="color:#8b1a1a">deficit of ₦${Math.round(Math.abs(net)).toLocaleString('en-NG')}</strong>.`;
  }

  const html = buildFinanceReportHtml({ escPrint, periodLabel, generatedDate, preparedBy, safeFilename, incomeEntries, expenseEntries, incomeTotal, expenseTotal, net, netColor, netLabel, reportBalance, balanceColor, balanceLabel, minimumBalance, available, availableColor, prose, catSummaryRows, entryRows });

  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to generate the report.', 'warn'); return; }
  win.document.write(html);
  win.document.close();
}

function buildFinanceReportHtml({ escPrint, periodLabel, generatedDate, preparedBy, safeFilename, incomeEntries, expenseEntries, incomeTotal, expenseTotal, net, netColor, netLabel, reportBalance, balanceColor, balanceLabel, minimumBalance, available, availableColor, prose, catSummaryRows, entryRows }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Finance Report — ${escPrint(periodLabel)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:0 24px 40px}
  @media print{@page{margin:18mm 15mm;size:A4}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0}.no-print{display:none}}
  .report-header{text-align:center;padding:28px 0 18px;border-bottom:2px solid #1e3a5f;margin-bottom:24px}
  .org-name{font-size:20px;font-weight:700;color:#1e3a5f;letter-spacing:.5px}
  .report-title{font-size:15px;font-weight:600;color:#333;margin-top:6px}
  .report-meta{font-size:11px;color:#666;margin-top:6px}
  .section{margin-bottom:28px}
  .section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#1e3a5f;border-bottom:1px solid #ddd;padding-bottom:7px;margin-bottom:14px}
  .overview-box{background:#f4f6f9;border-radius:8px;padding:14px 18px;margin-bottom:20px;line-height:1.8;font-size:13px}
  .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:8px}
  @media(max-width:600px){.summary-grid{grid-template-columns:repeat(2,1fr)}}
  .tile{border:1px solid #ddd;border-radius:8px;padding:16px;text-align:center}
  .tile-val{font-size:22px;font-weight:700}
  .tile-lbl{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#1e3a5f;color:#fff;padding:9px 10px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.4px}
  td{padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top}
  tr:nth-child(even) td{background:#f9fafb}
  tr:last-child td{border-bottom:none}
  .sig-section{margin-top:36px;page-break-inside:avoid}
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:12px}
  .sig-line{border-top:1px solid #aaa;margin-top:40px;padding-top:7px;font-size:11px;color:#555}
  .action-bar{display:flex;gap:10px;justify-content:center;padding:16px 0;margin-bottom:4px;flex-wrap:wrap}
  .action-btn{background:#1e3a5f;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
  .action-btn:hover{background:#13284a}
  .action-btn-outline{background:#fff;color:#1e3a5f;border:2px solid #1e3a5f;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
  .action-btn-outline:hover{background:#f0f4fa}
</style>
</head>
<body>
<div class="action-bar no-print">
  <button class="action-btn" id="dl-btn" onclick="downloadPDF()">📥 Download PDF</button>
  <button class="action-btn-outline" onclick="window.print()">🖨 Print</button>
</div>
<div id="report-content">
<div class="report-header">
  <div class="org-name">Kingdom Parish Stewardship Committee</div>
  <div class="report-title">Finance Report — ${escPrint(periodLabel)}</div>
  <div class="report-meta">Generated on ${escPrint(generatedDate)}${preparedBy ? ` &nbsp;·&nbsp; Prepared by: ${escPrint(preparedBy)}` : ''}</div>
</div>

<div class="section">
  <div class="section-title">Overview</div>
  <div class="overview-box">${prose}</div>
  <div class="summary-grid">
    <div class="tile"><div class="tile-val" style="color:#1a5e3a">₦${Math.round(incomeTotal).toLocaleString('en-NG')}</div><div class="tile-lbl">Total Received</div></div>
    <div class="tile"><div class="tile-val" style="color:#8b1a1a">₦${Math.round(expenseTotal).toLocaleString('en-NG')}</div><div class="tile-lbl">Total Spent</div></div>
    <div class="tile" style="border-color:${netColor}"><div class="tile-val" style="color:${netColor}">₦${Math.round(Math.abs(net)).toLocaleString('en-NG')}</div><div class="tile-lbl">Net ${netLabel} (Period)</div></div>
    ${reportBalance !== null ? `<div class="tile" style="border:2px solid ${balanceColor};background:${reportBalance>=0?'#eef3fb':'#fef2f2'}"><div class="tile-val" style="color:${balanceColor}">₦${Math.round(Math.abs(reportBalance)).toLocaleString('en-NG')}</div><div class="tile-lbl" style="color:${balanceColor};font-weight:700">${escPrint(balanceLabel)}</div></div>` : ''}
    ${available !== null && minimumBalance > 0 ? `<div class="tile" style="border:2px solid ${availableColor};background:${available>=0?'#fdf8ec':'#fef2f2'}"><div class="tile-val" style="color:${availableColor}">₦${Math.round(Math.abs(available)).toLocaleString('en-NG')}</div><div class="tile-lbl" style="color:${availableColor};font-weight:700">${available>=0?'Available for Projects':'Below Minimum Balance'}</div></div>` : ''}
  </div>
</div>

${incomeEntries.length ? `
<div class="section">
  <div class="section-title">Income Breakdown by Category</div>
  <table><thead><tr><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Income</th></tr></thead>
  <tbody>${catSummaryRows(incomeEntries, incomeTotal)}<tr style="font-weight:700"><td>Total</td><td style="text-align:right">₦${Math.round(incomeTotal).toLocaleString('en-NG')}</td><td style="text-align:right">100%</td></tr></tbody></table>
</div>
<div class="section">
  <div class="section-title">Money Received — All Entries (${incomeEntries.length})</div>
  <table><thead><tr><th>Date</th><th>Category</th><th>Partner</th><th>Method</th><th>Reference</th><th>Description</th><th style="text-align:right">Amount</th><th>Recorded By</th></tr></thead>
  <tbody>${entryRows(incomeEntries, true)}</tbody></table>
</div>` : ''}

${expenseEntries.length ? `
<div class="section">
  <div class="section-title">Expense Breakdown by Category</div>
  <table><thead><tr><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Expenses</th></tr></thead>
  <tbody>${catSummaryRows(expenseEntries, expenseTotal)}<tr style="font-weight:700"><td>Total</td><td style="text-align:right">₦${Math.round(expenseTotal).toLocaleString('en-NG')}</td><td style="text-align:right">100%</td></tr></tbody></table>
</div>
<div class="section">
  <div class="section-title">Money Spent — All Entries (${expenseEntries.length})</div>
  <table><thead><tr><th>Date</th><th>Category</th><th>Method</th><th>Reference</th><th>Description</th><th style="text-align:right">Amount</th><th>Recorded By</th></tr></thead>
  <tbody>${entryRows(expenseEntries, false)}</tbody></table>
</div>` : ''}

<div class="sig-section">
  <div class="section-title">Approval &amp; Signatures</div>
  <div class="sig-grid">
    <div><div class="sig-line">Financial Secretary</div></div>
    <div><div class="sig-line">Treasurer</div></div>
    <div><div class="sig-line">Acting Chairman</div></div>
    <div><div class="sig-line">Date</div></div>
  </div>
</div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
function downloadPDF() {
  var btn = document.getElementById('dl-btn');
  var bar = document.querySelector('.action-bar');
  if (bar) bar.style.display = 'none';
  html2pdf().set({
    margin:[12,10],
    filename:${JSON.stringify(safeFilename + '.pdf')},
    html2canvas:{scale:2,useCORS:true,letterRendering:true},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
  }).from(document.getElementById('report-content')).save().then(function(){
    if (bar) bar.style.display = '';
  });
}
</script>
</body></html>`;
}


async function runReconciliation(btn) {
  let statementItems;
  try {
    statementItems = JSON.parse(document.getElementById('krec-items')?.value || '[]');
  } catch {
    showToast('Invalid JSON for statement items.', 'error');
    return;
  }
  if (!Array.isArray(statementItems) || !statementItems.length) {
    showToast('Provide at least one statement item.', 'warn');
    return;
  }
  btn.disabled = true;
  const res = await apiPost('kpsc-reconciliation', {
    statementYear: currentYear(),
    statementMonth: currentMonth(),
    statementItems,
    createdBy: S.user?.name || '',
  });
  btn.disabled = false;
  if (res?.error) {
    showToast(res.error, 'error');
    return;
  }
  const out = document.getElementById('krec-result');
  renderReconciliationResult(out, res);
}

async function renderReminders(main) {
  await loadPartnerData(currentYear());
  const settingsRes = await apiGet('settings');
  const month = currentMonth();
  const year = currentYear();
  const unpaid = S.partners.filter(p => p.status === 'active' && !partnerMonthlyPaid(p.id, month, year));
  const remindersRes = await apiGet(`kpsc-reminders?year=${year}&month=${month}`);
  if (remindersRes?.error) throw new Error(remindersRes.error);
  const defaultTemplate = String(settingsRes?.kpsc_sms_text_reminder || '').trim()
    || 'Dear {{name}}, this is a reminder for your {{month}} partnership pledge.';
  S.reminders = Array.isArray(remindersRes) ? remindersRes : [];
  main.innerHTML = `
    <div class="k-page">
      <div class="k-section">
        <h3 class="k-sec-title">Partner Reminder Workflow — ${monthName(month)} ${year}</h3>
        <p class="k-hint">${unpaid.length} unpaid active partner(s) for ${monthName(month)} ${year}.</p>
        <label class="k-label">Reminder Message Template</label>
        <textarea id="krem-message" class="k-input k-textarea" placeholder="Reminder message" oninput="Kpsc.debouncedSaveReminderTemplate(this)">${esc(defaultTemplate)}</textarea>
        <p class="k-hint">Use <code>{{name}}</code> for partner name, <code>{{month}}</code> for the current month, and <code>{{unpaidMonths}}</code> for the list of every outstanding month (e.g. "May" or "May, June").</p>
        <div class="k-room-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="kbtn kbtn-primary" onclick="Kpsc.runRemindersNow(this)">Send Reminders Now (${unpaid.length} unpaid)</button>
          <button class="kbtn kbtn-ghost" onclick="Kpsc.navigate('sms_logs')">📋 SMS Logs &amp; Delivery</button>
        </div>
        <p class="k-hint" style="margin-top:8px">This triggers the exact same reminder engine as the automated schedule — real SMS via Termii, respecting opt-out/DND and the cool-off period — just immediately instead of waiting for the scheduled time. Results (sent, failed, retries) appear on the <a href="#sms_logs" onclick="Kpsc.navigate('sms_logs');return false;">SMS Logs</a> page.</p>
      </div>

      ${unpaid.length ? `
      <div class="k-section">
        <h3 class="k-sec-title">Unpaid Partners — Quick Copy</h3>
        <p class="k-hint">Copy individual messages for WhatsApp or SMS.</p>
        <div class="k-meeting-list">
          ${unpaid.map(p => `
            <div class="k-meeting-card" style="cursor:default">
              <div class="k-mc-top">
                <div style="flex:1">
                  <div class="k-mc-title">${esc(p.fullName)}</div>
                  <div class="k-mc-meta">
                    <span class="kbadge badge-type">${esc(partnerTypeLabel(p.partnershipType))}</span>
                    ${p.phone ? `<span>📞 ${esc(p.phone)}</span>` : ''}
                    <span class="kbadge badge-gray">${esc(p.reminderPreference || 'sms')}</span>
                  </div>
                  <div id="krem-ai-hint-${esc(p.id)}" style="display:none;font-size:12px;color:#888;margin-top:4px"></div>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                  <button class="kbtn kbtn-sm kbtn-ghost" id="krem-personalize-${esc(p.id)}" onclick="Kpsc.personalizeReminder('${esc(p.id)}', this)" title="Generate AI-personalized reminder variants">✨ Personalize</button>
                  <button class="kbtn kbtn-sm" onclick="Kpsc.copyReminderMessage('${esc(p.id)}')">📋 Copy</button>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : `<div class="k-section"><div class="k-empty">🎉 All active partners have paid for ${monthName(month)} ${year}!</div></div>`}

      <div class="k-section">
        <div class="k-section-hdr"><h2>Reminder History &amp; Delivery</h2></div>
        <p class="k-hint">${S.reminders.length} reminder message(s) logged for ${monthName(month)} ${year}. The full outbox — including failed sends, retry buttons and the automated-schedule health — is on the SMS Logs page.</p>
        <div class="k-room-actions" style="margin-top:10px">
          <button class="kbtn kbtn-primary" onclick="Kpsc.navigate('sms_logs')">Open SMS Logs &amp; Delivery →</button>
        </div>
      </div>
    </div>`;
}

// ── SMS LOGS / OUTBOX PAGE ────────────────────────────────────────────────
function smsLogStatusBadge(log) {
  if (log.status === 'failed') return `<span class="kbadge badge-red" title="${esc(log.errorText || 'Send failed')}">❌ Failed</span>`;
  if (log.status === 'skipped') return `<span class="kbadge badge-gray" title="${esc(log.errorText || 'Skipped')}">⏭️ Skipped</span>`;
  // status === 'sent' → show delivery sub-status
  if (log.deliveryStatus === 'delivered') return `<span class="kbadge badge-green">✅ Delivered</span>`;
  if (log.deliveryStatus === 'dnd')       return `<span class="kbadge badge-red" title="Termii/network reports this number is on the DND registry">🚫 DND</span>`;
  if (log.deliveryStatus === 'failed')    return `<span class="kbadge badge-red">❌ Not delivered</span>`;
  if (log.deliveryStatus === 'pending' || !log.deliveryStatus) {
    return `<span class="kbadge badge-amber" title="Sent to Termii; awaiting delivery confirmation">⏳ Sent</span>`;
  }
  // Termii returned a status we don't have a specific bucket for — show it verbatim rather than masking it as "Sent".
  return `<span class="kbadge badge-amber" title="Raw status reported by Termii">⏳ ${esc(log.deliveryStatus)}</span>`;
}

// Plain-language, always-visible line showing exactly what Termii reported for this
// message — no bucketing, no interpretation. Falls back to a clear "not received yet"
// message rather than leaving the reader guessing.
function smsLogRawStatusText(log) {
  if (log.status === 'failed') return log.errorText || 'Send to Termii failed (no further detail returned)';
  if (log.status === 'skipped') return log.errorText || 'Skipped before sending';
  if (log.deliveryStatusRaw) return log.deliveryStatusRaw;
  if (log.deliveryStatus && log.deliveryStatus !== 'pending') return log.deliveryStatus;
  return 'Not yet reported by Termii';
}

const SMS_TYPE_LABELS = {
  reminder: 'Payment reminder', welcome: 'Welcome', payment: 'Payment thank-you',
  new_month: 'Happy New Month', anniversary: 'Anniversary', milestone: 'Milestone',
  premeeting: 'Pre-meeting', actionitem: 'Action item', deadline: 'Deadline', bulk: 'Bulk',
  scheduled: 'Scheduled blast', test: 'Test SMS',
};

async function renderSmsLogs(main) {
  const nowYear = currentYear();
  const nowMonth = currentMonth();
  const year = S.smsLogsYear || nowYear;
  const month = S.smsLogsMonth || nowMonth;
  const filter = S.smsLogsFilter || 'all';
  const qs = `year=${year}&month=${month}` + (filter !== 'all' ? `&status=${encodeURIComponent(filter)}` : '');
  const yearOpts = [nowYear, nowYear-1, nowYear-2].map(y => `<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('');
  const monthOpts = Array.from({length: 12}, (_, i) => {
    const m = i + 1;
    return `<option value="${m}" ${month===m?'selected':''}>${monthName(m)}</option>`;
  }).join('');
  const [res, settingsRes] = await Promise.all([
    apiGet(`kpsc-sms-logs?${qs}`),
    apiGet('settings').catch(() => null),
  ]);
  if (res?.error) throw new Error(res.error);
  S.smsLogsData = res;
  // Keep a fresh balance cache so Finance/Partners pages can use it without fetching
  if (res.wallet?.balance != null) {
    S.termiiWalletCache = { balance: Number(res.wallet.balance), fetchedAt: Date.now() };
  }
  // Populate recharge bank-details cache here too — this is the page the Recharge button lives on
  _cacheRechargeBankDetails(settingsRes);
  const c = res.counts || {};
  const sch = res.scheduler || {};
  const logs = Array.isArray(res.logs) ? res.logs : [];
  const runs = Array.isArray(res.runs) ? res.runs : [];

  if ((c.pending || 0) > 0 && !S._smsAutoReconcileRunning) {
    S._smsAutoReconcileRunning = true;
    apiPost('kpsc-sms-reconcile-delivery', {}).then(r => {
      S._smsAutoReconcileRunning = false;
      if (r?.updated > 0 && S.page === 'sms_logs') {
        renderSmsLogs(main).then(() => prependSubTabs(main, moneySubTabStrip()));
      }
    }).catch(() => { S._smsAutoReconcileRunning = false; });
  }

  const filters = [
    { key: 'all',     label: `All (${c.total || 0})` },
    { key: 'failed',  label: `Failed (${c.failed || 0})` },
    { key: 'pending', label: `Awaiting delivery (${c.pending || 0})` },
    { key: 'delivered', label: `Delivered (${c.delivered || 0})` },
    { key: 'dnd',     label: `DND (${c.dnd || 0})` },
  ];

  // Scheduler health banner colour: green when today is a send day, neutral otherwise.
  const hb = sch.heartbeat;
  const hbText = hb?.at ? `Scheduler last ran ${fmtDateTime(hb.at)}${hb.reason ? ` — ${esc(hb.reason)}` : ''}` : 'Scheduler has not reported in yet.';
  const apiWarn = sch.apiKeyConfigured ? '' :
    `<div class="k-error-box" style="margin-top:10px"><strong>No Termii API key configured.</strong> Reminders cannot be sent until a key is added in Settings → SMS.</div>`;

  // Wallet / credits
  const w = res.wallet || {};
  const cost = res.cost || {};
  const rate = w.nairaPerPage || cost.nairaPerPage || 5;
  const fmtN = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  const balanceText = (w.balance != null)
    ? `${fmtN(w.balance)}${w.pagesRemaining != null ? ` · ≈ ${w.pagesRemaining.toLocaleString('en-NG')} SMS page(s) left` : ''}`
    : (w.error ? esc(w.error) : 'Unavailable');

  // Delivery-report webhook diagnostics
  const wh = res.webhook || {};
  const whSeen = wh.lastSeen ? `Last delivery report received ${fmtDateTime(wh.lastSeen)}` : 'No delivery reports received yet';
  const whWarn = !wh.lastSeen
    ? `<div class="k-error-box" style="margin-top:10px">
         <strong>Delivery status isn't updating because Termii's Delivery Report (DLR) webhook isn't set up yet.</strong>
         In your Termii dashboard, set the webhook / notification URL below (POST, application/json), then new messages will move from “Sent” to “Delivered / Failed / DND” automatically.
         <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
           <code style="background:#fff;padding:4px 8px;border-radius:6px;border:1px solid var(--border);word-break:break-all">${esc(wh.url || '')}</code>
           <button class="kbtn kbtn-sm" onclick="Kpsc.copyText('${esc(wh.url || '')}', this)">📋 Copy</button>
         </div>
       </div>`
    : '';

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section">
        <div class="k-section-hdr" style="margin-bottom:8px">
          <h3 class="k-sec-title" style="margin:0">SMS Logs &amp; Outbox</h3>
          <div style="display:flex;gap:6px">
            <select class="k-input k-input-sm" onchange="Kpsc.setSmsLogsMonth(this.value)">${monthOpts}</select>
            <select class="k-input k-input-sm" onchange="Kpsc.setSmsLogsYear(this.value)">${yearOpts}</select>
          </div>
        </div>

        <div class="k-sms-sched">
          <div class="k-sms-sched-row">
            <span class="k-label" style="margin:0">Payment reminder schedule</span>
            <span>${esc(sch.scheduleLabel || '—')}</span>
          </div>
          <div class="k-sms-sched-row">
            <span class="k-label" style="margin:0">Today a send day?</span>
            <span>${sch.isSendDayToday ? '<span class="kbadge badge-green">Yes — today</span>' : '<span class="kbadge badge-gray">No</span>'} <span class="k-hint" style="margin-left:6px">Next: ${esc(sch.nextSendLabel || '—')}</span></span>
          </div>
          <div class="k-sms-sched-row">
            <span class="k-label" style="margin:0">Send window</span>
            <span>${esc(sch.sendWindow || '—')} ${sch.withinWindowNow ? '<span class="kbadge badge-green">open now</span>' : '<span class="kbadge badge-amber">closed now</span>'}</span>
          </div>
          <div class="k-sms-sched-row">
            <span class="k-label" style="margin:0">Scheduler heartbeat</span>
            <span class="k-hint">${esc(hbText)}</span>
          </div>
          <div class="k-sms-sched-row">
            <span class="k-label" style="margin:0">Delivery reports</span>
            <span>${wh.lastSeen ? '<span class="kbadge badge-green">connected</span>' : '<span class="kbadge badge-amber">not set up</span>'} <span class="k-hint" style="margin-left:6px">${esc(whSeen)}</span></span>
          </div>
        </div>
        ${apiWarn}
        ${whWarn}

        <div class="k-room-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="kbtn kbtn-primary" id="ksms-runnow" onclick="Kpsc.runRemindersNow(this)">📤 Run payment reminders now</button>
          ${c.failed ? `<button class="kbtn" onclick="Kpsc.retryAllFailedSms(this)">🔁 Retry all failed (${c.failed})</button>` : ''}
          ${c.pending ? `<button class="kbtn" onclick="Kpsc.reconcileDeliveryStatus(this)">🔄 Refresh delivery status (${c.pending})</button>` : ''}
          <button class="kbtn kbtn-ghost" onclick="Kpsc.navigate('reminders')">Reminder workflow →</button>
        </div>
        <p class="k-hint" style="margin-top:8px">“Run now” sends this month's reminder to every active, unpaid partner immediately (ignoring the schedule and send-window), while still skipping opted-out / DND partners and anyone already reminded within the cool-off period.</p>
      </div>

      <div class="k-section" id="k-sms-wallet-section">
        <div class="k-sms-sched">
          <div class="k-sms-sched-row">
            <span class="k-label" style="margin:0">Termii wallet balance</span>
            <span style="display:flex;align-items:center;gap:10px">
              <span>${esc(balanceText)}</span>
              <button class="kbtn kbtn-sm" onclick="Kpsc.showRechargeWalletModal()" style="font-size:12px">💳 Recharge SMS Wallet</button>
            </span>
          </div>
          <div class="k-sms-sched-row">
            <span class="k-label" style="margin:0">Spent in ${monthName(month)} ${year}</span>
            <span>${fmtN(cost.monthCost)} <span class="k-hint" style="margin-left:6px">${(cost.monthPages || 0).toLocaleString('en-NG')} page(s) sent</span></span>
          </div>
          <div class="k-sms-sched-row">
            <span class="k-label" style="margin:0">Rate</span>
            <span class="k-hint">${fmtN(rate)} per SMS page</span>
          </div>
        </div>
        <p class="k-hint" style="margin-top:8px">An SMS page is 160 characters (GSM-7). Messages containing emoji or special characters switch to Unicode (70 chars/page), so they cost more pages. Cost below is an estimate at ${fmtN(rate)}/page.</p>
      </div>

      <div class="k-section">
        <div class="k-sms-stats">
          ${[['Sent', c.sent || 0, 'badge-blue'], ['Delivered', c.delivered || 0, 'badge-green'], ['Failed', c.failed || 0, 'badge-red'], ['Awaiting', c.pending || 0, 'badge-amber'], ['DND', c.dnd || 0, 'badge-gray']]
            .map(([lbl, n, cls]) => `<div class="k-sms-stat"><div class="k-sms-stat-n">${n}</div><div class="k-sms-stat-l"><span class="kbadge ${cls}">${lbl}</span></div></div>`).join('')}
        </div>
        <div class="ka-subtabs" style="margin-top:12px">
          ${filters.map(f => `<button class="ka-subtab${filter === f.key ? ' active' : ''}" onclick="Kpsc.setSmsLogsFilter('${f.key}')">${esc(f.label)}</button>`).join('')}
        </div>
        <div class="k-meeting-list" style="margin-top:12px">
          ${logs.length ? logs.map(log => `
            <div class="k-meeting-card" style="cursor:default">
              <div class="k-mc-top">
                <div style="flex:1">
                  <div class="k-mc-title">${esc(log.partnerName || SMS_TYPE_LABELS[log.reminderType] || 'Partner')}${log.phone ? ` <span class="k-hint">· ${esc(log.phone)}</span>` : ''}</div>
                  <div class="k-mc-meta">
                    <span class="kbadge badge-type">${esc(SMS_TYPE_LABELS[log.reminderType] || log.reminderType || 'sms')}</span>
                    <span>${esc(fmtDateTime(log.createdAt || log.sentAt))}</span>
                    ${log.sentBy ? `<span>by ${esc(log.sentBy)}</span>` : ''}
                    <span title="${log.pages || 0} SMS page(s), ${esc(log.encoding || 'GSM-7')}">📄 ${log.pages || 0} pg${log.cost ? ` · ${fmtN(log.cost)}` : ''}</span>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                  ${smsLogStatusBadge(log)}
                  ${log.retryable ? `<button class="kbtn kbtn-sm" onclick="Kpsc.retrySms('${esc(log.id)}', this)">🔁 Retry</button>` : ''}
                </div>
              </div>
              ${log.errorText ? `<div class="k-page-hint" style="margin-top:6px;color:var(--red)">⚠️ ${esc(log.errorText)}</div>` : ''}
              <div class="k-page-hint" style="margin-top:6px;font-size:13px">${esc(log.message)}</div>
              <div class="k-page-hint" style="margin-top:4px;font-size:12px;font-weight:600">Termii status: ${esc(smsLogRawStatusText(log))}</div>
              ${log.messageId ? `<div class="k-page-hint" style="margin-top:2px;font-size:11px;color:var(--text3,#999)">Termii ID: ${esc(log.messageId)}</div>` : ''}
            </div>`).join('') : `<div class="k-empty">No SMS ${filter !== 'all' ? `(${esc(filter)}) ` : ''}logged for ${monthName(month)} ${year}.</div>`}
        </div>
      </div>

      <div class="k-section">
        <div class="k-section-hdr"><h2>Automated Run History</h2></div>
        <p class="k-hint">Each time the reminder scheduler fires (every 30 min) it records a line here so you can confirm it ran and see the outcome.</p>
        <div class="k-meeting-list" style="margin-top:10px">
          ${runs.length ? runs.map(r => `
            <div class="k-meeting-card" style="cursor:default">
              <div class="k-mc-top">
                <div class="k-mc-title">${esc(fmtDateTime(r.ranAt))}</div>
                <span class="kbadge ${r.trigger === 'manual' ? 'badge-type' : 'badge-blue'}">${r.trigger === 'manual' ? 'manual' : 'cron'}</span>
              </div>
              <div class="k-mc-meta">
                ${r.isSendDay ? '<span class="kbadge badge-green">send day</span>' : '<span class="kbadge badge-gray">not a send day</span>'}
                <span>✅ ${r.sent} sent</span>
                ${r.failed ? `<span style="color:var(--red)">❌ ${r.failed} failed</span>` : ''}
                ${r.skipped ? `<span>⏭️ ${r.skipped} skipped (cool-off)</span>` : ''}
                <span class="k-hint">of ${r.total}</span>
              </div>
              ${r.reason ? `<div class="k-page-hint" style="margin-top:4px">${esc(r.reason)}</div>` : ''}
            </div>`).join('') : '<div class="k-empty">No automated runs recorded yet. If this stays empty on a send day, the scheduler (GitHub Actions cron) is not reaching the app.</div>'}
        </div>
      </div>
    </div>`;
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { const o = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = o; }, 1500); }
    else showToast('Copied to clipboard.', 'success');
  } catch {
    showToast('Could not copy — please copy it manually.', 'error');
  }
}

async function setSmsLogsFilter(key) {
  S.smsLogsFilter = key;
  const main = document.getElementById('kpsc-main');
  if (main) { await renderSmsLogs(main); prependSubTabs(main, moneySubTabStrip()); }
}

async function setSmsLogsYear(year) {
  S.smsLogsYear = Number(year) || currentYear();
  const main = document.getElementById('kpsc-main');
  if (main) { await renderSmsLogs(main); prependSubTabs(main, moneySubTabStrip()); }
}

async function setSmsLogsMonth(month) {
  S.smsLogsMonth = Number(month) || currentMonth();
  const main = document.getElementById('kpsc-main');
  if (main) { await renderSmsLogs(main); prependSubTabs(main, moneySubTabStrip()); }
}

async function runRemindersNow(btn) {
  if (!confirm('Send this month\'s payment reminder now to every active, unpaid partner?\n\nOpted-out / DND partners and anyone already reminded within the cool-off period are still skipped.')) return;
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const res = await apiPost('kpsc-run-reminders-now', {});
    if (res?.error) { showToast(res.error, 'error'); }
    else if (res.skipped) { showToast(`No reminders sent: ${res.reason || 'nothing to send'}`, 'info'); }
    else {
      const parts = [`${res.sent || 0} sent`];
      if (res.failed) parts.push(`${res.failed} failed`);
      if (res.skippedCount) parts.push(`${res.skippedCount} skipped (cool-off)`);
      showToast(`Reminders: ${parts.join(', ')}.`, (res.failed ? 'error' : 'success'));
    }
  } catch (e) {
    showToast('Could not run reminders: ' + (e.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
    const main = document.getElementById('kpsc-main');
    if (main) { await renderSmsLogs(main); prependSubTabs(main, moneySubTabStrip()); }
  }
}

async function retrySms(id, btn) {
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const res = await apiPost('kpsc-sms-retry', { id });
    if (res?.ok && res.status === 'sent') showToast('Resent successfully.', 'success');
    else showToast('Retry failed: ' + (res?.error || 'Termii rejected the message'), 'error');
  } catch (e) {
    showToast('Retry error: ' + (e.message || e), 'error');
  } finally {
    const main = document.getElementById('kpsc-main');
    if (main) { await renderSmsLogs(main); prependSubTabs(main, moneySubTabStrip()); }
  }
}

async function retryAllFailedSms(btn) {
  const data = S.smsLogsData;
  const failedIds = (data?.logs || []).filter(l => l.status === 'failed').map(l => l.id);
  if (!failedIds.length) { showToast('No failed messages to retry.', 'info'); return; }
  if (!confirm(`Retry ${failedIds.length} failed message(s)?`)) return;
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Retrying…'; }
  let okCount = 0, failCount = 0;
  for (const id of failedIds) {
    try {
      const res = await apiPost('kpsc-sms-retry', { id });
      if (res?.ok && res.status === 'sent') okCount++; else failCount++;
    } catch { failCount++; }
  }
  showToast(`Retry complete: ${okCount} sent${failCount ? `, ${failCount} still failing` : ''}.`, failCount ? 'error' : 'success');
  const main = document.getElementById('kpsc-main');
  if (main) { await renderSmsLogs(main); prependSubTabs(main, moneySubTabStrip()); }
}

// Look up the real delivery status of messages stuck "awaiting delivery"
// (covers messages sent before the DLR status-mapping fix). Processes up
// to 40 per call, so it may need re-clicking to clear a larger backlog.
async function reconcileDeliveryStatus(btn) {
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try {
    const res = await apiPost('kpsc-sms-reconcile-delivery', {});
    if (res?.error) { showToast(res.error, 'error'); }
    else if (!res.checked) { showToast('No messages awaiting delivery confirmation.', 'info'); }
    else {
      const parts = [`${res.updated} updated`];
      if (res.stillPending) parts.push(`${res.stillPending} still awaiting a report`);
      showToast(`Checked ${res.checked}: ${parts.join(', ')}.`, 'success');
    }
  } catch (e) {
    showToast('Could not refresh delivery status: ' + (e.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
    const main = document.getElementById('kpsc-main');
    if (main) { await renderSmsLogs(main); prependSubTabs(main, moneySubTabStrip()); }
  }
}

// Per-partner personalized message overrides: Map<partnerId, resolvedMessageString>
const _personalizedMessages = new Map();

// ── MEETING ARCHIVE PAGINATION ────────────────────────────────────────────────
let meetingListOffset = 0;
const MEETING_PAGE_SIZE = 20;

// ── DASHBOARD CACHE ──────────────────────────────────────────────────────────
const _dashCache = { data: null, ts: 0 };

function copyReminderMessage(partnerId) {
  const partner = S.partners.find(p => p.id === partnerId);
  if (!partner) return;
  let message;
  if (_personalizedMessages.has(partnerId)) {
    // Use the approved personalized variant (already has name/month substituted)
    message = _personalizedMessages.get(partnerId);
  } else {
    const template = document.getElementById('krem-message')?.value.trim() || 'Dear {{name}}, this is a reminder for your {{month}} partnership pledge.';
    message = template
      .replace(/\{\{name\}\}/g, partner.fullName)
      .replace(/\{\{month\}\}/g, monthName(currentMonth()))
      .replace(/\{\{unpaidMonths\}\}/g, computeUnpaidMonthsStr(partner, currentMonth(), currentYear()));
  }
  navigator.clipboard.writeText(message).then(() => {
    showToast(`Reminder copied for ${partner.fullName}`, 'success');
  }).catch(() => {
    showToast('Could not copy. Please copy manually.', 'warn');
  });
}

async function personalizeReminder(partnerId, btn) {
  const partner = S.partners.find(p => p.id === partnerId);
  if (!partner) return;
  const month = currentMonth();
  const year = currentYear();
  const fallbackTemplate = document.getElementById('krem-message')?.value.trim()
    || 'Dear {{name}}, this is a reminder to pay your {{month}} partnership pledge. God bless you.';

  if (btn) { btn.disabled = true; btn.textContent = '⏳ …'; }

  const res = await apiPost('kpsc-reminder-personalize', { partnerId, year, month, fallbackTemplate });

  if (btn) { btn.disabled = false; btn.textContent = '✨ Personalize'; }

  if (res?.error && (!Array.isArray(res?.variants) || res.variants.length === 0)) {
    showToast('AI personalisation failed. Using template.', 'warn');
    return;
  }

  // Show inline hint if AI couldn't personalize but returned fallback
  if (res?.error) {
    const hintEl = document.getElementById(`krem-ai-hint-${partnerId}`);
    if (hintEl) {
      hintEl.textContent = 'AI couldn\'t personalize this one — using template.';
      hintEl.style.display = 'block';
    }
  }

  openPersonalizeModal(partner, res?.variants || [fallbackTemplate], fallbackTemplate, month, year);
}

function openPersonalizeModal(partner, variants, fallbackTemplate, month, year) {
  document.getElementById('k-personalize-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'k-personalize-modal';
  modal.className = 'k-modal-overlay';

  const unpaidStr = computeUnpaidMonthsStr(partner, month, year);
  const resolveVars = (s) => String(s)
    .replace(/\{\{name\}\}/g, partner.fullName)
    .replace(/\{\{month\}\}/g, monthName(month))
    .replace(/\{\{unpaidMonths\}\}/g, unpaidStr);

  const variantCards = variants.map((v, i) => {
    const resolved = resolveVars(v);
    return `
      <div class="k-remind-variant-card">
        <div class="k-remind-variant-text">${esc(resolved)}</div>
        <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.useReminderVariant('${esc(partner.id)}', ${i})">Use this</button>
      </div>`;
  }).join('');

  const fallbackResolved = resolveVars(fallbackTemplate);

  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title">✨ Personalize Reminder — ${esc(partner.fullName)}</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closePersonalizeModal()">✕</button>
      </div>
      <div class="k-modal-body">
        <p class="k-hint" style="margin-bottom:12px">Choose a variant to use for this partner's reminder. The secretary can still edit it in the copy/send step.</p>
        <div class="k-remind-variants">${variantCards}</div>
        <div class="k-remind-variant-card k-remind-variant-fallback">
          <div class="k-remind-variant-text" style="color:#888">${esc(fallbackResolved)}</div>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.useReminderVariant('${esc(partner.id)}', -1)">Use my template</button>
        </div>
      </div>
    </div>`;

  // Store resolved variants on the modal element for retrieval
  modal._variants = variants.map(resolveVars);
  modal._fallback = fallbackResolved;

  document.body.appendChild(modal);
}

function useReminderVariant(partnerId, variantIndex) {
  const modal = document.getElementById('k-personalize-modal');
  if (!modal) return;
  let chosen;
  if (variantIndex === -1) {
    chosen = modal._fallback;
    _personalizedMessages.delete(partnerId);
  } else {
    chosen = modal._variants[variantIndex] || modal._fallback;
    _personalizedMessages.set(partnerId, chosen);
  }
  closePersonalizeModal();

  // Visual confirmation on the partner row
  const hintEl = document.getElementById(`krem-ai-hint-${partnerId}`);
  if (hintEl) {
    hintEl.textContent = variantIndex === -1 ? 'Using template.' : 'AI variant selected — click Copy to use it.';
    hintEl.style.display = 'block';
    hintEl.style.color = variantIndex === -1 ? '#888' : '#2a6';
  }
}

function closePersonalizeModal() {
  document.getElementById('k-personalize-modal')?.remove();
}

let _reminderTemplateSaveTimer = null;
function debouncedSaveReminderTemplate(textarea) {
  clearTimeout(_reminderTemplateSaveTimer);
  _reminderTemplateSaveTimer = setTimeout(async () => {
    const template = textarea.value.trim();
    const res = await apiPost('settings', { kpsc_sms_text_reminder: template });
    if (res?.error) {
      showToast('Could not save template: ' + res.error, 'error');
    } else {
      showToast('Template saved.', 'success');
    }
  }, 500);
}

function reportsCategoryOptions() {
  const opts = [
    { key: 'all',               label: 'All items'           },
    { key: 'resolutions',       label: 'Resolutions'         },
    { key: 'financial',         label: 'Financial approvals' },
    { key: 'amendments',        label: 'Amendments'          },
    { key: 'rejections',        label: 'Rejections'          },
    { key: 'motions',           label: 'Motions / proposals' },
    { key: 'action_items',      label: 'Action items'        },
    { key: 'policy_flags',      label: 'Governance alerts'   },
    { key: 'suggested_projects',label: 'Project suggestions' },
  ];
  if (S.user?.name) opts.push({ key: 'my_tasks', label: 'My tasks' });
  return opts;
}

function canEditInsightsActionStatus() {
  const role = String(S.user?.role || '').toLowerCase();
  return role === 'acting_chairman' || role === 'general_secretary';
}

function normalizeActionId(action, idx) {
  return String(action?.id || `act-${idx + 1}`).trim();
}

function extractYearFromStamp(stamp) {
  return Number(String(stamp || '').slice(0, 4));
}

function classifyResolutionInsight(item) {
  const type = String(item?.resolutionType || '').toLowerCase();
  const cat  = String(item?.category || '').toLowerCase();
  const text = String(item?.text || '');
  // Priority: financial > amendment > rejection > motion/proposal > generic resolution.
  // 'financial' stored category is authoritative alongside the resolutionType and amount signals.
  if (type === 'financial_approval' || cat === 'financial' || (item?.amount && String(item.amount).trim())) return 'financial';
  if (type === 'amendment' || /\bamend(?:ment|ed)?\b/i.test(text)) return 'amendments';
  if (type === 'rejection' || item?.approved === false || /\breject(?:ed|ion)?\b/i.test(text)) return 'rejections';
  // 'vote' type without other signals is a general voted resolution.
  if (type === 'motion' || /\b(?:motion|proposal|proposed)\b/i.test(text)) return 'motions';
  // 'approval', 'vote', 'decision' all map to the general resolutions bucket.
  return 'resolutions';
}

function buildMeetingInsights(meetings) {
  const entries = [];
  for (const m of (meetings || [])) {
    const meetingDate = String(m.meetingDate || '').trim();
    const meetingType = String(m.meetingType || '').trim();
    const createdAt = String(m.createdAt || '').trim();
    for (const [idx, r] of (m.resolutions || []).entries()) {
      if (!r?.text) continue;
      entries.push({
        id: `${m.id}:${r.id || `res-${idx + 1}`}`,
        kind: 'resolution',
        category: classifyResolutionInsight(r),
        meetingId: m.id,
        meetingTitle: m.title || 'KPSC Meeting',
        meetingType,
        meetingDate,
        createdAt,
        text: String(r.text || '').trim(),
        resolutionType: String(r.resolutionType || 'decision').trim(),
        approval: r.approved === true ? 'approved' : r.approved === false ? 'rejected' : 'needs_confirmation',
        amount: String(r.amount || '').trim(),
        motionBy: String(r.motionBy || '').trim(),
        secondedBy: String(r.secondedBy || '').trim(),
        voteSummary: String(r.voteSummary || '').trim(),
      });
    }
    for (const [idx, a] of (m.actionItems || []).entries()) {
      if (!a?.task) continue;
      entries.push({
        id: `${m.id}:${a.id || `act-${idx + 1}`}`,
        kind: 'action_item',
        category: 'action_items',
        meetingId: m.id,
        meetingTitle: m.title || 'KPSC Meeting',
        meetingType,
        meetingDate,
        createdAt,
        actionId: normalizeActionId(a, idx),
        text: String(a.task || '').trim(),
        assignee: String(a.assignee || 'Unassigned').trim() || 'Unassigned',
        dueDate: String(a.dueDate || '').trim(),
        status: String(a.status || 'pending').trim() || 'pending',
      });
    }
    for (const [idx, f] of (m.policyFlags || []).entries()) {
      if (!f?.message && !f?.type) continue;
      entries.push({
        id: `${m.id}:flag-${idx}`,
        kind: 'policy_flag',
        category: 'policy_flags',
        meetingId: m.id,
        meetingTitle: m.title || 'KPSC Meeting',
        meetingType,
        meetingDate,
        createdAt,
        text: String(f.message || f.type || '').trim(),
        flagType: String(f.type || '').trim(),
        severity: String(f.severity || 'low').trim(),
      });
    }
    for (const [idx, p] of (m.suggestedProjects || []).entries()) {
      if (!p?.title && !p?.description) continue;
      entries.push({
        id: `${m.id}:proj-${idx}`,
        kind: 'suggested_project',
        category: 'suggested_projects',
        meetingId: m.id,
        meetingTitle: m.title || 'KPSC Meeting',
        meetingType,
        meetingDate,
        createdAt,
        text: String(p.title || p.description || '').trim(),
        projectTitle: String(p.title || '').trim(),
        projectDescription: String(p.description || '').trim(),
        estimatedCost: String(p.estimatedCost || p.estimated_cost || '').trim(),
      });
    }
  }
  return entries.sort((a, b) => {
    const dateCmp = (b.meetingDate || '').localeCompare(a.meetingDate || '');
    if (dateCmp) return dateCmp;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

// Filters entries by year + month + search + optional category override.
// Pass categoryOverride = 'all' to count across all categories for chip counts.
function filterMeetingInsights(entries, categoryOverride) {
  const year = Number(S.reportsYear) || currentYear();
  const month = Number(S.reportsMonth) || 0;
  const category = categoryOverride !== undefined ? categoryOverride : (S.reportsFilter || 'all');
  const q = String(S.reportsSearch || '').trim().toLowerCase();
  const assigneeFilter = String(S.reportsAssignee || '').trim().toLowerCase();
  const approvalFilter = String(S.reportsApproval || 'all');
  const myName = String(S.user?.name || '').trim().toLowerCase();

  return entries.filter(entry => {
    const stamp = entry.meetingDate || entry.createdAt;
    if (year && !String(stamp).startsWith(String(year))) return false;
    if (month && Number(String(stamp).slice(5, 7)) !== month) return false;

    // Handle special 'my_tasks' category: action items assigned to current user
    if (category === 'my_tasks') {
      if (entry.kind !== 'action_item') return false;
      if (!myName) return false;
      if (!String(entry.assignee || '').toLowerCase().includes(myName)) return false;
    } else if (category !== 'all' && entry.category !== category) {
      return false;
    }

    // Assignee dropdown filter (action items only)
    if (assigneeFilter && entry.kind === 'action_item') {
      if (!String(entry.assignee || '').toLowerCase().includes(assigneeFilter)) return false;
    }

    // Approval status filter (resolutions only)
    if (approvalFilter !== 'all' && entry.kind === 'resolution') {
      if (entry.approval !== approvalFilter) return false;
    }

    if (!q) return true;
    const hay = [
      entry.meetingTitle,
      entry.meetingDate,
      entry.text,
      entry.resolutionType,
      entry.voteSummary,
      entry.motionBy,
      entry.secondedBy,
      entry.amount,
      entry.assignee,
      entry.dueDate,
      entry.status,
      entry.flagType,
      entry.severity,
      entry.projectTitle,
      entry.projectDescription,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

// Color-coded badge for action item completion status.
function insightsStatusBadge(status) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'done')        return '<span class="kbadge badge-green">done</span>';
  if (s === 'in_progress') return '<span class="kbadge badge-blue">in progress</span>';
  if (s === 'cancelled')   return '<span class="kbadge badge-gray">cancelled</span>';
  return '<span class="kbadge badge-amber">pending</span>';
}

// Returns an HTML snippet for the due-date field, with overdue highlighting.
// Both dueDate and today() return ISO 8601 (YYYY-MM-DD) strings, so lexicographic
// comparison is equivalent to chronological comparison for this format.
function insightsDueDateLabel(dueDate, status) {
  if (!dueDate) return '<span class="k-insight-dim">No deadline</span>';
  const s = String(status || '').toLowerCase();
  if (s !== 'done' && s !== 'cancelled' && dueDate < today()) {
    return `<span class="k-insight-overdue">📅 ${esc(dueDate)} — overdue</span>`;
  }
  return `<span>📅 ${esc(dueDate)}</span>`;
}

// Context-aware empty state: differentiates "no meetings processed" vs "AI found nothing" vs "filter mismatch".
function buildInsightsEmptyState(allEntries, meetings) {
  const processed = (meetings || []).filter(m => m.status === 'processed');
  if (!processed.length) {
    return `
      <div class="k-empty">
        <div style="font-size:32px;margin-bottom:8px">📋</div>
        <div style="font-weight:600;margin-bottom:6px;color:var(--text)">No processed meetings yet</div>
        <div>After a meeting is recorded and processed by the AI Secretary, resolutions, action items, and other insights will appear here automatically.</div>
      </div>`;
  }
  if (!allEntries.length) {
    return `
      <div class="k-empty">
        <div style="font-size:32px;margin-bottom:8px">🔍</div>
        <div style="font-weight:600;margin-bottom:6px;color:var(--text)">No structured items found</div>
        <div>The AI did not detect any resolutions or action items in the processed meetings. Ensure meetings have full transcript content when processed.</div>
      </div>`;
  }
  return `
    <div class="k-empty">
      <div style="font-weight:600;margin-bottom:6px;color:var(--text)">No items match this filter</div>
      <div>Try a different category, a wider date range, or clear the search term.</div>
    </div>`;
}

function buildInsightsHeaderActions(filteredEntries) {
  const hasItems = filteredEntries.length > 0;
  const showShare = hasItems && canEditInsightsActionStatus() && (S.reportsFilter === 'action_items' || S.reportsFilter === 'my_tasks');
  return `
    ${hasItems ? `<button class="kbtn kbtn-sm" onclick="Kpsc.printInsightsReport()" title="Print filtered insights">🖨 Print</button>` : ''}
    ${showShare ? `<button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.shareInsightActions()" title="Share pending actions via WhatsApp">📲 Share</button>` : ''}
  `;
}


function insightMtgPill(entry) {
  const safeMid = String(entry.meetingId || '');
  const label = esc(entry.meetingTitle);
  return `<span class="k-insight-mtg-link" onclick="event.stopPropagation();Kpsc.openMeeting('${safeMid}')" title="Open full minutes">📋 ${label}</span>`;
}

function insightTruncText(text, maxLen) {
  if (!text || text.length <= maxLen) return `<div class="k-ic-title">${esc(text || '')}</div>`;
  return `
    <details class="k-insight-expand">
      <summary class="k-ic-title">${esc(text.slice(0, maxLen))}… <span class="k-insight-show-more">show more</span></summary>
      <div class="k-insight-full-text">${esc(text)}</div>
    </details>`;
}

function renderMeetingInsightCard(entry) {
  const safeMid = String(entry.meetingId || '');
  const dateStr = esc(fmtDate(entry.meetingDate) || entry.meetingDate || 'No date');
  const viewLink = `<div class="k-insight-view-link" onclick="Kpsc.openMeeting('${safeMid}')">View full minutes →</div>`;

  // ── POLICY FLAG CARD ──────────────────────────────────────────
  if (entry.kind === 'policy_flag') {
    const sevCls = entry.severity === 'high' ? 'k-insight-flag-high' : entry.severity === 'medium' ? 'k-insight-flag-medium' : 'k-insight-flag-low';
    const sevBadge = entry.severity === 'high'
      ? '<span class="kbadge badge-red">HIGH</span>'
      : entry.severity === 'medium'
        ? '<span class="kbadge badge-amber">MEDIUM</span>'
        : '<span class="kbadge badge-blue">LOW</span>';
    const typeLabel = String(entry.flagType || '').replace(/_/g, ' ');
    return `
      <div class="k-meeting-card k-insight-card ${sevCls}" style="cursor:default">
        <div class="k-ic-title">🚩 ${esc(typeLabel || 'Governance alert')}</div>
        <div class="k-ic-badges">${sevBadge}<span class="kbadge badge-type">Policy flag</span></div>
        <div class="k-ic-meta"><span>${dateStr}</span>${insightMtgPill(entry)}</div>
        ${entry.text ? `<div class="k-insight-flag-msg">${esc(entry.text)}</div>` : ''}
        <div class="k-ic-footer">${viewLink}</div>
      </div>`;
  }

  // ── SUGGESTED PROJECT CARD ────────────────────────────────────
  if (entry.kind === 'suggested_project') {
    const costHtml = entry.estimatedCost ? `<span class="kbadge badge-type">Est. ${esc(formatResolutionAmount(entry.estimatedCost))}</span>` : '';
    const canPromote = canEditInsightsActionStatus();
    const mId = esc(String(entry.meetingId || ''));
    const pTitle = String(entry.projectTitle || entry.text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const pDesc  = String(entry.projectDescription || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const pCost  = String(entry.estimatedCost || '0');
    const pPri   = String(entry.priority || 'medium');
    const pDate  = String(entry.targetDate || '');
    return `
      <div class="k-meeting-card k-insight-card k-mc-accent-purple k-insight-project-card" style="cursor:default">
        <div class="k-ic-title">💡 ${esc(entry.projectTitle || entry.text)}</div>
        <div class="k-ic-badges">${costHtml}<span class="kbadge badge-type">AI suggestion</span></div>
        <div class="k-ic-meta"><span>${dateStr}</span>${insightMtgPill(entry)}</div>
        ${entry.projectDescription && entry.projectDescription !== entry.projectTitle
          ? `<div class="k-insight-flag-msg">${esc(entry.projectDescription)}</div>` : ''}
        <div class="k-ic-footer">
          ${canPromote ? `<button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.promoteInsightProject(this,'${mId}','${pTitle}','${pDesc}','${pCost}','${pPri}','${pDate}')">➕ Promote to project</button>` : ''}
          ${viewLink}
        </div>
      </div>`;
  }

  // ── ACTION ITEM CARD ──────────────────────────────────────────
  if (entry.kind === 'action_item') {
    const canEdit = canEditInsightsActionStatus();
    const meetingIdSafe = encodeURIComponent(String(entry.meetingId || ''));
    const actionIdSafe = encodeURIComponent(String(entry.actionId || ''));
    const dueDateHtml = insightsDueDateLabel(entry.dueDate, entry.status);
    const accentCls = entry.status === 'done' ? 'k-mc-accent-green' : entry.status === 'cancelled' ? 'k-mc-accent-gray' : 'k-mc-accent-blue';
    const safeEntryId = esc(entry.id);
    return `
      <div class="k-meeting-card k-insight-card ${accentCls}" style="cursor:default" id="k-ic-${safeEntryId.replace(/[^a-z0-9]/gi,'_')}">
        ${insightTruncText(entry.text, 130)}
        <div class="k-ic-badges"><span class="kbadge badge-type">Action item</span></div>
        <div class="k-ic-meta"><span>${dateStr}</span>${insightMtgPill(entry)}</div>
        <div class="k-ic-info">
          <span>👤 ${esc(entry.assignee || 'Unassigned')}</span>
          ${dueDateHtml}
          ${canEdit
            ? `<select class="k-input k-input-sm k-insight-status-select" aria-label="Update action status"
                 onchange="Kpsc.updateReportActionStatus('${meetingIdSafe}','${actionIdSafe}',this.value,this)">
                 ${['pending','in_progress','done','cancelled'].map(st =>
                   `<option value="${st}" ${entry.status === st ? 'selected' : ''}>${st.replace(/_/g, ' ')}</option>`
                 ).join('')}
               </select>`
            : insightsStatusBadge(entry.status)
          }
          ${canEdit ? `<button class="kbtn kbtn-sm kbtn-ghost k-insight-edit-btn" onclick="Kpsc.toggleInsightEdit('${esc(entry.id)}','${meetingIdSafe}','${actionIdSafe}')">✏️ Edit</button>` : ''}
        </div>
        <div id="k-ie-form-${safeEntryId.replace(/[^a-z0-9]/gi,'_')}" style="display:none"></div>
        <div class="k-ic-footer">${viewLink}</div>
      </div>`;
  }

  // ── RESOLUTION CARD ───────────────────────────────────────────
  const statusBadge = entry.approval === 'approved'
    ? '<span class="kbadge badge-green">✓ Approved</span>'
    : entry.approval === 'rejected'
      ? '<span class="kbadge badge-red">✗ Rejected</span>'
      : '<span class="kbadge badge-amber">Needs confirmation</span>';
  const accentCls = entry.approval === 'approved' ? 'k-mc-accent-green' : entry.approval === 'rejected' ? 'k-mc-accent-red' : entry.category === 'financial' ? 'k-mc-accent-orange' : entry.category === 'motions' ? 'k-mc-accent-purple' : entry.category === 'amendments' ? 'k-mc-accent-blue' : 'k-mc-accent-amber';
  return `
    <div class="k-meeting-card k-insight-card ${accentCls}" style="cursor:default">
      ${insightTruncText(entry.text, 130)}
      <div class="k-ic-badges">
        ${statusBadge}
        <span class="kbadge badge-type">${esc(String(entry.resolutionType || 'decision').replace(/_/g, ' '))}</span>
        ${entry.amount ? `<span class="kbadge badge-green">${esc(formatResolutionAmount(entry.amount))}</span>` : ''}
      </div>
      <div class="k-ic-meta"><span>${dateStr}</span>${insightMtgPill(entry)}</div>
      ${entry.motionBy || entry.secondedBy || entry.voteSummary ? `
        <div class="k-ic-info">
          ${entry.motionBy ? `<span>🗣 Moved: ${esc(entry.motionBy)}</span>` : ''}
          ${entry.secondedBy ? `<span>Seconded: ${esc(entry.secondedBy)}</span>` : ''}
          ${entry.voteSummary ? `<span>${esc(entry.voteSummary)}</span>` : ''}
        </div>` : ''}
      <div class="k-ic-footer">${viewLink}</div>
    </div>`;
}

// Re-renders chips + count + list from cached S.meetings — no API call.
function rerenderInsightsList() {
  const allEntries = buildMeetingInsights(S.meetings);
  // Counts respect year + month + search but ignore the category chip (standard faceted behaviour).
  const baseFiltered = filterMeetingInsights(allEntries, 'all');
  const filtered = filterMeetingInsights(allEntries);
  const categories = reportsCategoryOptions();
  const counts = categories.reduce((acc, c) => {
    if (c.key === 'all') return { ...acc, all: baseFiltered.length };
    if (c.key === 'my_tasks') {
      const myName = String(S.user?.name || '').trim().toLowerCase();
      return { ...acc, my_tasks: myName ? baseFiltered.filter(e => e.kind === 'action_item' && String(e.assignee || '').toLowerCase().includes(myName)).length : 0 };
    }
    return { ...acc, [c.key]: baseFiltered.filter(item => item.category === c.key).length };
  }, {});

  const chipsEl = document.getElementById('k-insights-chips');
  if (chipsEl) {
    chipsEl.innerHTML = categories.map(c =>
      `<button class="k-filter ${S.reportsFilter === c.key ? 'active' : ''}" onclick="Kpsc.setReportsFilter('${c.key}')">${c.label} (${counts[c.key] || 0})</button>`
    ).join('');
  }

  // Rebuild assignee dropdown from current action item data
  const assigneeEl = document.getElementById('k-insights-assignee');
  if (assigneeEl) {
    const assignees = [...new Set(allEntries.filter(e => e.kind === 'action_item').map(e => e.assignee).filter(a => a && a !== 'Unassigned'))].sort();
    const curAssignee = S.reportsAssignee || '';
    assigneeEl.innerHTML = `<option value="">All assignees</option>` +
      assignees.map(a => `<option value="${esc(a)}" ${curAssignee === a ? 'selected' : ''}>${esc(a)}</option>`).join('');
  }

  // Update view mode toggle button states
  document.querySelectorAll('.k-insight-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === S.insightsViewMode);
  });

  // Keep the header actions (Print / Share) in sync with the current filter state.
  const headerActionsEl = document.getElementById('k-insights-header-actions');
  if (headerActionsEl) headerActionsEl.innerHTML = buildInsightsHeaderActions(filtered);

  const total = baseFiltered.length;
  const countEl = document.getElementById('k-insights-count-text');
  if (countEl) {
    countEl.textContent = filtered.length === total
      ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`
      : `${filtered.length} of ${total} item${total !== 1 ? 's' : ''}`;
  }

  const listEl = document.getElementById('k-insights-list');
  if (listEl) {
    if (!filtered.length) {
      listEl.innerHTML = buildInsightsEmptyState(allEntries, S.meetings);
    } else if (S.insightsViewMode === 'by_meeting') {
      listEl.innerHTML = renderInsightsByMeeting(filtered);
    } else if (S.insightsViewMode === 'by_assignee') {
      listEl.innerHTML = renderInsightsByAssignee(filtered);
    } else {
      listEl.innerHTML = filtered.map(renderMeetingInsightCard).join('');
    }
  }
}

async function renderReports(main) {
  const res = await apiGet('ai-secretary-meetings');
  S.meetings = res?.items || res?.meetings || [];
  const allEntries = buildMeetingInsights(S.meetings);
  // Counts: respect current year + month + search, but ignore category filter for chip counts.
  const baseFiltered = filterMeetingInsights(allEntries, 'all');
  const filtered = filterMeetingInsights(allEntries);

  // Set(...) keeps unique years so the dropdown does not duplicate values.
  const years = [...new Set([currentYear(), ...S.meetings.map(m => extractYearFromStamp(m.meetingDate)).filter(Boolean)])]
    .sort((a, b) => b - a);
  const yearOpts = years.map(y => `<option value="${y}" ${Number(S.reportsYear) === Number(y) ? 'selected' : ''}>${y}</option>`).join('');
  const monthOpts = ['<option value="0">All months</option>', ...Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return `<option value="${month}" ${Number(S.reportsMonth) === month ? 'selected' : ''}>${monthName(month)}</option>`;
  })].join('');

  const categories = reportsCategoryOptions();
  const myName = String(S.user?.name || '').trim().toLowerCase();
  const counts = categories.reduce((acc, c) => {
    if (c.key === 'all') return { ...acc, all: baseFiltered.length };
    if (c.key === 'my_tasks') return { ...acc, my_tasks: myName ? baseFiltered.filter(e => e.kind === 'action_item' && String(e.assignee || '').toLowerCase().includes(myName)).length : 0 };
    return { ...acc, [c.key]: baseFiltered.filter(item => item.category === c.key).length };
  }, {});

  // ── Enhanced stats (computed from ALL entries, all-time) ──────────
  const todayStr = today();
  const actionEntries    = allEntries.filter(e => e.kind === 'action_item');
  const resolutionCount  = allEntries.filter(e => e.kind === 'resolution').length;
  const financialEntries         = allEntries.filter(e => e.category === 'financial');
  const financialCount           = financialEntries.length;
  const pendingActions           = actionEntries.filter(e => e.status === 'pending').length;
  const overdueActions           = actionEntries.filter(e => e.dueDate && e.dueDate < todayStr && e.status !== 'done' && e.status !== 'cancelled').length;
  const doneActions              = actionEntries.filter(e => e.status === 'done').length;
  const totalActions             = actionEntries.length;
  const flagCount                = allEntries.filter(e => e.kind === 'policy_flag').length;
  const highFlagCount            = allEntries.filter(e => e.kind === 'policy_flag' && e.severity === 'high').length;
  const completionPct            = totalActions ? Math.round((doneActions / totalActions) * 100) : 0;
  // Only sum amounts for *approved* financial resolutions — rejected/deferred proposals must not inflate this figure.
  const totalFinancial           = financialEntries.filter(e => e.approval === 'approved').reduce((sum, e) => {
    const n = Number(String(e.amount || '').replace(/,/g, ''));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const financialDisplay         = totalFinancial > 0 ? `₦${totalFinancial.toLocaleString('en-NG')}` : `${financialCount}`;

  const statBar = allEntries.length ? `
    <div class="k-insight-stats">
      <div class="k-insight-stat">
        <span class="k-insight-stat-val">${resolutionCount}</span>
        <span class="k-insight-stat-lbl">Resolutions</span>
      </div>
      <div class="k-insight-stat k-insight-stat-gold">
        <span class="k-insight-stat-val">${financialDisplay}</span>
        <span class="k-insight-stat-lbl">Financial approved</span>
      </div>
      <div class="k-insight-stat k-insight-stat-green">
        <span class="k-insight-stat-val">${completionPct}%</span>
        <span class="k-insight-stat-lbl">Actions done</span>
      </div>
      <div class="k-insight-stat${pendingActions ? ' k-insight-stat-warn' : ''}">
        <span class="k-insight-stat-val">${pendingActions}</span>
        <span class="k-insight-stat-lbl">Pending actions</span>
      </div>
      ${overdueActions ? `
      <div class="k-insight-stat k-insight-stat-alert">
        <span class="k-insight-stat-val">${overdueActions}</span>
        <span class="k-insight-stat-lbl">Overdue</span>
      </div>` : ''}
      ${flagCount ? `
      <div class="k-insight-stat${highFlagCount ? ' k-insight-stat-alert' : ' k-insight-stat-warn'}">
        <span class="k-insight-stat-val">${flagCount}</span>
        <span class="k-insight-stat-lbl">Gov. alerts</span>
      </div>` : ''}
    </div>` : '';

  // ── AI Digest panel ───────────────────────────────────────────
  const digestPanel = buildInsightsDigest(S.meetings);

  // ── Assignee dropdown for filter row ─────────────────────────
  const assignees = [...new Set(allEntries.filter(e => e.kind === 'action_item').map(e => e.assignee).filter(a => a && a !== 'Unassigned'))].sort();
  const assigneeOpts = `<option value="">All assignees</option>` +
    assignees.map(a => `<option value="${esc(a)}" ${S.reportsAssignee === a ? 'selected' : ''}>${esc(a)}</option>`).join('');
  const approvalOpts = [
    ['all', 'All approvals'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
    ['needs_confirmation', 'Needs confirmation'],
  ].map(([v, l]) => `<option value="${v}" ${S.reportsApproval === v ? 'selected' : ''}>${l}</option>`).join('');

  const total = baseFiltered.length;
  const countText = filtered.length === total
    ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`
    : `${filtered.length} of ${total} item${total !== 1 ? 's' : ''}`;

  const listHtml = !filtered.length
    ? buildInsightsEmptyState(allEntries, S.meetings)
    : S.insightsViewMode === 'by_meeting'
      ? renderInsightsByMeeting(filtered)
      : S.insightsViewMode === 'by_assignee'
        ? renderInsightsByAssignee(filtered)
        : filtered.map(renderMeetingInsightCard).join('');

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>AI Meeting Insights</h2>
        <div id="k-insights-header-actions" style="display:flex;gap:8px;align-items:center">
          ${buildInsightsHeaderActions(filtered)}
        </div>
      </div>
      <p class="k-page-hint">AI extracts resolutions, motions, financial approvals, action items, governance alerts, and project suggestions from each processed meeting.</p>
      ${statBar}
      ${digestPanel}
      <div class="k-insight-filters">
        <select class="k-input k-input-sm" onchange="Kpsc.setReportsYear(this.value)">${yearOpts}</select>
        <select class="k-input k-input-sm" onchange="Kpsc.setReportsMonth(this.value)">${monthOpts}</select>
        <select class="k-input k-input-sm" id="k-insights-assignee" onchange="Kpsc.setReportsAssignee(this.value)">${assigneeOpts}</select>
        <select class="k-input k-input-sm" onchange="Kpsc.setReportsApproval(this.value)">${approvalOpts}</select>
        <input class="k-input k-input-sm" type="search" placeholder="Search text, proposer, assignee…" value="${esc(S.reportsSearch)}" oninput="Kpsc.setReportsSearch(this.value)" style="grid-column:1/-1" />
      </div>
      <div class="k-quick-filters" id="k-insights-chips">
        ${categories.map(c =>
          `<button class="k-filter ${S.reportsFilter === c.key ? 'active' : ''}" onclick="Kpsc.setReportsFilter('${c.key}')">${c.label} (${counts[c.key] || 0})</button>`
        ).join('')}
      </div>
      <div class="k-insight-count-row">
        <span id="k-insights-count-text">${countText}</span>
        <div class="k-insight-view-toggle">
          <button class="k-insight-view-btn ${S.insightsViewMode === 'list' ? 'active' : ''}" data-mode="list" onclick="Kpsc.setInsightsViewMode('list')" title="List view">≡ List</button>
          <button class="k-insight-view-btn ${S.insightsViewMode === 'by_meeting' ? 'active' : ''}" data-mode="by_meeting" onclick="Kpsc.setInsightsViewMode('by_meeting')" title="Group by meeting">⊞ By Meeting</button>
          <button class="k-insight-view-btn ${S.insightsViewMode === 'by_assignee' ? 'active' : ''}" data-mode="by_assignee" onclick="Kpsc.setInsightsViewMode('by_assignee')" title="Group by assignee">👤 By Assignee</button>
        </div>
      </div>
      <div class="k-meeting-list" id="k-insights-list">${listHtml}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// ACTION ITEMS PAGE
// ═══════════════════════════════════════════════════════════════════

// ── Filter setters ─────────────────────────────────────────────────
function setActionItemsFilter(key)     { S.actionItemsFilter   = key;       rerenderActionItemsList(); }
function setActionItemsYear(v)         { S.actionItemsYear     = Number(v); rerenderActionItemsList(); }
function setActionItemsMonth(v)        { S.actionItemsMonth    = Number(v); rerenderActionItemsList(); }
function setActionItemsAssignee(v)     { S.actionItemsAssignee = v;         rerenderActionItemsList(); }
function setActionItemsMeeting(v)      { S.actionItemsMeeting  = v;         rerenderActionItemsList(); }
function setActionItemsPriority(v)     { S.actionItemsPriority = v;         rerenderActionItemsList(); }
function setActionItemsSearch(v)       { S.actionItemsSearch   = v;         rerenderActionItemsList(); }
function setActionItemsViewMode(m)     { S.actionItemsViewMode = m;         rerenderActionItemsList(); }

// ── Data builders ──────────────────────────────────────────────────

function buildActionItems(meetings, standalone) {
  const todayStr = today();
  const items = [];
  for (const m of meetings || []) {
    const actArr = m.actionItems || [];
    for (let i = 0; i < actArr.length; i++) {
      const a = actArr[i];
      if (!a?.task) continue;
      const id = normalizeActionId(a, i);
      const isOverdue = !!(a.dueDate && a.dueDate < todayStr && a.status !== 'done' && a.status !== 'cancelled');
      items.push({
        id, task: a.task,
        assignee: a.assignee || 'Unassigned',
        dueDate: a.dueDate || '',
        status: a.status || 'pending',
        priority: a.priority || 'medium',
        notes: a.notes || '',
        source: 'meeting',
        meetingId: m.id,
        meetingTitle: m.title || m.meetingType || 'Meeting',
        meetingDate: m.meetingDate || '',
        projectId: '',
        createdBy: '',
        createdAt: m.meetingDate || '',
        updatedAt: '',
        isOverdue,
      });
    }
  }
  for (const a of standalone || []) {
    const isOverdue = !!(a.due_date && a.due_date < todayStr && a.status !== 'done' && a.status !== 'cancelled');
    const mtg = (meetings || []).find(m => m.id === a.meeting_id);
    items.push({
      id: a.id, task: a.task,
      assignee: a.assignee || 'Unassigned',
      dueDate: a.due_date || '',
      status: a.status || 'pending',
      priority: a.priority || 'medium',
      notes: a.notes || '',
      source: 'manual',
      meetingId: a.meeting_id || '',
      meetingTitle: mtg ? (mtg.title || mtg.meetingType || 'Meeting') : '',
      meetingDate: mtg?.meetingDate || a.created_at?.slice(0,10) || '',
      projectId: a.project_id || '',
      createdBy: a.created_by || '',
      createdAt: a.created_at || '',
      updatedAt: a.updated_at || '',
      isOverdue,
    });
  }
  return items;
}

function filterActionItems(entries, catOverride) {
  const cat      = catOverride !== undefined ? catOverride : S.actionItemsFilter;
  const year     = Number(S.actionItemsYear);
  const month    = Number(S.actionItemsMonth);
  const assignee = S.actionItemsAssignee;
  const meetingF = S.actionItemsMeeting;
  const priority = S.actionItemsPriority;
  const search   = String(S.actionItemsSearch || '').toLowerCase().trim();
  const myName   = String(S.user?.name || '').trim().toLowerCase();

  return entries.filter(e => {
    const dateStr = e.meetingDate || e.createdAt || '';
    if (year  && dateStr && Number(dateStr.slice(0,4)) !== year)  return false;
    if (month && dateStr && Number(dateStr.slice(5,7)) !== month) return false;
    if (assignee && e.assignee !== assignee) return false;
    if (meetingF && e.meetingId !== meetingF) return false;
    if (priority && e.priority !== priority) return false;
    if (search) {
      const hay = [e.task, e.assignee, e.meetingTitle, e.notes].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (cat === 'all')        return true;
    if (cat === 'pending')    return e.status === 'pending';
    if (cat === 'in_progress')return e.status === 'in_progress';
    if (cat === 'done')       return e.status === 'done';
    if (cat === 'cancelled')  return e.status === 'cancelled';
    if (cat === 'overdue')    return e.isOverdue;
    if (cat === 'my_tasks')   return myName && String(e.assignee || '').toLowerCase().includes(myName);
    if (cat === 'unassigned') return !e.assignee || e.assignee === 'Unassigned';
    if (cat === 'manual')     return e.source === 'manual';
    return true;
  });
}

function sortActionItems(entries) {
  const statusOrd = { pending: 0, in_progress: 1, done: 2, cancelled: 3 };
  return [...entries].sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    const so = (statusOrd[a.status] ?? 4) - (statusOrd[b.status] ?? 4);
    if (so !== 0) return so;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate)  return 1;
    return 0;
  });
}

function actionItemChipOptions() {
  const myName = String(S.user?.name || '').trim();
  const chips = [
    { key: 'all',        label: 'All'        },
    { key: 'pending',    label: 'Pending'    },
    { key: 'in_progress',label: 'In Progress'},
    { key: 'done',       label: 'Done'       },
    { key: 'overdue',    label: '⏰ Overdue' },
    { key: 'unassigned', label: 'Unassigned' },
    { key: 'manual',     label: 'Manual'     },
  ];
  if (myName) chips.splice(5, 0, { key: 'my_tasks', label: 'My Tasks' });
  return chips;
}

function aiPriorityBadge(priority) {
  const conf = {
    urgent: { label: 'URGENT', cls: 'badge-red'    },
    high:   { label: 'HIGH',   cls: 'badge-red'    },
    medium: { label: 'Medium', cls: 'badge-blue'   },
    low:    { label: 'Low',    cls: 'badge-gray'   },
  };
  const p = conf[priority] || conf.medium;
  return `<span class="kbadge ${p.cls}">${p.label}</span>`;
}

function aiStatusBadge(status) {
  const conf = {
    pending:     { label: 'Pending',     cls: 'badge-amber' },
    in_progress: { label: 'In Progress', cls: 'badge-blue'  },
    done:        { label: 'Done',        cls: 'badge-green' },
    cancelled:   { label: 'Cancelled',   cls: 'badge-gray'  },
  };
  const s = conf[status] || conf.pending;
  return `<span class="kbadge ${s.cls}">${s.label}</span>`;
}

function aiAccentClass(entry) {
  if (entry.isOverdue)              return 'k-mc-accent-red';
  if (entry.status === 'done')      return 'k-mc-accent-green';
  if (entry.status === 'in_progress') return 'k-mc-accent-blue';
  if (entry.status === 'cancelled') return 'k-mc-accent-grey';
  return 'k-mc-accent-amber';
}

// ── Three-dot context menu helper ──────────────────────────────────
function cardCtxMenu(id, ...items) {
  const menuId = `k-ctx-${CSS.escape ? CSS.escape(id) : String(id).replace(/[^a-zA-Z0-9-_]/g, '-')}`;
  const btnItems = items.map(it =>
    `<button class="${it.danger ? 'k-ctx-danger' : ''}" onclick="event.stopPropagation();document.getElementById('${menuId}').style.display='none';${it.onclick}">${it.label}</button>`
  ).join('');
  return `<div class="k-card-ctx-wrap" onclick="event.stopPropagation()">
    <button class="k-card-ctx-btn" onclick="event.stopPropagation();const m=document.getElementById('${menuId}');document.querySelectorAll('.k-card-ctx-menu').forEach(x=>x!==m&&(x.style.display='none'));m.style.display=m.style.display==='block'?'none':'block'" title="Options">⋮</button>
    <div class="k-card-ctx-menu" id="${menuId}" style="display:none">${btnItems}</div>
  </div>`;
}

// ── Card renderer ──────────────────────────────────────────────────

function renderActionItemCard(entry) {
  const canEdit = canEditInsightsActionStatus();
  const accent  = aiAccentClass(entry);
  const eid     = encodeURIComponent(entry.id);
  const emid    = encodeURIComponent(entry.meetingId || '');
  const esrc    = entry.source;

  const titleHtml = insightTruncText(entry.task, 120);
  const overdueBadge = entry.isOverdue
    ? `<span class="kbadge badge-red">⏰ Overdue</span>` : '';
  const sourceBadge = entry.source === 'manual'
    ? `<span class="kbadge badge-purple">Manual</span>` : '';

  const statusEl = canEdit
    ? `<select class="k-input k-input-sm k-ai-status-select" onchange="Kpsc.updateActionItemStatusById('${eid}','${esrc}','${emid}',this.value,this)">
        ${['pending','in_progress','done','cancelled'].map(s =>
          `<option value="${s}" ${entry.status === s ? 'selected' : ''}>${s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}</option>`
        ).join('')}
       </select>`
    : aiStatusBadge(entry.status);

  const dueBit = entry.dueDate
    ? `<span>📅 ${entry.isOverdue ? `<span class="k-insight-overdue">Due ${entry.dueDate}</span>` : `Due ${entry.dueDate}`}</span>` : '';
  const assigneeBit = `<span>👤 ${esc(entry.assignee)}</span>`;
  const meetingPill = entry.meetingId
    ? `<span class="k-insight-mtg-link" onclick="Kpsc.navigate('archive');setTimeout(()=>Kpsc.openMeeting('${encodeURIComponent(entry.meetingId)}'),300)">📋 ${esc(entry.meetingTitle || 'Meeting')}</span>` : '';

  const notesBit = entry.notes
    ? `<div class="k-ic-info"><span class="k-insight-dim">📝 ${esc(entry.notes)}</span></div>` : '';

  const isSelected = S.actionItemsSelected.includes(entry.id);
  const checkboxEl = canEdit
    ? `<input type="checkbox" class="k-ai-checkbox" ${isSelected ? 'checked' : ''} onchange="Kpsc.toggleActionItemCheck('${esc(entry.id)}')" title="Select item" />` : '';

  const doneBtn = canEdit && entry.status !== 'done' && entry.status !== 'cancelled'
    ? `<button class="kbtn kbtn-sm kbtn-success k-insight-edit-btn" onclick="Kpsc.toggleActionItemDone('${eid}','${esrc}','${emid}')">✓ Done</button>` : '';
  const ctxMenu = canEdit ? cardCtxMenu(
    entry.id,
    { label: '✏️ Edit',   onclick: `Kpsc.openActionItemEdit('${eid}','${esrc}','${emid}')` },
    { label: '🗑 Delete', onclick: `Kpsc.deleteActionItemById('${eid}','${esrc}','${emid}')`, danger: true },
  ) : '';
  const viewMinutesLink = entry.meetingId
    ? `<span class="k-insight-view-link" onclick="Kpsc.navigate('archive');setTimeout(()=>Kpsc.openMeeting('${encodeURIComponent(entry.meetingId)}'),300)">View in Minutes →</span>` : '';

  return `
    <div class="k-meeting-card k-insight-card ${accent}" id="k-ai-card-${CSS.escape ? CSS.escape(entry.id) : entry.id.replace(/[^a-zA-Z0-9]/g,'-')}" style="position:relative">
      ${ctxMenu}
      <div class="k-ai-card-hdr">
        ${checkboxEl}
        <div class="k-ic-badges">
          ${aiPriorityBadge(entry.priority)}
          ${overdueBadge}
          ${sourceBadge}
          ${statusEl}
        </div>
      </div>
      <div class="k-ic-title">${titleHtml}</div>
      <div class="k-ic-meta">
        ${assigneeBit}
        ${dueBit}
        ${meetingPill}
      </div>
      ${notesBit}
      <div class="k-ic-footer">
        ${doneBtn}
        ${viewMinutesLink}
      </div>
    </div>`;
}

// ── Grouped views ──────────────────────────────────────────────────

function renderActionItemsByAssignee(filtered) {
  const groups = new Map();
  for (const e of filtered) {
    const key = e.assignee || 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const sorted = [...groups.entries()].sort(([a],[b]) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });
  return sorted.map(([name, items]) => {
    const overdue = items.filter(e => e.isOverdue).length;
    const meta = overdue ? `<span class="k-insight-group-hdr-meta">${overdue} overdue</span>` : '';
    return `
      <div class="k-insight-group">
        <div class="k-insight-group-hdr">
          <span class="k-insight-group-hdr-title">👤 ${esc(name)}</span>
          ${meta}
          <span class="k-insight-group-hdr-count">${items.length}</span>
        </div>
        <div class="k-insight-group-cards">${sortActionItems(items).map(renderActionItemCard).join('')}</div>
      </div>`;
  }).join('');
}

function renderActionItemsByMeeting(filtered) {
  const groups = new Map();
  for (const e of filtered) {
    const key = e.meetingId || '__manual__';
    if (!groups.has(key)) groups.set(key, { title: e.meetingTitle || (e.source === 'manual' ? 'Manual Items' : 'Unknown Meeting'), date: e.meetingDate, items: [] });
    groups.get(key).items.push(e);
  }
  const sorted = [...groups.entries()].sort(([,a],[,b]) => (b.date || '').localeCompare(a.date || ''));
  return sorted.map(([meetingId, grp]) => {
    const overdue = grp.items.filter(e => e.isOverdue).length;
    const meta = [grp.date ? grp.date.slice(0,10) : '', overdue ? `${overdue} overdue` : ''].filter(Boolean).join(' · ');
    return `
      <div class="k-insight-group">
        <div class="k-insight-group-hdr">
          <span class="k-insight-group-hdr-title">📋 ${esc(grp.title)}</span>
          ${meta ? `<span class="k-insight-group-hdr-meta">${meta}</span>` : ''}
          <span class="k-insight-group-hdr-count">${grp.items.length}</span>
        </div>
        <div class="k-insight-group-cards">${sortActionItems(grp.items).map(renderActionItemCard).join('')}</div>
      </div>`;
  }).join('');
}

// ── Stats bar ──────────────────────────────────────────────────────

function buildActionItemsStats(all) {
  const todayStr = today();
  const total    = all.length;
  const pending  = all.filter(e => e.status === 'pending').length;
  const inProg   = all.filter(e => e.status === 'in_progress').length;
  const done     = all.filter(e => e.status === 'done').length;
  const cancelled= all.filter(e => e.status === 'cancelled').length;
  const active   = total - cancelled;
  const overdue  = all.filter(e => e.isOverdue).length;
  const unassigned = all.filter(e => !e.assignee || e.assignee === 'Unassigned').length;
  const donePct  = active > 0 ? Math.round((done / active) * 100) : 0;
  if (!total) return '';
  return `
    <div class="k-insight-stats k-ai-stats">
      <div class="k-insight-stat">
        <span class="k-insight-stat-val">${total}</span>
        <span class="k-insight-stat-lbl">Total</span>
      </div>
      <div class="k-insight-stat${pending ? ' k-insight-stat-warn' : ''}">
        <span class="k-insight-stat-val">${pending}</span>
        <span class="k-insight-stat-lbl">Pending</span>
      </div>
      <div class="k-insight-stat">
        <span class="k-insight-stat-val">${inProg}</span>
        <span class="k-insight-stat-lbl">In Progress</span>
      </div>
      <div class="k-insight-stat k-insight-stat-green">
        <span class="k-insight-stat-val">${donePct}%</span>
        <span class="k-insight-stat-lbl">Done rate</span>
      </div>
      ${overdue ? `
      <div class="k-insight-stat k-insight-stat-alert">
        <span class="k-insight-stat-val">${overdue}</span>
        <span class="k-insight-stat-lbl">Overdue</span>
      </div>` : ''}
      ${unassigned ? `
      <div class="k-insight-stat">
        <span class="k-insight-stat-val">${unassigned}</span>
        <span class="k-insight-stat-lbl">Unassigned</span>
      </div>` : ''}
    </div>`;
}

// ── Create form ────────────────────────────────────────────────────

function buildActionItemCreateForm(meetings) {
  const mtgOpts = meetings.map(m =>
    `<option value="${esc(m.id)}">${esc(m.title || m.meetingType || 'Meeting')} — ${(m.meetingDate||'').slice(0,10)}</option>`
  ).join('');
  const memberNames = [...new Set((S.members || []).filter(m => m.name).map(m => String(m.name).trim()))].sort();
  const memberOpts  = memberNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  return `
    <div class="k-ai-create-form" id="k-ai-create-form">
      <div class="k-section-hdr" style="margin-bottom:10px">
        <h3>New Action Item</h3>
        <button class="kbtn kbtn-sm" onclick="Kpsc.closeActionItemCreateForm()">✕ Cancel</button>
      </div>
      <div class="k-ai-form-grid">
        <div style="grid-column:1/-1">
          <label class="k-insight-edit-lbl">Task *</label>
          <textarea class="k-input k-review-textarea" id="k-ai-new-task" placeholder="Describe the action item…" rows="2"></textarea>
        </div>
        <div>
          <label class="k-insight-edit-lbl">Assignee</label>
          <select class="k-input" id="k-ai-new-assignee">
            <option value="">— Unassigned —</option>
            ${memberOpts}
          </select>
        </div>
        <div>
          <label class="k-insight-edit-lbl">Due Date</label>
          <input type="date" class="k-input" id="k-ai-new-due" />
        </div>
        <div>
          <label class="k-insight-edit-lbl">Priority</label>
          <select class="k-input" id="k-ai-new-priority">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label class="k-insight-edit-lbl">Link to Meeting</label>
          <select class="k-input" id="k-ai-new-meeting">
            <option value="">— None —</option>
            ${mtgOpts}
          </select>
        </div>
        <div style="grid-column:1/-1">
          <label class="k-insight-edit-lbl">Notes</label>
          <input type="text" class="k-input" id="k-ai-new-notes" placeholder="Optional notes…" />
        </div>
      </div>
      <div class="k-insight-edit-actions" style="margin-top:12px">
        <button class="kbtn kbtn-primary" onclick="Kpsc.submitActionItemCreate(this)">Create Action Item</button>
      </div>
    </div>`;
}

function openActionItemCreateForm() {
  const el = document.getElementById('k-ai-create-form');
  if (el) { el.style.display = 'block'; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const listEl = document.getElementById('k-ai-list-wrap');
  if (!listEl) return;
  const form = document.createElement('div');
  form.innerHTML = buildActionItemCreateForm(S.meetings);
  listEl.parentNode.insertBefore(form.firstElementChild, listEl);
}

function closeActionItemCreateForm() {
  const el = document.getElementById('k-ai-create-form');
  if (el) el.remove();
}

async function submitActionItemCreate(btn) {
  const task = document.getElementById('k-ai-new-task')?.value.trim();
  if (!task) { showToast('Task is required.', 'warn'); return; }
  const data = {
    task,
    assignee:  document.getElementById('k-ai-new-assignee')?.value || '',
    dueDate:   document.getElementById('k-ai-new-due')?.value || '',
    priority:  document.getElementById('k-ai-new-priority')?.value || 'medium',
    meetingId: document.getElementById('k-ai-new-meeting')?.value || '',
    notes:     document.getElementById('k-ai-new-notes')?.value || '',
  };
  btn.disabled = true;
  try {
    const created = await apiPost('action-items', data);
    if (created?.error) { showToast(created.error, 'error'); return; }
    S.actionItems = [...(S.actionItems || []), created];
    showToast('Action item created.', 'success');
    closeActionItemCreateForm();
    rerenderActionItemsList();
  } catch (e) {
    showToast('Failed to create action item.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Inline edit ────────────────────────────────────────────────────

function openActionItemEdit(encodedId, source, encodedMeetingId) {
  const id        = decodeURIComponent(encodedId);
  const meetingId = decodeURIComponent(encodedMeetingId || '');
  const all       = buildActionItems(S.meetings, S.actionItems);
  const entry     = all.find(e => e.id === id);
  if (!entry) { showToast('Item not found.', 'error'); return; }
  const cardId = 'k-ai-card-' + id.replace(/[^a-zA-Z0-9]/g,'-');
  const card   = document.getElementById(cardId);
  if (!card)   { showToast('Card not found.', 'error'); return; }

  const memberNames = [...new Set((S.members || []).filter(m => m.name).map(m => String(m.name).trim()))].sort();
  const assigneeOpts = ['', ...memberNames].map(n =>
    `<option value="${esc(n)}" ${entry.assignee === n || (n === '' && entry.assignee === 'Unassigned') ? 'selected' : ''}>${n || '— Unassigned —'}</option>`
  ).join('');

  const eid  = encodeURIComponent(id);
  const esrc = source;
  const emid = encodeURIComponent(meetingId);

  const editHtml = `
    <div class="k-insight-edit-form" id="k-ai-edit-${id.replace(/[^a-zA-Z0-9]/g,'-')}">
      <div class="k-insight-edit-lbl">Task</div>
      <textarea class="k-input k-review-textarea" id="k-ai-edit-task-${id.replace(/[^a-zA-Z0-9]/g,'-')}" rows="2">${esc(entry.task)}</textarea>
      <div class="k-insight-edit-row">
        <div>
          <div class="k-insight-edit-lbl">Assignee</div>
          <select class="k-input" id="k-ai-edit-asgn-${id.replace(/[^a-zA-Z0-9]/g,'-')}">${assigneeOpts}</select>
        </div>
        <div>
          <div class="k-insight-edit-lbl">Due Date</div>
          <input type="date" class="k-input" id="k-ai-edit-due-${id.replace(/[^a-zA-Z0-9]/g,'-')}" value="${esc(entry.dueDate)}" />
        </div>
        <div>
          <div class="k-insight-edit-lbl">Priority</div>
          <select class="k-input" id="k-ai-edit-pri-${id.replace(/[^a-zA-Z0-9]/g,'-')}">
            ${['low','medium','high','urgent'].map(p => `<option value="${p}" ${entry.priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="k-insight-edit-lbl">Notes</div>
          <input type="text" class="k-input" id="k-ai-edit-notes-${id.replace(/[^a-zA-Z0-9]/g,'-')}" value="${esc(entry.notes)}" />
        </div>
      </div>
      <div class="k-insight-edit-actions">
        <button class="kbtn kbtn-sm" onclick="Kpsc.closeActionItemEdit('${eid}')">Cancel</button>
        <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.submitActionItemEdit('${eid}','${esrc}','${emid}',this)">Save</button>
      </div>
    </div>`;
  const existing = document.getElementById(`k-ai-edit-${id.replace(/[^a-zA-Z0-9]/g,'-')}`);
  if (existing) { existing.remove(); return; }
  card.insertAdjacentHTML('beforeend', editHtml);
}

function closeActionItemEdit(encodedId) {
  const id = decodeURIComponent(encodedId);
  const el = document.getElementById(`k-ai-edit-${id.replace(/[^a-zA-Z0-9]/g,'-')}`);
  if (el) el.remove();
}

async function submitActionItemEdit(encodedId, source, encodedMeetingId, btn) {
  const id        = decodeURIComponent(encodedId);
  const meetingId = decodeURIComponent(encodedMeetingId || '');
  const safeId    = id.replace(/[^a-zA-Z0-9]/g,'-');
  const task      = document.getElementById(`k-ai-edit-task-${safeId}`)?.value.trim();
  const assignee  = document.getElementById(`k-ai-edit-asgn-${safeId}`)?.value || '';
  const dueDate   = document.getElementById(`k-ai-edit-due-${safeId}`)?.value  || '';
  const priority  = document.getElementById(`k-ai-edit-pri-${safeId}`)?.value  || 'medium';
  const notes     = document.getElementById(`k-ai-edit-notes-${safeId}`)?.value || '';
  if (!task) { showToast('Task cannot be empty.', 'warn'); return; }
  btn.disabled = true;
  try {
    if (source === 'meeting') {
      const meeting = (S.meetings || []).find(m => m.id === meetingId);
      if (!meeting) { showToast('Meeting not found.', 'error'); return; }
      const nextActions = (meeting.actionItems || []).map((a, idx) => {
        const aid = normalizeActionId(a, idx);
        return aid === id ? { ...a, id: aid, task, assignee, dueDate, priority, notes } : { ...a, id: aid };
      });
      const updated = await apiPut(`ai-secretary-meetings/${meetingId}`, { actionItems: nextActions });
      if (updated?.error) { showToast(updated.error, 'error'); return; }
      S.meetings = (S.meetings || []).map(m => m.id === meetingId ? updated : m);
    } else {
      const updated = await apiPut(`action-items/${id}`, { task, assignee, dueDate, priority, notes });
      if (updated?.error) { showToast(updated.error, 'error'); return; }
      S.actionItems = (S.actionItems || []).map(a => a.id === id ? updated : a);
    }
    showToast('Action item updated.', 'success');
    rerenderActionItemsList();
  } catch (e) {
    showToast('Failed to save edit.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Status update ──────────────────────────────────────────────────

async function updateActionItemStatusById(encodedId, source, encodedMeetingId, newStatus, selectEl) {
  if (!canEditInsightsActionStatus()) {
    showToast('Only chairman or secretary can update action status.', 'warn');
    if (selectEl) selectEl.value = selectEl.dataset.prior || 'pending';
    return;
  }
  const id        = decodeURIComponent(String(encodedId || ''));
  const meetingId = decodeURIComponent(String(encodedMeetingId || ''));
  const status    = String(newStatus || 'pending');
  let priorStatus = 'pending';
  if (selectEl) { priorStatus = selectEl.dataset.prior || selectEl.value; selectEl.disabled = true; }
  try {
    if (source === 'meeting') {
      const meeting = (S.meetings || []).find(m => m.id === meetingId);
      if (!meeting) { showToast('Meeting not found.', 'error'); return; }
      const nextActions = (meeting.actionItems || []).map((a, idx) => {
        const aid = normalizeActionId(a, idx);
        if (aid === id) priorStatus = a.status || 'pending';
        return aid === id ? { ...a, id: aid, status } : { ...a, id: aid };
      });
      const updated = await apiPut(`ai-secretary-meetings/${meetingId}`, { actionItems: nextActions });
      if (updated?.error) { if (selectEl) selectEl.value = priorStatus; showToast(updated.error, 'error'); return; }
      S.meetings = (S.meetings || []).map(m => m.id === meetingId ? updated : m);
    } else {
      const updated = await apiPut(`action-items/${id}`, { status });
      if (updated?.error) { if (selectEl) selectEl.value = priorStatus; showToast(updated.error, 'error'); return; }
      S.actionItems = (S.actionItems || []).map(a => a.id === id ? updated : a);
    }
    showToast('Status updated.', 'success');
    rerenderActionItemsList();
  } catch (e) {
    if (selectEl) selectEl.value = priorStatus;
    showToast('Could not update status.', 'error');
  } finally {
    if (selectEl) selectEl.disabled = false;
  }
}

async function toggleActionItemDone(encodedId, source, encodedMeetingId) {
  await updateActionItemStatusById(encodedId, source, encodedMeetingId, 'done', null);
}

async function deleteActionItemById(encodedId, source, encodedMeetingId) {
  const id        = decodeURIComponent(String(encodedId || ''));
  const meetingId = decodeURIComponent(String(encodedMeetingId || ''));
  if (!confirm('Delete this action item?')) return;
  try {
    if (source === 'meeting') {
      const meeting = (S.meetings || []).find(m => m.id === meetingId);
      if (!meeting) { showToast('Meeting not found.', 'error'); return; }
      const nextActions = (meeting.actionItems || [])
        .filter((a, idx) => normalizeActionId(a, idx) !== id)
        .map((a, idx) => ({ ...a, id: normalizeActionId(a, idx) }));
      const updated = await apiPut(`ai-secretary-meetings/${meetingId}`, { actionItems: nextActions });
      if (updated?.error) { showToast(updated.error, 'error'); return; }
      S.meetings = (S.meetings || []).map(m => m.id === meetingId ? updated : m);
    } else {
      const result = await apiDelete(`action-items/${id}`);
      if (result?.error) { showToast(result.error, 'error'); return; }
      S.actionItems = (S.actionItems || []).filter(a => a.id !== id);
    }
    S.actionItemsSelected = S.actionItemsSelected.filter(sid => sid !== id);
    showToast('Action item deleted.', 'success');
    rerenderActionItemsList();
  } catch (e) {
    showToast('Failed to delete action item.', 'error');
  }
}

// ── Bulk selection ─────────────────────────────────────────────────

function toggleActionItemCheck(id) {
  const idx = S.actionItemsSelected.indexOf(id);
  if (idx >= 0) S.actionItemsSelected.splice(idx, 1);
  else           S.actionItemsSelected.push(id);
  rerenderActionItemsBulkBar();
}

function rerenderActionItemsBulkBar() {
  const barEl = document.getElementById('k-ai-bulk-bar');
  if (!barEl) return;
  const n = S.actionItemsSelected.length;
  if (n === 0) { barEl.style.display = 'none'; return; }
  barEl.style.display = 'flex';
  barEl.querySelector('.k-ai-bulk-count').textContent = `${n} selected`;
}

async function bulkActionItemsAction(action, extra) {
  if (!S.actionItemsSelected.length) return;
  const all = buildActionItems(S.meetings, S.actionItems);
  const targets = all.filter(e => S.actionItemsSelected.includes(e.id));
  if (!targets.length) return;

  if (action === 'done' || action === 'status') {
    const newStatus = action === 'done' ? 'done' : (extra || 'pending');
    for (const entry of targets) {
      await updateActionItemStatusById(
        encodeURIComponent(entry.id), entry.source,
        encodeURIComponent(entry.meetingId || ''), newStatus, null
      );
    }
    S.actionItemsSelected = [];
    showToast(`${targets.length} item(s) updated.`, 'success');
    rerenderActionItemsList();
  } else if (action === 'delete') {
    if (!confirm(`Delete ${targets.length} selected item(s)?`)) return;
    for (const entry of targets) {
      await deleteActionItemById(
        encodeURIComponent(entry.id), entry.source,
        encodeURIComponent(entry.meetingId || '')
      );
    }
  }
}

// ── Export ─────────────────────────────────────────────────────────

function exportActionItemsCsv() {
  const all      = buildActionItems(S.meetings, S.actionItems);
  const filtered = sortActionItems(filterActionItems(all));
  const hdr = ['Task','Assignee','Due Date','Status','Priority','Meeting','Source','Created At'];
  const rows = filtered.map(e => [
    e.task, e.assignee, e.dueDate, e.status, e.priority,
    e.meetingTitle || '', e.source, (e.createdAt||'').slice(0,10),
  ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
  const csv = [hdr.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'kpsc-action-items.csv'; a.click();
  URL.revokeObjectURL(url);
}

function exportActionItemsMd() {
  const all      = buildActionItems(S.meetings, S.actionItems);
  const filtered = sortActionItems(filterActionItems(all));
  const lines = [`# KPSC Action Items — ${new Date().toLocaleDateString('en-NG',{dateStyle:'long'})}\n`];
  for (const e of filtered) {
    const due  = e.dueDate ? ` · Due: ${e.dueDate}` : '';
    const flag = e.isOverdue ? ' ⏰' : '';
    lines.push(`- [${e.status === 'done' ? 'x' : ' '}] **${e.task}** — ${e.assignee}${due}${flag}`);
  }
  navigator.clipboard?.writeText(lines.join('\n')).then(
    ()  => showToast('Copied to clipboard.', 'success'),
    ()  => showToast('Clipboard not available.', 'warn'),
  );
}

// ── WhatsApp notifications ─────────────────────────────────────────

function notifyAllPendingActionItems() {
  const all = buildActionItems(S.meetings, S.actionItems);
  const pending = all.filter(e => e.status !== 'done' && e.status !== 'cancelled');
  if (!pending.length) { showToast('No pending action items.', 'warn'); return; }
  const byAssignee = new Map();
  for (const e of pending) {
    if (!byAssignee.has(e.assignee)) byAssignee.set(e.assignee, []);
    byAssignee.get(e.assignee).push(e);
  }
  const lines = [`*KPSC Action Items — ${new Date().toLocaleDateString('en-NG',{dateStyle:'long'})}*\n`];
  for (const [assignee, items] of [...byAssignee.entries()].sort(([a],[b])=>a.localeCompare(b))) {
    lines.push(`\n*${assignee}:*`);
    items.forEach((e, i) => {
      const due = e.dueDate ? ` (due ${e.dueDate})` : '';
      const flag = e.isOverdue ? ' ⏰' : '';
      lines.push(`${i+1}. ${e.task}${due}${flag}`);
    });
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

// ── Empty state ────────────────────────────────────────────────────

function buildActionItemsEmptyState(all) {
  if (!all.length)
    return `<div class="k-empty-state"><p>No action items found. Meeting action items appear here automatically after processing. You can also create manual items with the button above.</p></div>`;
  const f = S.actionItemsFilter;
  if (f === 'overdue') return `<div class="k-empty-state"><p>No overdue items — great job! 🎉</p></div>`;
  if (f === 'my_tasks') return `<div class="k-empty-state"><p>No action items assigned to you.</p></div>`;
  return `<div class="k-empty-state"><p>No items match the current filters.</p></div>`;
}

// ── Main page renderer ─────────────────────────────────────────────

async function renderActionItems(main) {
  // Load standalone items if not yet loaded
  if (!S.actionItemsLoaded) {
    try {
      const res = await apiGet('action-items');
      S.actionItems = res.items || [];
      S.actionItemsLoaded = true;
    } catch (_) {
      S.actionItems = [];
      S.actionItemsLoaded = true;
    }
  }
  // Ensure meetings are loaded (may already be in S.meetings from Insights/Archive)
  if (!S.meetings?.length) {
    try {
      const res2 = await apiGet('ai-secretary-meetings');
      S.meetings = res2.meetings || res2 || [];
    } catch (_) {}
  }

  const all      = buildActionItems(S.meetings, S.actionItems);
  const filtered = sortActionItems(filterActionItems(all));
  const canEdit  = canEditInsightsActionStatus();

  const chips    = actionItemChipOptions();
  const counts   = chips.reduce((acc, c) => {
    acc[c.key] = c.key === 'all' ? all.length : filterActionItems(all, c.key).length;
    return acc;
  }, {});

  const yearVal  = S.actionItemsYear || '';
  const years    = [...new Set([new Date().getFullYear(), ...S.meetings.map(m => Number((m.meetingDate||'').slice(0,4))).filter(Boolean)])].sort((a,b)=>b-a);
  const yearOpts = `<option value="">All years</option>` + years.map(y => `<option value="${y}" ${Number(yearVal)===y?'selected':''}>${y}</option>`).join('');
  const monthOpts = `<option value="">All months</option>` + Array.from({length:12},(_,i) =>
    `<option value="${i+1}" ${Number(S.actionItemsMonth)===i+1?'selected':''}>${monthName(i+1)}</option>`
  ).join('');

  const assignees = [...new Set(all.map(e => e.assignee).filter(a => a && a !== 'Unassigned'))].sort();
  const assigneeOpts = `<option value="">All assignees</option>` + assignees.map(a =>
    `<option value="${esc(a)}" ${S.actionItemsAssignee===a?'selected':''}>${esc(a)}</option>`
  ).join('');

  const meetings = S.meetings.filter(m => (m.actionItems||[]).length > 0);
  const meetingOpts = `<option value="">All meetings</option>` + meetings.map(m =>
    `<option value="${esc(m.id)}" ${S.actionItemsMeeting===m.id?'selected':''}>${esc(m.title||m.meetingType||'Meeting')} — ${(m.meetingDate||'').slice(0,10)}</option>`
  ).join('');

  const priorityOpts = `<option value="">All priorities</option>` + ['urgent','high','medium','low'].map(p =>
    `<option value="${p}" ${S.actionItemsPriority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`
  ).join('');

  const total     = all.length;
  const countText = filtered.length === total
    ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`
    : `${filtered.length} of ${total} item${total !== 1 ? 's' : ''}`;

  const listHtml = !filtered.length
    ? buildActionItemsEmptyState(all)
    : S.actionItemsViewMode === 'by_assignee'
      ? renderActionItemsByAssignee(filtered)
      : S.actionItemsViewMode === 'by_meeting'
        ? renderActionItemsByMeeting(filtered)
        : filtered.map(renderActionItemCard).join('');

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>Action Items</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${canEdit ? `<button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.openActionItemCreateForm()">+ New Item</button>` : ''}
          <div class="k-ai-export-wrap">
            <button class="kbtn kbtn-sm" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">Export ▾</button>
            <div class="k-ai-export-menu" style="display:none">
              <button onclick="window.print()">🖨 Print</button>
              <button onclick="Kpsc.exportActionItemsMd()">📋 Copy as Markdown</button>
              <button onclick="Kpsc.exportActionItemsCsv()">⬇ Download CSV</button>
            </div>
          </div>
          <button class="kbtn kbtn-sm" onclick="Kpsc.notifyAllPendingActionItems()" title="Send WhatsApp summary of all pending items">📲 Notify All</button>
        </div>
      </div>
      <p class="k-page-hint">Track all committee action items from meetings and manual entries. Mark tasks done, reassign, and notify assignees via WhatsApp.</p>
      ${buildActionItemsStats(all)}
      <div class="k-insight-filters k-ai-filters">
        <select class="k-input k-input-sm" onchange="Kpsc.setActionItemsYear(this.value)">${yearOpts}</select>
        <select class="k-input k-input-sm" onchange="Kpsc.setActionItemsMonth(this.value)">${monthOpts}</select>
        <select class="k-input k-input-sm" onchange="Kpsc.setActionItemsAssignee(this.value)">${assigneeOpts}</select>
        <select class="k-input k-input-sm" onchange="Kpsc.setActionItemsMeeting(this.value)">${meetingOpts}</select>
        <select class="k-input k-input-sm" onchange="Kpsc.setActionItemsPriority(this.value)">${priorityOpts}</select>
        <input class="k-input k-input-sm" type="search" placeholder="Search task, assignee…" value="${esc(S.actionItemsSearch)}" oninput="Kpsc.setActionItemsSearch(this.value)" style="grid-column:1/-1" />
      </div>
      <div class="k-quick-filters" id="k-ai-chips" style="flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch">
        ${chips.map(c => {
          const cnt = counts[c.key] || 0;
          const warn = c.key === 'overdue' && cnt > 0 ? ' style="background:#991b1b;border-color:#991b1b;color:#fff"' : '';
          return `<button class="k-filter ${S.actionItemsFilter === c.key ? 'active' : ''}" onclick="Kpsc.setActionItemsFilter('${c.key}')"${warn}>${c.label} (${cnt})</button>`;
        }).join('')}
      </div>
      <div class="k-insight-count-row">
        <span id="k-ai-count-text">${countText}</span>
        <div class="k-insight-view-toggle">
          <button class="k-insight-view-btn ${S.actionItemsViewMode==='list'?'active':''}" onclick="Kpsc.setActionItemsViewMode('list')" title="List view">≡ List</button>
          <button class="k-insight-view-btn ${S.actionItemsViewMode==='by_assignee'?'active':''}" onclick="Kpsc.setActionItemsViewMode('by_assignee')" title="By assignee">👤 Assignee</button>
          <button class="k-insight-view-btn ${S.actionItemsViewMode==='by_meeting'?'active':''}" onclick="Kpsc.setActionItemsViewMode('by_meeting')" title="By meeting">📋 Meeting</button>
        </div>
      </div>
      <div class="k-ai-bulk-bar" id="k-ai-bulk-bar" style="display:none">
        <span class="k-ai-bulk-count">0 selected</span>
        <button class="kbtn kbtn-sm kbtn-success" onclick="Kpsc.bulkActionItemsAction('done')">✓ Mark Done</button>
        <select class="k-input k-input-sm" onchange="if(this.value)Kpsc.bulkActionItemsAction('status',this.value);this.value=''">
          <option value="">Set status…</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.bulkActionItemsAction('delete')">Delete</button>
        <button class="kbtn kbtn-sm" onclick="S.actionItemsSelected=[];Kpsc.rerenderActionItemsList()">✕ Clear</button>
      </div>
      <div id="k-ai-list-wrap">
        <div class="k-meeting-list" id="k-ai-list">${listHtml}</div>
      </div>
    </div>`;
}

function rerenderActionItemsList() {
  const listEl  = document.getElementById('k-ai-list');
  const countEl = document.getElementById('k-ai-count-text');
  const chipsEl = document.getElementById('k-ai-chips');
  if (!listEl) return;

  const all      = buildActionItems(S.meetings, S.actionItems);
  const filtered = sortActionItems(filterActionItems(all));
  const canEdit  = canEditInsightsActionStatus();

  if (listEl) listEl.innerHTML = !filtered.length
    ? buildActionItemsEmptyState(all)
    : S.actionItemsViewMode === 'by_assignee'
      ? renderActionItemsByAssignee(filtered)
      : S.actionItemsViewMode === 'by_meeting'
        ? renderActionItemsByMeeting(filtered)
        : filtered.map(renderActionItemCard).join('');

  if (countEl) {
    const total = all.length;
    countEl.textContent = filtered.length === total
      ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`
      : `${filtered.length} of ${total} item${total !== 1 ? 's' : ''}`;
  }

  if (chipsEl) {
    const chips = actionItemChipOptions();
    const counts = chips.reduce((acc, c) => {
      acc[c.key] = c.key === 'all' ? all.length : filterActionItems(all, c.key).length;
      return acc;
    }, {});
    chipsEl.innerHTML = chips.map(c => {
      const cnt = counts[c.key] || 0;
      const warn = c.key === 'overdue' && cnt > 0 ? ' style="background:#991b1b;border-color:#991b1b;color:#fff"' : '';
      return `<button class="k-filter ${S.actionItemsFilter === c.key ? 'active' : ''}" onclick="Kpsc.setActionItemsFilter('${c.key}')"${warn}>${c.label} (${cnt})</button>`;
    }).join('');
  }

  rerenderActionItemsBulkBar();
  // Also update the sub-tab badge
  const tabs = document.querySelectorAll('.ka-subtab');
  tabs.forEach(t => {
    if (t.textContent.includes('Action Items')) {
      const allItems = buildActionItems(S.meetings, S.actionItems);
      const overdueCount = allItems.filter(e => e.isOverdue).length;
      const badge = overdueCount ? ` <span class="k-ai-tab-badge">${overdueCount}</span>` : '';
      t.innerHTML = `Action Items${badge}`;
    }
  });
}

function _buildProgressRows(partners, month, year, nowYear, nowMonth) {
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  return partners.map(partner => {
    const monthsPaid = partnerPaymentsByPartner(partner.id, year).filter(p => p.paymentType === 'monthly_pledge').length;
    const pct = Math.round((monthsPaid / 12) * 100);
    const isCurrFuture = year > nowYear || (year === nowYear && month > nowMonth);
    const isCurrPreStart = isBeforePartnerStart(partner, month, year);
    const currentPaid = partnerMonthlyPaid(partner.id, month, year);
    const badgeClass = currentPaid ? 'badge-green' : (isCurrFuture || isCurrPreStart) ? 'badge-gray' : 'badge-amber';
    const badgeText = currentPaid ? '✓ Current' : isCurrFuture ? 'Future' : isCurrPreStart ? 'Not started' : 'Unpaid';
    const dotRow = months.map(m => {
      const isPaid = partnerMonthlyPaid(partner.id, m, year);
      const isFuture = year > nowYear || (year === nowYear && m > nowMonth);
      const isPreStart = isBeforePartnerStart(partner, m, year);
      const cls = isPaid ? 'k-dot-paid' : isPreStart ? 'k-dot-pre-start' : isFuture ? 'k-dot-future' : 'k-dot-unpaid';
      const label = isPaid ? 'Paid' : isPreStart ? 'Not started' : isFuture ? 'Future' : 'Unpaid';
      return `<span class="k-dot-cell ${cls}" title="${monthName(m)}: ${label}"></span>`;
    }).join('');
    return `
      <div class="k-meeting-card" style="cursor:default">
        <div class="k-mc-top">
          <div style="flex:1">
            <div class="k-mc-title">${esc(partner.fullName)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              <span class="kbadge badge-type">${esc(partnerTypeLabel(partner.partnershipType))}</span>
              <span class="kbadge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="k-dot-row" style="margin-top:8px">${dotRow}</div>
            <div class="k-progress-row">
              <div class="k-progress-bar-bg"><div class="k-progress-bar" style="width:${pct}%"></div></div>
              <span class="k-progress-label">${monthsPaid}/12 (${pct}%)</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

let _progressSearchTimer = null;

function _rerenderProgressRows() {
  const container = document.getElementById('k-progress-rows');
  if (!container) return;
  const year = S.reportsYear;
  const nowYear = currentYear();
  const nowMonth = currentMonth();
  const month = S.progressMonth || nowMonth;
  let partners = S.partners.filter(p => p.status === 'active');
  const q = (S.progressSearch || '').toLowerCase();
  if (q) partners = partners.filter(p => p.fullName.toLowerCase().includes(q));
  const isFutureMonth = year > nowYear || (year === nowYear && month > nowMonth);
  if (S.progressFilter === 'paid') {
    partners = partners.filter(p => partnerMonthlyPaid(p.id, month, year));
  } else if (S.progressFilter === 'unpaid') {
    partners = partners.filter(p => !partnerMonthlyPaid(p.id, month, year) && !isFutureMonth && !isBeforePartnerStart(p, month, year));
  } else if (S.progressFilter === 'future') {
    // Future takes priority over not-started when a month is both (matches the row badge,
    // which shows "Future" before "Not started") — keeps the two tabs from overlapping.
    partners = partners.filter(p => isFutureMonth && !partnerMonthlyPaid(p.id, month, year));
  } else if (S.progressFilter === 'not-started') {
    partners = partners.filter(p => !isFutureMonth && isBeforePartnerStart(p, month, year));
  }
  container.innerHTML = _buildProgressRows(partners, month, year, nowYear, nowMonth) || '<div class="k-empty">No partners match this filter.</div>';
  document.querySelectorAll('.k-progress-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === S.progressFilter));
}

async function renderPartnerProgress(main) {
  const year = S.reportsYear;
  await Promise.all([loadPartnerData(year), loadPendingCardPayments()]);
  const nowYear = currentYear();
  const nowMonth = currentMonth();
  const month = S.progressMonth || nowMonth;
  const yearOpts = [nowYear, nowYear-1, nowYear-2].map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('');
  const monthOpts = Array.from({length: 12}, (_, i) => {
    const m = i + 1;
    return `<option value="${m}" ${month===m?'selected':''}>${monthName(m)}</option>`;
  }).join('');

  const activePartners = S.partners.filter(p => p.status === 'active');
  const isFutureMonthStat = year > nowYear || (year === nowYear && month > nowMonth);
  const paidThisMonthPartners = activePartners.filter(p => partnerMonthlyPaid(p.id, month, year));
  const allPaidThisMonth = paidThisMonthPartners.length;
  // "Unpaid this month" must only count partners who have actually started their
  // partnership by this month and aren't just future-dated — not partners who
  // haven't started yet, who belong under "Not started" instead.
  const unpaidThisMonthPartners = activePartners.filter(p =>
    !partnerMonthlyPaid(p.id, month, year) && !isFutureMonthStat && !isBeforePartnerStart(p, month, year)
  );
  const allUnpaidThisMonth = unpaidThisMonthPartners.length;
  const unpaidAmountThisMonth = unpaidThisMonthPartners.reduce((sum, p) => sum + Number(p.monthlyPledge || 0), 0);
  const expectedMonthlyIncome = activePartners.reduce((sum, p) => sum + Number(p.monthlyPledge || 0), 0);

  // Paid amount this month (sum of actual payments recorded for monthly_pledge in current month)
  const allPayments = S.partnerPayments || [];
  const paidAmountThisMonth = allPayments
    .filter(pmt => pmt.paymentType === 'monthly_pledge' && pmt.month === month && pmt.year === year)
    .reduce((sum, pmt) => sum + Number(pmt.amount || 0), 0);

  // Income breakdown by partnership type
  const typeBreakdown = {};
  activePartners.forEach(p => {
    const t = p.partnershipType || 'other';
    if (!typeBreakdown[t]) typeBreakdown[t] = { count: 0, expected: 0 };
    typeBreakdown[t].count++;
    typeBreakdown[t].expected += Number(p.monthlyPledge || 0);
  });
  const typeBreakdownHtml = Object.entries(typeBreakdown).map(([type, info]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <span class="kbadge badge-type" style="font-size:11px">${esc(partnerTypeLabel(type))}</span>
        <span style="font-size:12px;color:var(--text3);margin-left:6px">${info.count} partner${info.count !== 1 ? 's' : ''}</span>
      </div>
      <span style="font-weight:700;color:var(--navy)">₦${info.expected.toLocaleString('en-NG')}<span style="font-size:11px;font-weight:400;color:var(--text3)">/mo</span></span>
    </div>`).join('') || '<div class="k-empty" style="padding:12px 0">No active partners.</div>';

  // Apply search + filter for initial render
  let displayPartners = [...activePartners];
  const q = (S.progressSearch || '').toLowerCase();
  if (q) displayPartners = displayPartners.filter(p => p.fullName.toLowerCase().includes(q));
  const isFutureMonth = year > nowYear || (year === nowYear && month > nowMonth);
  if (S.progressFilter === 'paid') {
    displayPartners = displayPartners.filter(p => partnerMonthlyPaid(p.id, month, year));
  } else if (S.progressFilter === 'unpaid') {
    displayPartners = displayPartners.filter(p => !partnerMonthlyPaid(p.id, month, year) && !isFutureMonth && !isBeforePartnerStart(p, month, year));
  } else if (S.progressFilter === 'future') {
    displayPartners = displayPartners.filter(p => isFutureMonth && !partnerMonthlyPaid(p.id, month, year));
  } else if (S.progressFilter === 'not-started') {
    displayPartners = displayPartners.filter(p => !isFutureMonth && isBeforePartnerStart(p, month, year));
  }

  const pf = S.progressFilter || 'all';
  const progressRows = _buildProgressRows(displayPartners, month, year, nowYear, nowMonth);

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>Partner Progress Report</h2>
        <div style="display:flex;gap:6px">
          <select class="k-input k-input-sm" style="width:auto" onchange="Kpsc.setProgressMonth(this.value)">${monthOpts}</select>
          <select class="k-input k-input-sm" style="width:auto" onchange="Kpsc.setReportsYear(this.value)">${yearOpts}</select>
        </div>
      </div>
      <p class="k-page-hint">Progress view — pledge amounts are private and not shown here.</p>
      ${renderPendingCardBanner()}
      <div class="k-dash-stats">
        <div class="k-stat"><div class="k-stat-val">${activePartners.length}</div><div class="k-stat-lbl">Active Partners</div></div>
        <div class="k-stat">
          <div class="k-stat-val">${allPaidThisMonth}</div>
          <div class="k-stat-lbl">Paid This Month</div>
          ${paidAmountThisMonth > 0 ? `<div style="font-size:12px;font-weight:600;color:var(--green);margin-top:3px">₦${paidAmountThisMonth.toLocaleString('en-NG')} received</div>` : ''}
        </div>
        <div class="k-stat k-stat-highlight">
          <div class="k-stat-val">${allUnpaidThisMonth}</div>
          <div class="k-stat-lbl">Unpaid This Month</div>
          ${unpaidAmountThisMonth > 0 ? `<div style="font-size:12px;font-weight:600;color:var(--amber);margin-top:3px">₦${unpaidAmountThisMonth.toLocaleString('en-NG')} outstanding</div>` : ''}
        </div>
        <div class="k-stat"><div class="k-stat-val">₦${expectedMonthlyIncome.toLocaleString('en-NG')}</div><div class="k-stat-lbl">Expected Monthly Income</div></div>
      </div>
      <div class="k-section" style="margin-top:16px">
        <h3 class="k-sec-title" style="margin-bottom:10px">📊 Expected Monthly Income by Partnership Type</h3>
        ${typeBreakdownHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;margin-top:4px;font-weight:700">
          <span>Total</span>
          <span style="color:var(--navy)">₦${expectedMonthlyIncome.toLocaleString('en-NG')}/mo</span>
        </div>
      </div>
      <div class="k-progress-filter" id="k-progress-filter-bar">
        <button class="k-progress-filter-btn ${pf==='all'?'active':''}" data-filter="all" onclick="Kpsc.setProgressFilter('all')">All</button>
        <button class="k-progress-filter-btn k-pf-paid ${pf==='paid'?'active':''}" data-filter="paid" onclick="Kpsc.setProgressFilter('paid')"><span class="k-dot-cell k-dot-paid" style="width:10px;height:10px;flex-shrink:0"></span>Paid</button>
        <button class="k-progress-filter-btn k-pf-unpaid ${pf==='unpaid'?'active':''}" data-filter="unpaid" onclick="Kpsc.setProgressFilter('unpaid')"><span class="k-dot-cell k-dot-unpaid" style="width:10px;height:10px;flex-shrink:0"></span>Unpaid</button>
        <button class="k-progress-filter-btn k-pf-future ${pf==='future'?'active':''}" data-filter="future" onclick="Kpsc.setProgressFilter('future')"><span class="k-dot-cell k-dot-future" style="width:10px;height:10px;flex-shrink:0"></span>Future</button>
        <button class="k-progress-filter-btn k-pf-pre-start ${pf==='not-started'?'active':''}" data-filter="not-started" onclick="Kpsc.setProgressFilter('not-started')"><span class="k-dot-cell k-dot-pre-start" style="width:10px;height:10px;flex-shrink:0"></span>Not started</button>
      </div>
      <div class="k-dot-legend">
        <span><span class="k-dot-cell k-dot-paid"></span>Paid</span>
        <span><span class="k-dot-cell k-dot-unpaid"></span>Unpaid</span>
        <span><span class="k-dot-cell k-dot-future"></span>Future</span>
        <span><span class="k-dot-cell k-dot-pre-start"></span>Not started</span>
      </div>
      <input class="k-input" type="search" placeholder="🔍 Search by name…"
        value="${esc(S.progressSearch || '')}" oninput="Kpsc.setProgressSearch(this.value)" style="margin-bottom:12px" />
      <div id="k-progress-rows" class="k-meeting-list">${progressRows || '<div class="k-empty">No active partners available.</div>'}</div>
    </div>`;
}

let _insightsSearchTimer = null;

function setReportsYear(year) {
  S.reportsYear = Number(year) || currentYear();
  if (S.page === 'partner-progress') {
    renderPage('partner-progress');
    return;
  }
  rerenderInsightsList();
}

function setProgressMonth(month) {
  S.progressMonth = Number(month) || currentMonth();
  renderPage('partner-progress');
}

function setProgressFilter(filter) {
  S.progressFilter = String(filter || 'all');
  _rerenderProgressRows();
}

function setProgressSearch(search) {
  S.progressSearch = search || '';
  clearTimeout(_progressSearchTimer);
  _progressSearchTimer = setTimeout(_rerenderProgressRows, 250);
}

function setReportsMonth(month) {
  S.reportsMonth = Number(month) || 0;
  rerenderInsightsList();
}

function setReportsFilter(filter) {
  S.reportsFilter = String(filter || 'all');
  rerenderInsightsList();
}

function setReportsSearch(search) {
  S.reportsSearch = search || '';
  clearTimeout(_insightsSearchTimer);
  _insightsSearchTimer = setTimeout(() => rerenderInsightsList(), 250);
}

async function updateReportActionStatus(meetingId, actionId, status, selectEl) {
  const decodedMeetingId = decodeURIComponent(String(meetingId || ''));
  const decodedActionId = decodeURIComponent(String(actionId || ''));
  if (!canEditInsightsActionStatus()) {
    showToast('Only chairman or secretary can update action status.', 'warn');
    return;
  }
  const meeting = (S.meetings || []).find(item => item.id === decodedMeetingId);
  if (!meeting) {
    showToast('Meeting not found. Refresh and try again.', 'error');
    return;
  }
  const nextStatus = String(status || 'pending').trim();
  let priorStatus = 'pending';
  const nextActions = (meeting.actionItems || []).map((action, idx) => {
    const normalizedId = normalizeActionId(action, idx);
    if (normalizedId === decodedActionId) priorStatus = action?.status || 'pending';
    return normalizedId === decodedActionId
      ? { ...action, id: normalizedId, status: nextStatus }
      : { ...action, id: normalizedId };
  });
  if (selectEl) selectEl.disabled = true;
  try {
    const updated = await apiPut(`ai-secretary-meetings/${decodedMeetingId}`, { actionItems: nextActions });
    if (updated?.error) {
      if (selectEl) selectEl.value = priorStatus;
      showToast(updated.error, 'error');
      return;
    }
    S.meetings = (S.meetings || []).map(item => item.id === decodedMeetingId ? updated : item);
    showToast('Action status updated.', 'success');
    // Re-render in place — no API call, no scroll-to-top.
    rerenderInsightsList();
  } catch (err) {
    console.error('Failed to update action status', err);
    if (selectEl) selectEl.value = priorStatus;
    showToast('Could not update action status.', 'error');
  } finally {
    if (selectEl) selectEl.disabled = false;
  }
}


// ── NEW INSIGHTS FILTER SETTERS ────────────────────────────────────

function setReportsAssignee(name) {
  S.reportsAssignee = name || '';
  rerenderInsightsList();
}

function setReportsApproval(approval) {
  S.reportsApproval = approval || 'all';
  rerenderInsightsList();
}

function setInsightsViewMode(mode) {
  S.insightsViewMode = mode || 'list';
  rerenderInsightsList();
}

// ── GROUPED VIEW RENDERERS ──────────────────────────────────────────

function renderInsightsByMeeting(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.meetingId)) {
      groups.set(entry.meetingId, { title: entry.meetingTitle, date: entry.meetingDate, type: entry.meetingType || '', items: [] });
    }
    groups.get(entry.meetingId).items.push(entry);
  }
  if (!groups.size) return '';
  return [...groups.entries()].map(([, g]) => `
    <div class="k-insight-group">
      <div class="k-insight-group-hdr">
        <div>
          <div class="k-insight-group-hdr-title">${esc(g.title)}</div>
          <div class="k-insight-group-hdr-meta">${esc(fmtDate(g.date) || g.date)}${g.type ? ' · ' + esc(g.type) : ''}</div>
        </div>
        <span class="k-insight-group-hdr-count">${g.items.length}</span>
      </div>
      <div class="k-insight-group-cards">${g.items.map(renderMeetingInsightCard).join('')}</div>
    </div>`).join('');
}

function renderInsightsByAssignee(entries) {
  const actionItems = entries.filter(e => e.kind === 'action_item');
  const others = entries.filter(e => e.kind !== 'action_item');
  const groups = new Map();
  for (const entry of actionItems) {
    const key = entry.assignee || 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const assigneeHtml = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([assignee, items]) => `
      <div class="k-insight-group">
        <div class="k-insight-group-hdr">
          <div>
            <div class="k-insight-group-hdr-title">👤 ${esc(assignee)}</div>
            <div class="k-insight-group-hdr-meta">${items.filter(i => i.status !== 'done' && i.status !== 'cancelled').length} open · ${items.filter(i => i.status === 'done').length} done</div>
          </div>
          <span class="k-insight-group-hdr-count">${items.length}</span>
        </div>
        <div class="k-insight-group-cards">${items.map(renderMeetingInsightCard).join('')}</div>
      </div>`).join('');
  const othersHtml = others.length ? `
    <div class="k-insight-group">
      <div class="k-insight-group-hdr">
        <div><div class="k-insight-group-hdr-title">Other items</div><div class="k-insight-group-hdr-meta">Resolutions, flags, suggestions</div></div>
        <span class="k-insight-group-hdr-count">${others.length}</span>
      </div>
      <div class="k-insight-group-cards">${others.map(renderMeetingInsightCard).join('')}</div>
    </div>` : '';
  return assigneeHtml + othersHtml;
}

// ── AI DIGEST PANEL ─────────────────────────────────────────────────

function buildInsightsDigest(meetings) {
  const year = Number(S.reportsYear) || currentYear();
  const month = Number(S.reportsMonth) || 0;
  const relevant = (meetings || []).filter(m => {
    if (!m.summaryShort || m.status !== 'processed') return false;
    const stamp = String(m.meetingDate || '');
    if (year && !stamp.startsWith(String(year))) return false;
    if (month && Number(stamp.slice(5, 7)) !== month) return false;
    return true;
  });
  if (!relevant.length) return '';
  const snippets = relevant.slice(0, 5).map(m => `
    <li>
      <span style="color:var(--text3);flex-shrink:0;font-size:11px">${esc(fmtDate(m.meetingDate) || m.meetingDate)}</span>
      <span>${esc(m.summaryShort)}</span>
    </li>`).join('');
  const more = relevant.length > 5 ? `<li style="color:var(--text3);font-size:12px">…and ${relevant.length - 5} more meeting${relevant.length - 5 !== 1 ? 's' : ''}</li>` : '';
  const openAttr = S.insightsDigestOpen ? 'open' : '';
  return `
    <details class="k-collapsible k-insight-digest" id="k-insights-digest" ${openAttr} ontoggle="Kpsc.toggleInsightsDigest(this.open)">
      <summary class="k-collapsible-hdr">
        <span class="k-collapsible-title">✨ AI Period Summary</span>
        <span class="k-collapsible-summary">${relevant.length} meeting${relevant.length !== 1 ? 's' : ''} · click to expand</span>
      </summary>
      <div class="k-insight-digest-body">
        <ul class="k-insight-digest-list">${snippets}${more}</ul>
      </div>
    </details>`;
}

function toggleInsightsDigest(open) {
  S.insightsDigestOpen = !!open;
}

// ── INLINE ACTION ITEM EDITING ──────────────────────────────────────

function toggleInsightEdit(entryId, meetingIdEncoded, actionIdEncoded) {
  const safeId = String(entryId || '').replace(/[^a-z0-9]/gi, '_');
  const formEl = document.getElementById(`k-ie-form-${safeId}`);
  if (!formEl) return;
  if (formEl.style.display !== 'none') {
    formEl.style.display = 'none';
    return;
  }
  // Find the current action item entry from live data
  const allEntries = buildMeetingInsights(S.meetings);
  const entry = allEntries.find(e => e.id === entryId);
  if (!entry) return;
  formEl.style.display = 'block';
  formEl.innerHTML = `
    <div class="k-insight-edit-form">
      <div>
        <div class="k-insight-edit-lbl">Task description</div>
        <textarea class="k-input k-input-sm" id="k-ie-task-${safeId}" rows="2" style="resize:vertical">${esc(entry.text)}</textarea>
      </div>
      <div class="k-insight-edit-row">
        <div>
          <div class="k-insight-edit-lbl">Assignee</div>
          <input class="k-input k-input-sm" id="k-ie-assignee-${safeId}" type="text" value="${esc(entry.assignee || '')}" placeholder="Full name" />
        </div>
        <div>
          <div class="k-insight-edit-lbl">Due date</div>
          <input class="k-input k-input-sm" id="k-ie-due-${safeId}" type="date" value="${esc(entry.dueDate || '')}" />
        </div>
      </div>
      <div class="k-insight-edit-actions">
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.toggleInsightEdit('${esc(entryId)}','','')">Cancel</button>
        <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.saveInsightActionEdit('${esc(entryId)}','${meetingIdEncoded}','${actionIdEncoded}',this)">Save changes</button>
      </div>
    </div>`;
}

async function saveInsightActionEdit(entryId, meetingIdEncoded, actionIdEncoded, btn) {
  const safeId = String(entryId || '').replace(/[^a-z0-9]/gi, '_');
  const decodedMeetingId = decodeURIComponent(String(meetingIdEncoded || ''));
  const decodedActionId = decodeURIComponent(String(actionIdEncoded || ''));
  const taskEl = document.getElementById(`k-ie-task-${safeId}`);
  const assigneeEl = document.getElementById(`k-ie-assignee-${safeId}`);
  const dueEl = document.getElementById(`k-ie-due-${safeId}`);
  const task = (taskEl?.value || '').trim();
  const assignee = (assigneeEl?.value || '').trim() || 'Unassigned';
  const dueDate = (dueEl?.value || '').trim();
  if (!task) { showToast('Task description cannot be empty.', 'warn'); return; }
  const meeting = (S.meetings || []).find(m => m.id === decodedMeetingId);
  if (!meeting) { showToast('Meeting not found. Refresh and try again.', 'error'); return; }
  const nextActions = (meeting.actionItems || []).map((action, idx) => {
    const normId = normalizeActionId(action, idx);
    return normId === decodedActionId
      ? { ...action, id: normId, task, assignee, dueDate }
      : { ...action, id: normId };
  });
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const updated = await apiPut(`ai-secretary-meetings/${decodedMeetingId}`, { actionItems: nextActions });
    if (updated?.error) { showToast(updated.error, 'error'); return; }
    S.meetings = (S.meetings || []).map(m => m.id === decodedMeetingId ? updated : m);
    showToast('Action item updated.', 'success');
    rerenderInsightsList();
  } catch {
    showToast('Could not save changes.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
  }
}

// ── PRINT INSIGHTS REPORT ───────────────────────────────────────────

function printInsightsReport() {
  const allEntries = buildMeetingInsights(S.meetings);
  const filtered = filterMeetingInsights(allEntries);
  const yearLabel = S.reportsYear || currentYear();
  const monthLabel = S.reportsMonth ? monthName(S.reportsMonth) : 'All months';
  const catLabel = (reportsCategoryOptions().find(c => c.key === S.reportsFilter) || { label: 'All items' }).label;
  const rows = filtered.map(e => {
    if (e.kind === 'policy_flag') return `<tr><td>${esc(fmtDate(e.meetingDate)||e.meetingDate)}</td><td>${esc(e.meetingTitle)}</td><td>🚩 ${esc(e.flagType||'')}</td><td>${esc(e.text)}</td><td>${esc(e.severity)}</td></tr>`;
    if (e.kind === 'suggested_project') return `<tr><td>${esc(fmtDate(e.meetingDate)||e.meetingDate)}</td><td>${esc(e.meetingTitle)}</td><td>💡 Project suggestion</td><td>${esc(e.projectTitle||e.text)}</td><td>—</td></tr>`;
    if (e.kind === 'action_item') return `<tr><td>${esc(fmtDate(e.meetingDate)||e.meetingDate)}</td><td>${esc(e.meetingTitle)}</td><td>${esc(e.assignee)}</td><td>${esc(e.text)}</td><td>${esc(e.status.replace(/_/g,' '))}${e.dueDate?' · '+esc(e.dueDate):''}</td></tr>`;
    return `<tr><td>${esc(fmtDate(e.meetingDate)||e.meetingDate)}</td><td>${esc(e.meetingTitle)}</td><td>${esc((e.resolutionType||'').replace(/_/g,' '))}</td><td>${esc(e.text)}</td><td>${esc(e.approval||'')}${e.amount?' · '+esc(formatResolutionAmount(e.amount)):''}</td></tr>`;
  }).join('');
  const win = window.open('', '_blank');
  if (!win) { showToast('Pop-up blocked. Allow pop-ups to print.', 'warn'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>KPSC Insights Report</title>
  <style>body{font-family:system-ui,sans-serif;font-size:13px;color:#111;padding:24px 32px}h1{font-size:18px;margin:0 0 4px}p{color:#555;margin:0 0 16px}table{width:100%;border-collapse:collapse}th{background:#1e3a5f;color:#fff;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px}td{padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top}tr:last-child td{border-bottom:none}@media print{@page{margin:2cm}}</style>
  </head><body>
  <h1>RCCG Kingdom Parish — AI Meeting Insights</h1>
  <p>Period: ${esc(String(yearLabel))} / ${esc(monthLabel)} · Filter: ${esc(catLabel)} · ${filtered.length} item${filtered.length!==1?'s':''} · Printed ${new Date().toLocaleDateString('en-NG',{dateStyle:'long'})}</p>
  <table><thead><tr><th>Date</th><th>Meeting</th><th>Type / Assignee</th><th>Item</th><th>Status / Outcome</th></tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}

// ── WHATSAPP SHARE ACTIONS ──────────────────────────────────────────

function shareInsightActions() {
  const allEntries = buildMeetingInsights(S.meetings);
  const actionEntries = filterMeetingInsights(allEntries).filter(e => e.kind === 'action_item' && e.status !== 'done' && e.status !== 'cancelled');
  if (!actionEntries.length) { showToast('No pending action items to share.', 'warn'); return; }
  const byAssignee = new Map();
  for (const e of actionEntries) {
    if (!byAssignee.has(e.assignee)) byAssignee.set(e.assignee, []);
    byAssignee.get(e.assignee).push(e);
  }
  const lines = [`*KPSC Action Items — ${new Date().toLocaleDateString('en-NG',{dateStyle:'long'})}*\n`];
  for (const [assignee, items] of [...byAssignee.entries()].sort(([a],[b])=>a.localeCompare(b))) {
    lines.push(`\n*${assignee}:*`);
    items.forEach((e, i) => {
      const due = e.dueDate ? ` (due ${e.dueDate})` : '';
      lines.push(`${i+1}. ${e.text}${due}`);
    });
  }
  const msg = lines.join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// ───────────────────────────────────────────────────────────────────

function archiveQuickFilters() {
  return [
    { key: 'all', label: 'All' },
    { key: 'welfare', label: 'Welfare' },
    { key: 'financial', label: 'Financial approvals' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'deferred', label: 'Needs confirmation' },
    { key: 'unassigned', label: 'Unassigned actions' },
    { key: 'missing_deadline', label: 'Missing deadlines' },
    { key: 'policy_flags', label: 'Policy flags' },
  ];
}

function meetingMatchesQuickFilter(m, filter) {
  if (!filter || filter === 'all') return true;
  const resolutions = m.resolutions || [];
  const actions = m.actionItems || [];
  const flags = m.policyFlags || [];
  if (filter === 'welfare') return resolutions.some(r => r.category === 'welfare') || /welfare|benevolence|assistance/i.test(`${m.transcriptText || ''} ${m.minutesMarkdown || ''}`);
  if (filter === 'financial') return resolutions.some(r => r.resolutionType === 'financial_approval' || r.category === 'financial' || r.amount);
  if (filter === 'rejected') return resolutions.some(r => r.approved === false || r.resolutionType === 'rejection');
  if (filter === 'deferred') return resolutions.some(r => r.approved === null || r.approved === undefined);
  if (filter === 'unassigned') return actions.some(a => !a.assignee || /^unassigned$/i.test(a.assignee));
  if (filter === 'missing_deadline') return actions.some(a => !a.dueDate);
  if (filter === 'policy_flags') return flags.length > 0;
  return true;
}

function setArchiveQuickFilter(filter) {
  S.archiveQuickFilter = filter || 'all';
  const el = document.getElementById('k-archive-list');
  if (el) el.innerHTML = archiveList(S.meetings, S.archiveSearch);
  document.querySelectorAll('.k-filter').forEach(btn => btn.classList.remove('active'));
  const active = [...document.querySelectorAll('.k-filter')].find(btn => btn.getAttribute('onclick')?.includes(`'${S.archiveQuickFilter}'`));
  active?.classList.add('active');
}

async function renderArchive(main) {
  meetingListOffset = 0;
  const res = await apiGet(`ai-secretary-meetings?limit=${MEETING_PAGE_SIZE}&offset=0`);
  // Guard: backend may return flat array (before pagination support) or { items, total, limit, offset }
  const items = Array.isArray(res) ? res : (res.items || res.meetings || res || []);
  const total = typeof res?.total === 'number' ? res.total : items.length;
  S.meetings = items;
  S._archiveTotal = total;
  main.innerHTML = `
    <div class="k-page">
      <div class="k-search-bar">
        <input class="k-input" type="search" id="k-archive-search" placeholder="Search title, date, transcript, resolutions, actions…"
          value="${esc(S.archiveSearch)}" oninput="Kpsc.filterArchive(this.value)" />
      </div>
      <div class="k-quick-filters">
        ${archiveQuickFilters().map(f => `<button class="k-filter ${S.archiveQuickFilter === f.key ? 'active' : ''}" onclick="Kpsc.setArchiveQuickFilter('${f.key}')">${f.label}</button>`).join('')}
      </div>
      <div id="k-archive-list">${archiveList(S.meetings, S.archiveSearch)}</div>
      ${meetingListOffset + items.length < total ? `<div id="k-archive-loadmore" style="text-align:center;margin-top:16px"><button class="kbtn kbtn-ghost" onclick="Kpsc.loadMoreMeetings()">Load more</button></div>` : ''}
    </div>`;
}

async function loadMoreMeetings() {
  meetingListOffset += MEETING_PAGE_SIZE;
  const btn = document.querySelector('#k-archive-loadmore button');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  try {
    const res = await apiGet(`ai-secretary-meetings?limit=${MEETING_PAGE_SIZE}&offset=${meetingListOffset}`);
    const items = Array.isArray(res) ? res : (res.items || res.meetings || res || []);
    const total = typeof res?.total === 'number' ? res.total : (S._archiveTotal || 0);
    S.meetings = [...S.meetings, ...items];
    S._archiveTotal = total;
    const listEl = document.getElementById('k-archive-list');
    if (listEl) listEl.innerHTML = archiveList(S.meetings, S.archiveSearch);
    const loadMoreEl = document.getElementById('k-archive-loadmore');
    if (loadMoreEl) {
      if (meetingListOffset + items.length < total) {
        loadMoreEl.innerHTML = `<button class="kbtn kbtn-ghost" onclick="Kpsc.loadMoreMeetings()">Load more</button>`;
      } else {
        loadMoreEl.remove();
      }
    }
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = 'Load more'; }
    showToast('Failed to load more meetings. Check your connection.', 'error');
  }
}

function filterArchive(q) {
  S.archiveSearch = q;
  const el = document.getElementById('k-archive-list');
  if (el) el.innerHTML = archiveList(S.meetings, q);
}

function archiveList(meetings, q) {
  const lq = (q || '').toLowerCase();
  const quickFiltered = meetings.filter(m => meetingMatchesQuickFilter(m, S.archiveQuickFilter));
  const filtered = lq
    ? quickFiltered.filter(m => {
        const searchable = [
          m.title,
          m.meetingDate,
          m.meetingType,
          m.status,
          m.transcriptText,
          m.summaryShort,
          m.summaryLong,
          m.minutesMarkdown,
          ...(m.resolutions || []).flatMap(r => [r.text, r.category, r.resolutionType, r.voteSummary, r.amount]),
          ...(m.actionItems || []).flatMap(a => [a.task, a.assignee, a.dueDate, a.status]),
          ...(m.policyFlags || []).flatMap(f => [f.type, f.severity, f.message]),
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(lq);
      })
    : quickFiltered;
  const sorted = [...filtered].sort((a, b) => (b.meetingDate || '').localeCompare(a.meetingDate || ''));
  if (sorted.length === 0) return `<div class="k-empty">No meetings found.</div>`;
  return `<div class="k-meeting-list">${sorted.map(m => meetingCard(m)).join('')}</div>`;
}

// ── SETTINGS ──────────────────────────────────────────────────────

function apiStatusPill(status) {
  if (!status || status.error) return '<span class="k-api-pill k-api-unknown">Check failed</span>';
  if (status.active || status.configured) return '<span class="k-api-pill k-api-active">Active</span>';
  return '<span class="k-api-pill k-api-missing">Not set</span>';
}

function renderApiStatusCard(apiStatus) {
  const live = apiStatus?.liveTranscription || {};
  const dg = apiStatus?.diarization || {};
  const voiceFp = apiStatus?.speakerRecognition || {};
  return `
    <div class="k-api-status-card ${live.active ? 'k-api-card-active' : 'k-api-card-missing'}">
      <div class="k-api-status-head">
        <div>
          <div class="k-api-title">Live Transcription API Status</div>
          <div class="k-api-sub">Server-side check from Cloudflare environment variables.</div>
        </div>
        ${apiStatusPill(live)}
      </div>
      <div class="k-api-status-grid">
        <div class="k-api-status-row">
          <span class="k-api-label">OpenAI transcription</span>
          <span>${apiStatusPill(live)} <code>${esc(live.keyName || 'OPENAI_API_KEY')}</code> ${live.masked ? `<small>${esc(live.masked)}</small>` : ''}</span>
        </div>
        <div class="k-api-status-row">
          <span class="k-api-label">Model</span>
          <span><code>${esc(live.model || 'gpt-4o-transcribe')}</code></span>
        </div>
        <div class="k-api-status-row">
          <span class="k-api-label">Speaker diarization</span>
          <span>${apiStatusPill(dg)} <code>${esc(dg.keyName || 'DEEPGRAM_API_KEY')}</code></span>
        </div>
        <div class="k-api-status-row">
          <span class="k-api-label">Voice fingerprinting</span>
          <span>${apiStatusPill(voiceFp)} <code>${esc(voiceFp.keyName || 'VOICE_FP_TOKEN')}</code> ${voiceFp.url ? `<small>${esc(voiceFp.url)}</small>` : '<small>not configured</small>'}</span>
        </div>
      </div>
      <p class="k-api-message">${esc(live.message || apiStatus?.error || 'Status unavailable.')}</p>
      <button class="kbtn kbtn-sm" onclick="Kpsc.refreshApiStatus(this)">Refresh API Status</button>
    </div>`;
}

async function refreshApiStatus(btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking…';
  const panel = document.getElementById('k-api-status-panel');
  try {
    const status = await apiGet('settings/api-status');
    if (panel) panel.innerHTML = renderApiStatusCard(status);
    showToast(status?.liveTranscription?.active ? 'OpenAI transcription key is active.' : 'OpenAI transcription key is missing.', status?.liveTranscription?.active ? 'success' : 'warn');
  } catch {
    showToast('Could not check API status.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function renderKpscAccountsCard(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  return `
    <div class="k-card" style="margin-bottom:16px">
      <h2 class="k-card-title">KPSC Login Accounts</h2>
      <p class="k-card-sub">Dedicated KPSC authentication (separate from Finance/Admin users). Members select name from dropdown and use PIN.</p>
      <div class="k-meeting-list">
        ${list.length ? list.map(a => `
          <div class="k-meeting-card">
            <div class="k-mc-top">
              <div>
                <div class="k-mc-title">${esc(a.name)}</div>
                <div class="k-mc-meta">
                  <span>${esc(roleLabel(a.role))}</span>
                  <span>${a.status === 'active' ? 'Active' : 'Inactive'}</span>
                  <span>${a.mustChangePin ? 'Must change PIN' : 'PIN set'}</span>
                </div>
              </div>
              <div class="k-mc-badges">
                <button class="kbtn kbtn-sm" onclick="Kpsc.openAccountEditor('${a.id}')">Edit</button>
                ${['acting_chairman','it_admin'].includes(String(S.user?.role || '')) ? `<button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.confirmDeleteKpscAccount('${a.id}','${esc(a.name)}')">Delete</button>` : ''}
              </div>
            </div>
          </div>`).join('') : '<div class="k-empty">No KPSC accounts found.</div>'}
      </div>
      <div class="k-room-actions" style="margin-top:10px">
        <button class="kbtn kbtn-primary" onclick="Kpsc.openAccountEditor('')">+ Add Account</button>
      </div>
    </div>`;
}

async function openAccountEditor(id) {
  const existing = (S.accounts || []).find(a => a.id === id);
  document.getElementById('kpsc-account-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'kpsc-account-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr"><span class="k-modal-title">${existing ? 'Edit KPSC Account' : 'New KPSC Account'}</span><button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closeAccountEditor()">✕</button></div>
      <div class="k-modal-body">
        <label class="k-label">Name</label>
        <input id="ka-name" class="k-input" value="${esc(existing?.name || '')}" />
        <label class="k-label">Role</label>
        <select id="ka-role" class="k-input">
          ${['acting_chairman','general_secretary','financial_secretary','treasurer','committee_viewer','it_admin'].map(role => `<option value="${role}" ${existing?.role === role ? 'selected' : ''}>${esc(roleLabel(role))}</option>`).join('')}
        </select>
        <label class="k-label">Status</label>
        <select id="ka-status" class="k-input">
          <option value="active" ${(existing?.status || 'active') === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${(existing?.status || '') === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
        <label class="k-label">${existing ? 'Reset PIN (optional)' : 'Default PIN'}</label>
        <input id="ka-pin" class="k-input" maxlength="6" inputmode="numeric" placeholder="4-6 digits" />
        <label class="k-label" style="display:flex;gap:8px;align-items:center">
          <input id="ka-must-change" type="checkbox" ${existing?.mustChangePin !== false ? 'checked' : ''} />
          Force PIN change at next login
        </label>
      </div>
      <div class="k-modal-footer"><button class="kbtn kbtn-primary" onclick="Kpsc.saveAccountEditor('${existing?.id || ''}', this)">Save Account</button></div>
    </div>`;
  document.body.appendChild(modal);
}

function closeAccountEditor() {
  document.getElementById('kpsc-account-modal')?.remove();
}

async function saveAccountEditor(id, btn) {
  const payload = {
    name: document.getElementById('ka-name')?.value.trim() || '',
    role: document.getElementById('ka-role')?.value || 'committee_viewer',
    status: document.getElementById('ka-status')?.value || 'active',
    pin: document.getElementById('ka-pin')?.value.trim() || '',
    mustChangePin: !!document.getElementById('ka-must-change')?.checked,
  };
  if (!payload.name) {
    showToast('Account name is required.', 'warn');
    return;
  }
  if (!id && !payload.pin) {
    showToast('Default PIN is required for new account.', 'warn');
    return;
  }
  btn.disabled = true;
  const res = id ? await apiPut(`kpsc-accounts/${id}`, payload) : await apiPost('kpsc-accounts', payload);
  btn.disabled = false;
  if (res?.error) {
    showToast(res.error, 'error');
    return;
  }
  closeAccountEditor();
  await renderSettings(document.getElementById('kpsc-main'));
  showToast('Account saved.', 'success');
}

function confirmDeleteKpscAccount(id, name) {
  document.getElementById('kpsc-delete-account-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'kpsc-delete-account-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr"><span class="k-modal-title">Delete Account</span><button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('kpsc-delete-account-modal')?.remove()">✕</button></div>
      <div class="k-modal-body">
        <p>Delete account for <strong>${esc(name)}</strong>? They will lose access immediately. This cannot be undone.</p>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('kpsc-delete-account-modal')?.remove()">Cancel</button>
        <button class="kbtn kbtn-danger" onclick="Kpsc.executeDeleteKpscAccount('${id}', this)">Delete Account</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function executeDeleteKpscAccount(id, btn) {
  btn.disabled = true;
  const res = await apiDelete(`kpsc-accounts/${id}`);
  btn.disabled = false;
  document.getElementById('kpsc-delete-account-modal')?.remove();
  if (res?.error) {
    showToast(res.error, 'error');
    return;
  }
  showToast('Account deleted.', 'success');
  await renderSettings(document.getElementById('kpsc-main'));
}

async function renderSettings(main) {
  const [res, apiStatus, accountsRes] = await Promise.all([
    apiGet('settings'),
    apiGet('settings/api-status').catch(() => ({ error: 'Could not check API status.' })),
    apiGet('kpsc-accounts').catch(() => []),
  ]);
  S.accounts = Array.isArray(accountsRes) ? accountsRes : [];
  _cacheRechargeBankDetails(res);
  // Hydrate role permissions from DB so canAccess() reflects any saved customisations
  const savedPerms = res?.kpsc_role_permissions;
  if (savedPerms && typeof savedPerms === 'object' && !Array.isArray(savedPerms)) {
    S.rolePermissions = savedPerms;
  }
  const savedWritePerms = res?.kpsc_write_permissions;
  if (savedWritePerms && typeof savedWritePerms === 'object') S.writePermissions = savedWritePerms;
  const savedDeletePerms = res?.kpsc_delete_permissions;
  if (savedDeletePerms && typeof savedDeletePerms === 'object') S.deletePermissions = savedDeletePerms;
  // The server never sends the raw key values (see getSettings() backend
  // comment) — only whether one is configured. The key inputs below render
  // blank with a masked placeholder; saveSettings() only sends a key field
  // when the admin actually typed something, so leaving them untouched on
  // save does not wipe the stored key.
  const policyUrl   = res?.kpsc_policy_url  || '';
  const policyNotes = res?.kpsc_policy_notes || '';
  const bankAccountNumbers = res?.kpsc_bank_account_number || '';
  const hasDeepseek = !!res?.ai_deepseek_key_set;
  const hasOpenai   = !!res?.ai_openai_key_set;
  const transcriptionModel = res?.ai_transcription_model || 'gpt-4o-mini-transcribe';
  const ocrModel           = res?.ai_ocr_model           || 'gpt-5-mini';
  const deepseekModel      = res?.ai_deepseek_model      || 'deepseek-v4-flash';
  const incomeCategories = Array.isArray(res?.kpsc_income_categories) ? res.kpsc_income_categories.join('\n') : '';
  const expenseCategories = Array.isArray(res?.kpsc_expense_categories) ? res.kpsc_expense_categories.join('\n') : '';
  const meetingCadence = res?.kpsc_meeting_cadence || 'none';
  S.kpscMeetingCadence = meetingCadence;
  const minimumBalance = Number(res?.kpsc_minimum_balance || 0);
  // Termii SMS settings
  const termiiApiKey         = res?.kpsc_termii_api_key             || '';
  const termiiSenderId       = res?.kpsc_termii_sender_id           || 'RCCG-KP';
  const termiiPartnerSenderId = res?.kpsc_termii_partner_sender_id  || '';
  const termiiChannel      = res?.kpsc_termii_channel             || 'generic';
  const termiiWelcome      = res?.kpsc_termii_welcome_sms  !== '0';
  const termiiPayment      = res?.kpsc_termii_payment_sms  !== '0';
  const termiiNewMonth     = res?.kpsc_termii_newmonth_sms !== '0';
  const termiiRemDay       = res?.kpsc_termii_reminder_day  || '10';
  const termiiRemFreq      = res?.kpsc_termii_reminder_freq || 'monthly';
  const termiiRemMode      = res?.kpsc_termii_reminder_mode || 'day_of_month';
  const hasTermii          = !!termiiApiKey;
  // Advanced SMS settings
  const smsSendWindowStart = res?.kpsc_sms_send_window_start || '08:00';
  const smsSendWindowEnd   = res?.kpsc_sms_send_window_end   || '18:00';
  const termiiAnniversary  = res?.kpsc_termii_anniversary_sms !== '0';
  const termiiMilestone    = res?.kpsc_termii_milestone_sms   !== '0';
  const termiiLapsed       = res?.kpsc_termii_lapsed_sms      !== '0';
  const termiiPremeeting   = res?.kpsc_termii_premeeting_sms  !== '0';
  const termiiActionitem   = res?.kpsc_termii_actionitem_sms  !== '0';
  const termiiDeadline     = res?.kpsc_termii_deadline_sms    !== '0';
  const smsFreqCap         = res?.kpsc_sms_freq_cap      || '3';
  const smsCooloffDays     = res?.kpsc_sms_cooloff_days  || '7';
  const smsNairaPerPage    = res?.kpsc_sms_naira_per_page || '5';
  // Recharge bank details
  const rechargeBank1Name     = res?.kpsc_recharge_bank1_name        || '';
  const rechargeBank1Number   = res?.kpsc_recharge_bank1_number      || '';
  const rechargeBank1AcctName = res?.kpsc_recharge_bank1_account_name || '';
  const rechargeBank2Name     = res?.kpsc_recharge_bank2_name        || '';
  const rechargeBank2Number   = res?.kpsc_recharge_bank2_number      || '';
  const rechargeBank2AcctName = res?.kpsc_recharge_bank2_account_name || '';
  const rechargeMinAmount     = res?.kpsc_recharge_min_amount        || '';
  // System SMS message text templates — fall back to built-in defaults so textareas are always pre-filled
  const SMS_DEFAULTS = {
    welcome:    `Dear {{name}}, welcome to the RCCG Kingdom Parish family! 🎉 We are so glad to have you as a partner in this beautiful journey of faith. Your support means the world to us, and we pray that God will bless you richly — spiritually and in all your endeavours. You are loved! — RCCG Kingdom Parish`,
    payment:    `Dear {{name}}, we have received your {{month}} partnership pledge{{amtText}} and we are so grateful! 🙏 Your faithfulness to God's work here at RCCG Kingdom Parish is a blessing to us all. May the Lord be your reward — pressed down, shaken together, and running over. Your seed is sown in good ground. God bless you! — RCCG Kingdom Parish`,
    newmonth:   `Happy New Month! 🎊 Dear {{name}}, as we step into this brand new month, we lift our hearts in prayer for you: May the Lord open new doors of opportunity before you. May His favour surround you like a shield. May your home be filled with peace and your hands be blessed in all you do. We are grateful for your partnership! — RCCG Kingdom Parish 💙🙏`,
    anniversary:`🎂 Celebrating You Today, {{name}}! It is a joyful day as we mark your {{ordinal}} partnership anniversary with RCCG Kingdom Parish. Your faithfulness speaks volumes. May this anniversary mark the beginning of an even greater season of blessing and breakthrough in your life. You are deeply appreciated! God bless you! 🎉 — RCCG Kingdom Parish`,
    milestone6: `🏅 Six months of faithful partnership — praise the Lord! 🙌 Dear {{name}}, you have been such a blessing to our community! Galatians 6:9 says: 'Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.' Your harvest season is drawing near! We celebrate you and pray God's special blessing upon you. — RCCG Kingdom Parish`,
    milestone12:`🏆 A FULL YEAR of faithful partnership — Glory to God! 🎉 Dear {{name}}, what an incredible milestone! Psalm 1:3 declares you shall be like a tree planted by rivers of water, bringing forth fruit in season. We declare over you a harvest of extraordinary blessings, divine health, and open heavens this year and beyond. You are a champion! — RCCG Kingdom Parish 💙`,
    premeeting: `Hello {{name}} 👋 This is a warm reminder that our KPSC meeting, '{{meetingTitle}}', is coming up tomorrow, {{meetingDate}}{{meetingTime}}{{venue}}. Your presence is very important to us — your voice and wisdom help shape our church family. Please come prepared and prayed up! God bless you. — RCCG Kingdom Parish Stewardship Committee`,
    deadline:   `Hello {{name}} 🔔 A quick and loving reminder: your action item '{{task}}' is due in 3 days ({{dueDate}}). We trust you are making great progress! If you need any support, please let us know. Together we are building something wonderful for God. Thank you for your dedication! — RCCG Kingdom Parish Stewardship Committee`,
    reminder:   `Dear {{name}} 🙏 This is a gentle and loving reminder that your partnership pledge for {{unpaidMonths}} is still outstanding. We fully understand that life can be unpredictable, and we want you to know there is no judgment — only love. When you are able, please do honour your pledge, for it is a seed sown for God's work and your own blessing. "...he who sows generously will also reap generously." (2 Cor 9:6). God bless you! — RCCG Kingdom Parish Family`,
    // Rotating thank-you variants B & C (A falls back to `payment` above)
    paymentB:   `Dear {{name}}, we have received your {{month}} partnership pledge{{amtText}} and our hearts are full of thanks! Your faithfulness keeps God's work moving here at Kingdom Parish. May the Lord bless you in return - good measure, pressed down and overflowing. God bless you! - RCCG Kingdom Parish`,
    paymentC:   `Praise God, {{name}}! Your {{month}} partnership pledge{{amtText}} has been received with deep gratitude. Thank you for sowing faithfully into God's house. May every seed you plant return to you in blessing, health and favour. We celebrate you! God bless you! - RCCG Kingdom Parish`,
    // Rotating reminder variants B & C (A falls back to `reminder` above)
    reminderB:  `Dear {{name}}, we warmly remember you in our prayers. Your partnership pledge for {{unpaidMonths}} is still outstanding. Whenever you are able, kindly honour it - every seed you sow blesses God's work and returns to you. We are grateful for you. God bless you! - RCCG Kingdom Parish Family`,
    reminderC:  `Hello {{name}}, grace and peace to you. This is a gentle reminder that your pledge for {{unpaidMonths}} remains unpaid. There is no pressure, only love - when the Lord enables you, please sow your seed. We are praying with you. God bless you! - RCCG Kingdom Parish Family`,
  };
  const smsWelcomeText    = res?.kpsc_sms_text_welcome     || SMS_DEFAULTS.welcome;
  const smsPaymentText    = res?.kpsc_sms_text_payment     || SMS_DEFAULTS.payment;
  const smsPaymentTextA   = res?.kpsc_sms_text_payment_a   || smsPaymentText;
  const smsPaymentTextB   = res?.kpsc_sms_text_payment_b   || SMS_DEFAULTS.paymentB;
  const smsPaymentTextC   = res?.kpsc_sms_text_payment_c   || SMS_DEFAULTS.paymentC;
  const smsNewmonthText   = res?.kpsc_sms_text_newmonth    || SMS_DEFAULTS.newmonth;
  const smsAnnivText      = res?.kpsc_sms_text_anniversary || SMS_DEFAULTS.anniversary;
  const smsMilestone6Text = res?.kpsc_sms_text_milestone6  || SMS_DEFAULTS.milestone6;
  const smsMilestone12Text= res?.kpsc_sms_text_milestone12 || SMS_DEFAULTS.milestone12;
  const smsPremeetingText = res?.kpsc_sms_text_premeeting  || SMS_DEFAULTS.premeeting;
  const smsDeadlineText   = res?.kpsc_sms_text_deadline    || SMS_DEFAULTS.deadline;
  const smsReminderText   = res?.kpsc_sms_text_reminder    || SMS_DEFAULTS.reminder;
  const smsReminderTextA  = res?.kpsc_sms_text_reminder_a  || smsReminderText;
  const smsReminderTextB  = res?.kpsc_sms_text_reminder_b  || SMS_DEFAULTS.reminderB;
  const smsReminderTextC  = res?.kpsc_sms_text_reminder_c  || SMS_DEFAULTS.reminderC;
  const cadenceOptions = [
    { value: 'none',              label: 'No fixed cadence' },
    { value: 'weekly:sun',        label: 'Weekly on Sunday' },
    { value: 'weekly:mon',        label: 'Weekly on Monday' },
    { value: 'weekly:tue',        label: 'Weekly on Tuesday' },
    { value: 'weekly:wed',        label: 'Weekly on Wednesday' },
    { value: 'weekly:thu',        label: 'Weekly on Thursday' },
    { value: 'weekly:fri',        label: 'Weekly on Friday' },
    { value: 'weekly:sat',        label: 'Weekly on Saturday' },
    { value: 'monthly:first-sun', label: 'First Sunday of the month' },
    { value: 'monthly:first-mon', label: 'First Monday of the month' },
    { value: 'monthly:first-tue', label: 'First Tuesday of the month' },
    { value: 'monthly:first-wed', label: 'First Wednesday of the month' },
    { value: 'monthly:first-thu', label: 'First Thursday of the month' },
    { value: 'monthly:first-fri', label: 'First Friday of the month' },
    { value: 'monthly:first-sat', label: 'First Saturday of the month' },
  ];

  main.innerHTML = `
    <div class="k-page">
      ${renderKpscAccountsCard(S.accounts)}

      ${renderRolePermissionsCard()}

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">AI Models</h2>
        <p class="k-card-sub">Choose which AI model powers each feature. Changing a model here takes effect immediately on the next request — no redeployment needed.</p>

        <div class="k-form-group">
          <label class="k-label">Meeting Minutes Model (DeepSeek)</label>
          <select id="ks-deepseek-model" class="k-input">
            <option value="deepseek-v4-flash" ${deepseekModel === 'deepseek-v4-flash' ? 'selected' : ''}>deepseek-v4-flash — V4 Flash (Fast, Recommended)</option>
            <option value="deepseek-v4-pro" ${deepseekModel === 'deepseek-v4-pro' ? 'selected' : ''}>deepseek-v4-pro — V4 Pro (Deep reasoning, 1M context)</option>
            <option value="deepseek-chat" ${deepseekModel === 'deepseek-chat' ? 'selected' : ''}>deepseek-chat — V3 (Deprecated · removed 2026-07-24)</option>
            <option value="deepseek-reasoner" ${deepseekModel === 'deepseek-reasoner' ? 'selected' : ''}>deepseek-reasoner — R1 (Deprecated · removed 2026-07-24)</option>
          </select>
          <p class="k-hint">Used to generate and structure meeting minutes. <strong>deepseek-v4-flash</strong> is recommended — fast, cheap, 1M token context. Use <strong>deepseek-v4-pro</strong> for complex multi-page analyses. Legacy V3/R1 will be removed by DeepSeek on 2026-07-24.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">Audio Transcription Model (OpenAI)</label>
          <select id="ks-transcription-model" class="k-input">
            <option value="gpt-4o-mini-transcribe" ${transcriptionModel === 'gpt-4o-mini-transcribe' ? 'selected' : ''}>gpt-4o-mini-transcribe — GPT-4o mini (Best value · Recommended)</option>
            <option value="gpt-4o-transcribe" ${transcriptionModel === 'gpt-4o-transcribe' ? 'selected' : ''}>gpt-4o-transcribe — GPT-4o (Highest accuracy · ~2× the cost)</option>
            <option value="whisper-1" ${transcriptionModel === 'whisper-1' ? 'selected' : ''}>whisper-1 — Whisper v2 (Legacy fallback)</option>
          </select>
          <p class="k-hint">Used when you upload an audio file for transcription. <strong>gpt-4o-mini-transcribe</strong> is the recommended default — strong accuracy at roughly half the cost of gpt-4o-transcribe, ideal for typical committee meeting audio. Upgrade to <strong>gpt-4o-transcribe</strong> only for difficult audio (heavy crosstalk, very heavy accents, low SNR). <strong>whisper-1</strong> is kept as a legacy fallback.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">Vision / OCR Model (OpenAI)</label>
          <select id="ks-ocr-model" class="k-input">
            <option value="gpt-5-mini" ${ocrModel === 'gpt-5-mini' ? 'selected' : ''}>gpt-5-mini (Best · Recommended)</option>
            <option value="gpt-4o" ${ocrModel === 'gpt-4o' ? 'selected' : ''}>gpt-4o (High accuracy)</option>
            <option value="gpt-4o-mini" ${ocrModel === 'gpt-4o-mini' ? 'selected' : ''}>gpt-4o-mini (Faster · lower cost)</option>
          </select>
          <p class="k-hint">Used for handwritten notes OCR and receipt scanning. <strong>gpt-5-mini</strong> gives the best accuracy at competitive cost. Use <strong>gpt-4o</strong> if gpt-5-mini is unavailable in your region. Switch to <strong>gpt-4o-mini</strong> to minimise cost on clear handwriting.</p>
        </div>

        <div id="ks-ai-models-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveAiModels()">Save AI Models</button>
      </div>

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">AI Provider Keys</h2>
        <p class="k-card-sub">
          API keys are stored securely in the church database and are only used for processing
          meeting minutes, transcription, and OCR. Without a key the portal uses a built-in rule-based engine.
        </p>
        <div class="k-settings-status ${hasDeepseek || hasOpenai ? 'k-status-ai' : 'k-status-rule'}">
          ${hasDeepseek || hasOpenai ? '🤖 AI-powered mode active' : '⚙️ Rule-based mode (no API key set)'}
        </div>

        <div class="k-form-group">
          <label class="k-label">DeepSeek API Key</label>
          <input type="password" id="ks-deepseek-key" class="k-input"
            placeholder="${hasDeepseek ? '••••••••••••••••' : 'sk-...'}"
            autocomplete="off" />
          <div class="k-key-test-row">
            <button class="kbtn kbtn-sm k-key-test-btn" onclick="Kpsc.testDeepseekKey(this)">Test connection</button>
            <span class="k-key-status" id="ks-deepseek-status"></span>
          </div>
          <p class="k-hint">Used to generate meeting minutes with AI. Get a key at <a href="https://platform.deepseek.com" target="_blank" rel="noopener">platform.deepseek.com</a>${hasDeepseek ? ' — leave blank to keep the currently saved key.' : ''}</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">OpenAI API Key</label>
          <input type="password" id="ks-openai-key" class="k-input"
            placeholder="${hasOpenai ? '••••••••••••••••' : 'sk-...'}"
            autocomplete="off" />
          <div class="k-key-test-row">
            <button class="kbtn kbtn-sm k-key-test-btn" onclick="Kpsc.testOpenaiKey(this)">Test connection</button>
            <span class="k-key-status" id="ks-openai-status"></span>
          </div>
          <p class="k-hint">Required for audio transcription, notes OCR, and receipt scanning. Get a key at <a href="https://platform.openai.com" target="_blank" rel="noopener">platform.openai.com</a>${hasOpenai ? ' — leave blank to keep the currently saved key.' : ''}</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">KPSC Bank Account Number(s) — Bank Charge Email Automation</label>
          <input type="text" id="ks-bank-account-numbers" class="k-input"
            placeholder="e.g. 204XXXX358" value="${esc(bankAccountNumbers)}" />
          <p class="k-hint">Masked account number(s) exactly as they appear in FirstBank alert emails (e.g. <strong>204XXXX358</strong>), comma-separated if more than one. The bank-charge email auto-recording feature only records charges from these account(s) — alerts from any other FirstBank account you receive are ignored. Leave blank to disable this filter (not recommended if you have more than one FirstBank account).</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">KPSC Bylaw / Policy URL</label>
          <input type="url" id="ks-policy-url" class="k-input"
            placeholder="https://..." value="${esc(policyUrl)}" />
          <p class="k-hint">Optional link to the current KPSC bylaws or governance document for secretary review.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">Policy Notes for AI Secretary</label>
          <textarea id="ks-policy-notes" class="k-input k-textarea" placeholder="Paste key KPSC rules here, e.g. quorum, approval thresholds, welfare privacy rules...">${esc(policyNotes)}</textarea>
          <p class="k-hint">Optional. These notes are included in provider-backed minutes processing and kept available for human review.</p>
        </div>

        <div id="ks-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" id="ks-save-btn" onclick="Kpsc.saveSettings()">Save API Keys &amp; Policy</button>
        ${hasDeepseek || hasOpenai ? `<button class="kbtn kbtn-danger-outline" style="margin-left:8px" onclick="Kpsc.clearAiKeys()">Clear Keys</button>` : ''}
      </div>

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">📱 SMS Automation (Termii)</h2>
        <p class="k-card-sub">
          Configure the Termii SMS gateway for automated partner and member notifications.
          Get your API key at <a href="https://app.termii.com" target="_blank" rel="noopener">app.termii.com</a>.
        </p>
        <div class="k-settings-status ${hasTermii ? 'k-status-ai' : 'k-status-rule'}">
          ${hasTermii ? '📲 SMS automation active' : '⚠️ No Termii API key — SMS features are disabled'}
        </div>

        <div class="k-form-group">
          <label class="k-label">Termii API Key</label>
          <input type="password" id="ks-termii-key" class="k-input"
            placeholder="${hasTermii ? '••••••••••••••••' : 'TL_xxxxxxxxxxxxxxxxx'}"
            autocomplete="off" value="${esc(termiiApiKey)}" />
          <p class="k-hint">Your Termii secret API key. Never share this. <a href="https://app.termii.com" target="_blank" rel="noopener">Get a key →</a></p>
        </div>

        <div class="k-form-group">
          <label class="k-label">Sender ID (Members &amp; Staff)</label>
          <input type="text" id="ks-termii-sender" class="k-input" maxlength="11"
            placeholder="RCCG-KP" value="${esc(termiiSenderId)}" />
          <p class="k-hint">Alphanumeric sender name for meeting, pre-meeting, action-item, and deadline SMS (max 11 chars). Must be registered with Termii.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">Partner Sender ID <span style="font-weight:400;color:var(--text3)">(optional)</span></label>
          <input type="text" id="ks-termii-partner-sender" class="k-input" maxlength="11"
            placeholder="e.g. KPSC-PRTNR" value="${esc(termiiPartnerSenderId)}" />
          <p class="k-hint">Separate sender ID for partner welcome, payment, reminder, and anniversary SMS. Falls back to the Sender ID above if left blank.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">SMS Delivery Channel</label>
          <select id="ks-termii-channel" class="k-input k-input-sm" style="max-width:300px">
            <option value="generic" ${termiiChannel === 'generic' ? 'selected' : ''}>Generic (default)</option>
            <option value="dnd" ${termiiChannel === 'dnd' ? 'selected' : ''}>DND (requires Termii account approval)</option>
          </select>
          <p class="k-hint">Only switch to <strong>DND</strong> if Termii has approved your account/sender ID for the DND-bypass route — most accounts are not. Selecting it without approval can cause sends to fail outright. Leave on <strong>Generic</strong> otherwise.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label" style="font-weight:600;margin-bottom:8px">Automated SMS Triggers</label>
          <label class="k-checkbox-row">
            <input type="checkbox" id="ks-termii-welcome" ${termiiWelcome ? 'checked' : ''} />
            <span>Welcome SMS when a new partner is added</span>
          </label>
          <label class="k-checkbox-row" style="margin-top:6px">
            <input type="checkbox" id="ks-termii-payment" ${termiiPayment ? 'checked' : ''} />
            <span>Thank-you SMS when a partner payment is recorded</span>
          </label>
          <label class="k-checkbox-row" style="margin-top:6px">
            <input type="checkbox" id="ks-termii-newmonth" ${termiiNewMonth ? 'checked' : ''} />
            <span>Happy New Month SMS to all active partners on the 1st of each month</span>
          </label>
        </div>

        <div class="k-form-group">
          <label class="k-label">Payment Reminder Schedule</label>
          <div style="margin-bottom:8px">
            <label class="k-label" style="font-size:12px">Schedule Mode</label>
            <select id="ks-termii-rem-mode" class="k-input k-input-sm" onchange="Kpsc.toggleReminderDayField(this.value)">
              <option value="day_of_month" ${termiiRemMode === 'day_of_month' ? 'selected' : ''}>Fixed day of month</option>
              <option value="sat_before_last_sun" ${termiiRemMode === 'sat_before_last_sun' ? 'selected' : ''}>Saturday before last Sunday of month</option>
            </select>
          </div>
          <div id="ks-rem-day-wrap" style="${termiiRemMode === 'sat_before_last_sun' ? 'display:none' : 'display:flex'};gap:8px;flex-wrap:wrap;align-items:center">
            <div>
              <label class="k-label" style="font-size:12px">Day of month</label>
              <input type="number" id="ks-termii-rem-day" class="k-input k-input-sm" min="1" max="28" value="${esc(termiiRemDay)}" style="width:70px" />
            </div>
            <div>
              <label class="k-label" style="font-size:12px">Frequency</label>
              <select id="ks-termii-rem-freq" class="k-input k-input-sm">
                <option value="monthly" ${termiiRemFreq === 'monthly' ? 'selected' : ''}>Monthly (once on reminder day)</option>
                <option value="biweekly" ${termiiRemFreq === 'biweekly' ? 'selected' : ''}>Bi-weekly (day N and N+14)</option>
                <option value="weekly" ${termiiRemFreq === 'weekly' ? 'selected' : ''}>Weekly (every 7 days from day N)</option>
              </select>
            </div>
          </div>
          <p class="k-hint" style="margin-top:6px">Sends payment reminder SMS to active unpaid partners. Uses the <em>SMS/WhatsApp Reminder Template</em> below. The cron job runs every 30 minutes — only sends on matching days.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">Cost per SMS page (₦)</label>
          <input type="number" id="ks-sms-naira-per-page" class="k-input k-input-sm" min="0" step="0.5" value="${esc(smsNairaPerPage)}" style="width:110px" />
          <p class="k-hint" style="margin-top:4px">Used only to estimate credits/cost on the SMS Logs page (1 page = 160 chars GSM-7, or 70 chars if the message contains emoji/special characters). Termii's default route is ≈ ₦5/page.</p>
        </div>

        <div id="ks-termii-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveSmsSettings()">Save SMS Settings</button>
        ${hasTermii ? `<button class="kbtn kbtn-danger-outline" style="margin-left:8px" onclick="Kpsc.clearSmsKey()">Clear Key</button>` : ''}
      </div>

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">📱 Advanced SMS Triggers</h2>
        <p class="k-card-sub">Fine-tune which automated SMS events are active and control quiet hours and frequency limits.</p>

        <div class="k-form-group">
          <label class="k-label" style="font-weight:600;margin-bottom:8px">Event Triggers</label>
          <label class="k-checkbox-row">
            <input type="checkbox" id="ks-termii-anniversary" ${termiiAnniversary ? 'checked' : ''} />
            <span>🎂 Partnership anniversary SMS (yearly on start date)</span>
          </label>
          <label class="k-checkbox-row" style="margin-top:6px">
            <input type="checkbox" id="ks-termii-milestone" ${termiiMilestone ? 'checked' : ''} />
            <span>🏆 Milestone SMS at 6 and 12 consecutive months paid</span>
          </label>
          <label class="k-checkbox-row" style="margin-top:6px">
            <input type="checkbox" id="ks-termii-lapsed" ${termiiLapsed ? 'checked' : ''} />
            <span>💬 Tone-based re-engagement for chronic/dormant partners in reminder SMS</span>
          </label>
          <label class="k-checkbox-row" style="margin-top:6px">
            <input type="checkbox" id="ks-termii-premeeting" ${termiiPremeeting ? 'checked' : ''} />
            <span>📅 Pre-meeting reminder SMS to all members 24 hours before a scheduled meeting</span>
          </label>
          <label class="k-checkbox-row" style="margin-top:6px">
            <input type="checkbox" id="ks-termii-actionitem" ${termiiActionitem ? 'checked' : ''} />
            <span>✅ Post-meeting action item SMS to assignees after outcomes are saved</span>
          </label>
          <label class="k-checkbox-row" style="margin-top:6px">
            <input type="checkbox" id="ks-termii-deadline" ${termiiDeadline ? 'checked' : ''} />
            <span>⏰ Action item deadline reminder SMS 3 days before due date</span>
          </label>
        </div>

        <div class="k-form-group">
          <label class="k-label">🕐 Quiet Hours (WAT — West Africa Time)</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div>
              <label class="k-label" style="font-size:12px">Send from</label>
              <input type="time" id="ks-sms-window-start" class="k-input k-input-sm" value="${esc(smsSendWindowStart)}" />
            </div>
            <div>
              <label class="k-label" style="font-size:12px">Send until</label>
              <input type="time" id="ks-sms-window-end" class="k-input k-input-sm" value="${esc(smsSendWindowEnd)}" />
            </div>
          </div>
          <p class="k-hint" style="margin-top:6px">All cron SMS will only be sent within this WAT time window. Default is 08:00–18:00.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">🚦 Frequency Cap (per partner)</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div>
              <label class="k-label" style="font-size:12px">Max per week</label>
              <input type="number" id="ks-sms-freq-cap" class="k-input k-input-sm" min="1" max="14" value="${esc(smsFreqCap)}" style="width:70px" />
            </div>
            <div>
              <label class="k-label" style="font-size:12px">Cooloff days</label>
              <input type="number" id="ks-sms-cooloff" class="k-input k-input-sm" min="1" max="30" value="${esc(smsCooloffDays)}" style="width:70px" />
            </div>
          </div>
          <p class="k-hint" style="margin-top:6px">No more than <em>max per week</em> reminder SMS to the same partner in 7 days, and at least <em>cooloff days</em> between any two reminders to the same partner.</p>
        </div>

        <div id="ks-advsms-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveAdvSmsSettings()">Save Advanced SMS Settings</button>
      </div>

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">🧪 Test SMS &amp; Balance</h2>
        <p class="k-card-sub">Verify your Termii integration is working and check your remaining SMS credit balance.</p>
        <div class="k-form-group">
          <label class="k-label">Send Test SMS</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:160px">
              <label class="k-label" style="font-size:12px">Phone number (with country code)</label>
              <input type="tel" id="ks-test-sms-phone" class="k-input" placeholder="e.g. 2348012345678" />
            </div>
            <button class="kbtn kbtn-primary" onclick="Kpsc.sendTestSms(this)">Send Test SMS</button>
          </div>
          <div id="ks-test-sms-result" style="margin-top:6px;font-size:13px"></div>
        </div>
        <div class="k-form-group">
          <label class="k-label">Termii Credit Balance</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="kbtn kbtn-primary kbtn-sm" onclick="Kpsc.checkTermiiBalance(this)">Check Balance</button>
            <span id="ks-termii-balance-display" style="font-size:13px;color:#555"></span>
          </div>
          <p class="k-hint">Fetches your current Termii credit balance. A warning will appear when balance is low.</p>
        </div>
      </div>

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">💳 SMS Wallet Recharge</h2>
        <p class="k-card-sub">Save your Termii virtual bank account details here. A <em>Recharge SMS Wallet</em> button on the SMS Logs page will show these details so any admin can quickly top up the wallet via bank transfer.</p>

        <div style="display:grid;gap:16px;margin-bottom:16px">
          ${[1, 2].map(i => `
          <fieldset style="border:1px solid var(--border,#e0e0e0);border-radius:8px;padding:12px 14px;margin:0">
            <legend style="font-size:12px;font-weight:600;color:var(--text2,#555);padding:0 6px">Bank Account ${i}</legend>
            <div class="k-form-group" style="margin-bottom:8px">
              <label class="k-label">Bank Name</label>
              <input type="text" id="ks-recharge-bank${i}-name" class="k-input" placeholder="e.g. Wema Bank" value="${i === 1 ? esc(rechargeBank1Name) : esc(rechargeBank2Name)}" />
            </div>
            <div class="k-form-group" style="margin-bottom:8px">
              <label class="k-label">Account Number</label>
              <input type="text" id="ks-recharge-bank${i}-number" class="k-input" placeholder="10-digit account number" value="${i === 1 ? esc(rechargeBank1Number) : esc(rechargeBank2Number)}" inputmode="numeric" />
            </div>
            <div class="k-form-group" style="margin-bottom:0">
              <label class="k-label">Account Name</label>
              <input type="text" id="ks-recharge-bank${i}-acctname" class="k-input" placeholder="Name on the account" value="${i === 1 ? esc(rechargeBank1AcctName) : esc(rechargeBank2AcctName)}" />
            </div>
          </fieldset>`).join('')}
        </div>

        <div class="k-form-group">
          <label class="k-label">Minimum Recharge Amount (₦) <span style="font-weight:400;color:var(--text3)">(optional)</span></label>
          <input type="text" id="ks-recharge-min-amount" class="k-input k-input-sm" placeholder="e.g. 3000" value="${esc(rechargeMinAmount)}" inputmode="numeric" style="width:140px" />
          <p class="k-hint">Shown as a note in the recharge pop-up.</p>
        </div>

        <div id="ks-recharge-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveRechargeBankDetails()">Save Bank Details</button>
      </div>

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">📋 SMS Templates Library</h2>
        <p class="k-card-sub">Save reusable message templates. Use <code>{{name}}</code>, <code>{{month}}</code>, <code>{{date}}</code>, <code>{{amount}}</code> as variables.</p>
        <div id="ks-sms-templates-list"><em style="font-size:13px;color:#888">Loading…</em></div>
        <div class="k-form-group" style="margin-top:12px">
          <label class="k-label">Add New Template</label>
          <input type="text" id="ks-smst-name" class="k-input" placeholder="Template name" style="margin-bottom:6px" />
          <textarea id="ks-smst-body" class="k-input k-textarea" placeholder="Message body with {{name}}, {{month}} etc." style="margin-bottom:6px"></textarea>
          <div id="ks-smst-save-msg" class="k-settings-msg" style="display:none"></div>
          <button class="kbtn kbtn-primary" onclick="Kpsc.saveSmsTemplate()">Save Template</button>
        </div>
      </div>

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">✏️ System SMS Message Templates</h2>
        <p class="k-card-sub">Edit the text for each automated SMS the portal sends. Leave blank to use the built-in default text. Available variables by template:<br>
          <strong>Welcome:</strong> <code>{{name}}</code><br>
          <strong>Payment Thank-you:</strong> <code>{{name}}</code>, <code>{{month}}</code>, <code>{{amount}}</code>, <code>{{amtText}}</code>, <code>{{partnerType}}</code><br>
          <strong>New Month / Milestone:</strong> <code>{{name}}</code><br>
          <strong>Anniversary:</strong> <code>{{name}}</code>, <code>{{ordinal}}</code>, <code>{{years}}</code><br>
          <strong>Pre-Meeting:</strong> <code>{{name}}</code>, <code>{{meetingTitle}}</code>, <code>{{meetingDate}}</code>, <code>{{meetingTime}}</code>, <code>{{venue}}</code><br>
          <strong>Deadline:</strong> <code>{{name}}</code>, <code>{{task}}</code>, <code>{{dueDate}}</code><br>
          <strong>Payment Reminder:</strong> <code>{{name}}</code>, <code>{{month}}</code> <em>(current month)</em>, <code>{{unpaidMonths}}</code> <em>(comma-separated list of every outstanding month, e.g. "May" or "May, June")</em></p>
        <div class="k-form-group">
          <label class="k-label">👋 Welcome SMS (new partner)</label>
          <textarea id="ks-sms-welcome" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)" placeholder="Dear {{name}}, welcome to the RCCG Kingdom Parish family! 🎉 We are so glad to have you as a partner in this beautiful journey of faith. Your support means the world to us, and we pray that God will bless you richly — spiritually and in all your endeavours. You are loved! — RCCG Kingdom Parish">${esc(smsWelcomeText)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-welcome"></div>
        </div>
        <div class="k-form-group">
          <label class="k-label">🙏 Thank-you SMS (partner payment) — 3 Rotating Templates</label>
          <p class="k-hint" style="margin-bottom:8px">These 3 templates rotate per partner: Template A on their 1st payment, B on 2nd, C on 3rd, then back to A on 4th, and so on. Variables: <code>{{name}}</code> · <code>{{month}}</code> · <code>{{amtText}}</code></p>
          <label class="k-label" style="font-size:12px;color:var(--text3)">Template A (1st, 4th, 7th… payment)</label>
          <textarea id="ks-sms-payment-a" class="k-input k-textarea" rows="3" oninput="Kpsc.updateSmsCounter(this)">${esc(smsPaymentTextA)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-payment-a"></div>
          <label class="k-label" style="font-size:12px;color:var(--text3);margin-top:8px">Template B (2nd, 5th, 8th… payment)</label>
          <textarea id="ks-sms-payment-b" class="k-input k-textarea" rows="3" oninput="Kpsc.updateSmsCounter(this)">${esc(smsPaymentTextB)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-payment-b"></div>
          <label class="k-label" style="font-size:12px;color:var(--text3);margin-top:8px">Template C (3rd, 6th, 9th… payment)</label>
          <textarea id="ks-sms-payment-c" class="k-input k-textarea" rows="3" oninput="Kpsc.updateSmsCounter(this)">${esc(smsPaymentTextC)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-payment-c"></div>
          <p class="k-hint" style="margin-top:4px">When multiple months are paid at once, <code>{{month}}</code> becomes a range e.g. <em>"Jan–Apr 2026 (4 months)"</em> and <code>{{amtText}}</code> shows the total.</p>
        </div>
        <div class="k-form-group">
          <label class="k-label">🎉 Happy New Month SMS (1st of month)</label>
          <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;margin-bottom:6px">
            <textarea id="ks-sms-newmonth" class="k-input k-textarea" rows="4" style="flex:1;min-width:200px" oninput="Kpsc.updateSmsCounter(this)" placeholder="Happy New Month! 🎊 Dear {{name}}, as we step into this brand new month, we lift our hearts in prayer for you: May the Lord open new doors of opportunity before you. May His favour surround you like a shield. May your home be filled with peace and your hands be blessed in all you do. We are grateful for your partnership! — RCCG Kingdom Parish 💙🙏">${esc(smsNewmonthText)}</textarea>
            <button class="kbtn kbtn-sm kbtn-ai" style="white-space:nowrap;margin-top:2px" onclick="Kpsc.aiGenerateNewMonthSms(this)" title="Use AI to draft a fresh blessing SMS for this month with a Bible verse">🤖 AI Draft</button>
          </div>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-newmonth"></div>
          <p class="k-hint">Sent automatically on the 1st of each month. Click <strong>AI Draft</strong> to let AI write a unique blessing message with a Bible verse for this month.</p>
        </div>
        <div class="k-form-group">
          <label class="k-label">🎂 Anniversary SMS (yearly on start date)</label>
          <textarea id="ks-sms-anniversary" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)" placeholder="🎂 Celebrating You Today, {{name}}! It is a joyful day as we mark your {{ordinal}} partnership anniversary with RCCG Kingdom Parish. Your faithfulness speaks volumes. May this anniversary mark the beginning of an even greater season of blessing and breakthrough in your life. You are deeply appreciated! God bless you! 🎉 — RCCG Kingdom Parish">${esc(smsAnnivText)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-anniversary"></div>
        </div>
        <div class="k-form-group">
          <label class="k-label">🏅 6-Month Milestone SMS</label>
          <textarea id="ks-sms-milestone6" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)" placeholder="🏅 Six months of faithful partnership — praise the Lord! 🙌 Dear {{name}}, you have been such a blessing to our community! Galatians 6:9 says: 'Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.' Your harvest season is drawing near! We celebrate you and pray God's special blessing upon you. — RCCG Kingdom Parish">${esc(smsMilestone6Text)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-milestone6"></div>
        </div>
        <div class="k-form-group">
          <label class="k-label">🏆 12-Month Milestone SMS (1 year)</label>
          <textarea id="ks-sms-milestone12" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)" placeholder="🏆 A FULL YEAR of faithful partnership — Glory to God! 🎉 Dear {{name}}, what an incredible milestone! Psalm 1:3 declares you shall be like a tree planted by rivers of water, bringing forth fruit in season. We declare over you a harvest of extraordinary blessings, divine health, and open heavens this year and beyond. You are a champion! — RCCG Kingdom Parish 💙">${esc(smsMilestone12Text)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-milestone12"></div>
        </div>
        <div class="k-form-group">
          <label class="k-label">📅 Pre-Meeting Reminder SMS (to members, 24h before)</label>
          <textarea id="ks-sms-premeeting" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)" placeholder="Hello {{name}} 👋 This is a warm reminder that our KPSC meeting, '{{meetingTitle}}', is coming up tomorrow, {{meetingDate}}{{meetingTime}}{{venue}}. Your presence is very important to us — your voice and wisdom help shape our church family. Please come prepared and prayed up! God bless you. — RCCG Kingdom Parish Stewardship Committee">${esc(smsPremeetingText)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-premeeting"></div>
        </div>
        <div class="k-form-group">
          <label class="k-label">⏰ Action Item Deadline Reminder (3 days before)</label>
          <textarea id="ks-sms-deadline" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)" placeholder="Hello {{name}} 🔔 A quick and loving reminder: your action item '{{task}}' is due in 3 days ({{dueDate}}). We trust you are making great progress! If you need any support, please let us know. Together we are building something wonderful for God. Thank you for your dedication! — RCCG Kingdom Parish Stewardship Committee">${esc(smsDeadlineText)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-deadline"></div>
        </div>
        <div class="k-form-group">
          <label class="k-label">💰 Payment Reminder SMS — 3 Rotating Templates</label>
          <p class="k-hint" style="margin-bottom:8px">These 3 templates rotate per partner based on how many reminders they have previously received. Variables: <code>{{name}}</code> · <code>{{month}}</code> (current month) · <code>{{unpaidMonths}}</code> (comma-separated list of every outstanding month, e.g. "May" or "May, June")</p>
          <label class="k-label" style="font-size:12px;color:var(--text3)">Template A (1st, 4th, 7th… reminder)</label>
          <textarea id="ks-sms-reminder-a" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)">${esc(smsReminderTextA)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-reminder-a"></div>
          <label class="k-label" style="font-size:12px;color:var(--text3);margin-top:8px">Template B (2nd, 5th, 8th… reminder)</label>
          <textarea id="ks-sms-reminder-b" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)">${esc(smsReminderTextB)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-reminder-b"></div>
          <label class="k-label" style="font-size:12px;color:var(--text3);margin-top:8px">Template C (3rd, 6th, 9th… reminder)</label>
          <textarea id="ks-sms-reminder-c" class="k-input k-textarea" rows="4" oninput="Kpsc.updateSmsCounter(this)">${esc(smsReminderTextC)}</textarea>
          <div class="k-sms-counter" id="sms-ctr-ks-sms-reminder-c"></div>
        </div>
        <div id="ks-sms-texts-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveSystemSmsTemplates()">Save SMS Message Templates</button>
      </div>

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">📅 Scheduled SMS Blasts</h2>
        <p class="k-card-sub">Compose a custom SMS blast and schedule it for a specific date and time. The cron job will fire it automatically.</p>
        <div id="ks-scheduled-sms-list"><em style="font-size:13px;color:#888">Loading…</em></div>
        <div class="k-form-group" style="margin-top:12px">
          <label class="k-label">Schedule a New Blast</label>
          <textarea id="ks-ssms-message" class="k-input k-textarea" placeholder="Message to send to all members…" style="margin-bottom:6px"></textarea>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px">
            <div>
              <label class="k-label" style="font-size:12px">Send at (WAT)</label>
              <input type="datetime-local" id="ks-ssms-sendAt" class="k-input k-input-sm" />
            </div>
          </div>
          <div id="ks-ssms-save-msg" class="k-settings-msg" style="display:none"></div>
          <button class="kbtn kbtn-primary" onclick="Kpsc.scheduleSmsBlast()">Schedule Blast</button>
        </div>
      </div>

      ${(S.user?.role === 'it_admin' || S.user?.role === 'general_secretary' || S.user?.role === 'acting_chairman') ? `
      <div class="k-card" style="margin-bottom:16px" id="ks-policies-card">
        <h2 class="k-card-title">📜 Policies & Byelaw</h2>
        <p class="k-card-sub">Manage the Welfare Support Policy and KPSC Byelaw. Published versions are publicly accessible at <code>/kpsc/welfare-policy/</code> and <code>/kpsc/byelaw/</code>.</p>
        <div id="ks-policies-content"><em style="font-size:13px;color:#888">Loading…</em></div>
      </div>` : ''}

      <div class="k-card" style="margin-bottom:16px">
        <h2 class="k-card-title">KPSC Operations Settings</h2>
        <p class="k-card-sub">Configure partnership categories, finance categories, and reminder templates for the KPSC portal.</p>
        <div class="k-form-group">
          <label class="k-label">Meeting Cadence</label>
          <select id="ks-meeting-cadence" class="k-input">
            ${cadenceOptions.map(o => `<option value="${o.value}" ${meetingCadence === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
          <p class="k-hint">Used to pre-fill the date and title when you start a new meeting. Set to "No fixed cadence" if your committee meets ad-hoc.</p>
        </div>
        <div class="k-form-group">
          <label class="k-label">Income Categories (one per line)</label>
          <textarea id="ks-income-cats" class="k-input k-textarea" style="min-height:100px">${esc(incomeCategories)}</textarea>
          <p class="k-hint">e.g. partnership_payment, one_time_donation, wealth_development_offering, other_income</p>
        </div>
        <div class="k-form-group">
          <label class="k-label">Expense Categories (one per line)</label>
          <textarea id="ks-expense-cats" class="k-input k-textarea" style="min-height:100px">${esc(expenseCategories)}</textarea>
          <p class="k-hint">e.g. projects, welfare, rent, church_support, committee_operations</p>
        </div>
        <div class="k-form-group">
          <label class="k-label">Minimum Balance to Retain (₦)</label>
          <input type="number" id="ks-minimum-balance" class="k-input" min="0" step="1" value="${minimumBalance}" placeholder="0" />
          <p class="k-hint">The amount kept back as a reserve. The Finance page shows what's left over this amount as "Available for Projects".</p>
        </div>
        <div id="ks-ops-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveKpscOpsSettings()">Save Operations Settings</button>
      </div>

      <div class="k-card" style="margin-top:16px">
        <h2 class="k-card-title">Live Transcription &amp; Diarization</h2>
        <p class="k-card-sub">
          Real-time transcription and speaker diarization require API keys configured as
          <strong>Cloudflare Pages environment variables</strong> by the IT Administrator —
          they are not stored in this settings page.
        </p>
        <div id="k-api-status-panel">${renderApiStatusCard(apiStatus)}</div>
        <div class="k-env-row">
          <code class="k-env-key">OPENAI_API_KEY</code>
          <span class="k-env-desc">Powers live interim transcription (OpenAI gpt-4o-transcribe via WebRTC), audio file upload transcription, and handwritten notes OCR. Get a key at <a href="https://platform.openai.com" target="_blank" rel="noopener">platform.openai.com</a>.</span>
        </div>
        <div class="k-env-row">
          <code class="k-env-key">DEEPGRAM_API_KEY</code>
          <span class="k-env-desc">Powers speaker diarization — identifies who is speaking and labels each transcript turn. Get a key at <a href="https://console.deepgram.com" target="_blank" rel="noopener">console.deepgram.com</a>.</span>
        </div>
        <div class="k-env-row">
          <code class="k-env-key">VOICE_FP_URL</code>
          <span class="k-env-desc">URL of the self-hosted SpeechBrain voice-fingerprinting service (Cloud Run). Replaces the retired Azure Speaker Recognition. See <code>services/voice-fp/README.md</code> for deploy instructions.</span>
        </div>
        <div class="k-env-row">
          <code class="k-env-key">VOICE_FP_TOKEN</code>
          <span class="k-env-desc">Bearer secret used by the Worker to authenticate against the voice-fingerprinting service. Generate with <code>openssl rand -hex 32</code> and set the same value on the Cloud Run service.</span>
        </div>
        <p class="k-hint" style="margin-top:12px">
          Set these in the Cloudflare Pages dashboard → Settings → Environment Variables.
          If either key is absent, that feature degrades gracefully: transcription falls back to
          OpenAI-only (without speaker labels) when Deepgram is absent, and to chunk-based
          upload only when both are absent. Voice fingerprinting is silently skipped when
          VOICE_FP_URL or VOICE_FP_TOKEN are absent.
        </p>
      </div>

      <div class="k-card" style="margin-top:16px">
        <h2 class="k-card-title">Partnership Landing Page</h2>
        <p class="k-card-sub">Settings for the public-facing <strong>/partnership/</strong> page — visible to everyone, including WhatsApp visitors.</p>
        <label class="k-label">Annual Partnership Goal (₦) — leave empty to hide the goal bar</label>
        <input id="ks-partnership-goal" class="k-input" type="number" min="0" step="1000"
          placeholder="e.g. 24000000"
          value="${esc(res?.partnership_annual_goal || '')}" />
        <label class="k-label" style="margin-top:12px">Welfare Cases Supported This Year — update manually each year</label>
        <input id="ks-welfare-cases" class="k-input" type="number" min="0" step="1"
          placeholder="e.g. 12"
          value="${esc(res?.kpsc_welfare_cases_ytd || '0')}" />
        <label class="k-label" style="margin-top:12px">WhatsApp Number (for pledge form) — international format, no spaces or +</label>
        <input id="ks-wa-number" class="k-input" type="tel" inputmode="numeric"
          placeholder="e.g. 2348012345678"
          value="${esc(res?.partnership_whatsapp_number || '4740944059')}" />
        <label class="k-label" style="margin-top:12px">Church Logo Image URL — paste a public image URL, or leave empty to use the RCCG text badge</label>
        <input id="ks-logo-url" class="k-input" type="url"
          placeholder="https://example.com/rccg-logo.png"
          value="${esc(res?.partnership_logo_url || '')}" />
        <p class="k-hint">To upload a logo: host the image file anywhere publicly accessible (Google Drive, Cloudinary, etc.) and paste the direct image URL above. The logo will appear top-left on the landing page and in the footer.</p>

        <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">
          <p class="k-label" style="font-size:13px;font-weight:700;margin-bottom:4px">Illustration Images</p>
          <p class="k-hint" style="margin-bottom:12px">Paste public image URLs for each slot on the landing page. Leave empty to show the default placeholder. Host images on Cloudinary, Google Drive (direct link), or any public CDN.</p>

          ${_illuField('ks-illu-hero',  res?.partnership_illu_hero,  'Slot 1 — Hero (cross + laurel wreath)',    400, 400, 'square')}
          <div style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-soft)">
            <p class="k-label" style="font-size:12px;font-weight:700;margin-bottom:4px">Slot 2 — Vision Carousel (600×360 landscape) — up to 4 slides</p>
            <p class="k-hint" style="margin-bottom:10px">The Vision section auto-slides through these images. Add 1–4 photos. Leave empty slots to skip. Set slide duration below.</p>
            ${_illuField('ks-vision-slide-1', res?.partnership_vision_slide_1, 'Slide 1', 600, 360, 'landscape')}
            ${_illuField('ks-vision-slide-2', res?.partnership_vision_slide_2, 'Slide 2', 600, 360, 'landscape')}
            ${_illuField('ks-vision-slide-3', res?.partnership_vision_slide_3, 'Slide 3 (optional)', 600, 360, 'landscape')}
            ${_illuField('ks-vision-slide-4', res?.partnership_vision_slide_4, 'Slide 4 (optional)', 600, 360, 'landscape')}
            <label class="k-label" style="margin-top:12px">Slide Duration (seconds)</label>
            <input id="ks-vision-duration" class="k-input" type="number" min="2" max="30" step="1"
              placeholder="5" style="max-width:140px"
              value="${esc(res?.partnership_vision_duration || '5')}" />
          </div>
          ${_illuField('ks-illu-step1', res?.partnership_illu_step1,  'Slot 3 — Step 1: Decide',               400, 240, '')}
          ${_illuField('ks-illu-step2', res?.partnership_illu_step2,  'Slot 4 — Step 2: Pay',                  400, 240, '')}
          ${_illuField('ks-illu-step3', res?.partnership_illu_step3,  'Slot 5 — Step 3: Get Card Signed',      400, 240, '')}
        </div>

        <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">
          <p class="k-label" style="font-size:13px;font-weight:700;margin-bottom:4px">Link Preview Card (Open Graph)</p>
          <p class="k-hint" style="margin-bottom:12px">Controls the card that appears when someone shares the <strong>/partnership/</strong> link on WhatsApp, Facebook, iMessage, etc. Injected server-side so bots see the right content.</p>

          <label class="k-label">Preview Title</label>
          <input id="ks-og-title" class="k-input" type="text"
            placeholder="God's Kingdom Partnership — RCCG Kingdom Parish, Aguleri"
            value="${esc(res?.partnership_og_title || '')}" />

          <label class="k-label" style="margin-top:10px">Preview Description</label>
          <textarea id="ks-og-desc" class="k-input" rows="2" style="resize:vertical"
            placeholder="A monthly pledge to build our church and carry our members…">${esc(res?.partnership_og_description || '')}</textarea>

          ${_illuField('ks-og-image', res?.partnership_og_image, 'Preview Image', 1200, 630, '1200×630 recommended')}
          <p class="k-hint" style="margin-top:4px">💡 For large photos, paste an external URL instead of uploading — uploaded images are stored as base64 and served via the API.</p>
        </div>

        <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">
          <p class="k-label" style="font-size:13px;font-weight:700;margin-bottom:4px">Browser Tab Icon (Favicon)</p>
          <p class="k-hint" style="margin-bottom:12px">Shown in the browser tab when someone opens the /partnership/ page. Square PNG recommended.</p>
          ${_illuField('ks-favicon', res?.partnership_favicon, 'Favicon', 64, 64, '64×64 px square')}
        </div>

        <div id="ks-partnership-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" style="margin-top:12px" onclick="Kpsc.savePartnershipSettings()">Save Partnership Settings</button>
        <a href="/partnership/" target="_blank" class="kbtn kbtn-ghost" style="margin-top:8px;display:inline-block;text-decoration:none">Preview Landing Page ↗</a>
      </div>

      <div class="k-card" style="margin-top:16px">
        <h2 class="k-card-title">About KPSC Portal</h2>
        <p class="k-card-sub">Kingdom Parish Stewardship Committee Meeting Portal</p>
        <div class="k-about-row"><span class="k-about-label">Church</span><span>Redeemed Christian Church of God</span></div>
        <div class="k-about-row"><span class="k-about-label">Parish</span><span>Kingdom Parish, Aguleri</span></div>
        <div class="k-about-row"><span class="k-about-label">Version</span><span>Phase 1</span></div>
      </div>
    </div>`;

  // Async-load SMS templates and scheduled blasts after innerHTML is set
  renderSmsTemplatesList().catch(() => {});
  renderScheduledSmsList().catch(() => {});
  // Initialize SMS character counters for all template textareas
  initSmsCounters();
  if (S.user?.role === 'it_admin' || S.user?.role === 'general_secretary' || S.user?.role === 'acting_chairman') {
    loadKpscPoliciesCard();
  }
}

async function saveAiModels() {
  const msg = document.getElementById('ks-ai-models-save-msg');
  const deepseekModel      = document.getElementById('ks-deepseek-model')?.value      || 'deepseek-v4-flash';
  const transcriptionModel = document.getElementById('ks-transcription-model')?.value || 'gpt-4o-mini-transcribe';
  const ocrModel           = document.getElementById('ks-ocr-model')?.value           || 'gpt-5-mini';
  const res = await apiPost('settings', {
    ai_deepseek_model: deepseekModel,
    ai_transcription_model: transcriptionModel,
    ai_ocr_model: ocrModel,
  });
  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
  } else {
    msg.className = 'k-settings-msg k-msg-ok';
    msg.textContent = 'AI models saved.';
  }
  msg.style.display = 'block';
  setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
}

async function saveSettings() {
  const btn = document.getElementById('ks-save-btn');
  const msg = document.getElementById('ks-save-msg');
  const deepseekKey = document.getElementById('ks-deepseek-key')?.value.trim() || '';
  const openaiKey   = document.getElementById('ks-openai-key')?.value.trim()   || '';
  const policyUrl   = document.getElementById('ks-policy-url')?.value.trim()   || '';
  const policyNotes = document.getElementById('ks-policy-notes')?.value.trim() || '';
  const bankAccountNumbers = document.getElementById('ks-bank-account-numbers')?.value.trim() || '';

  btn.disabled = true;
  btn.textContent = 'Saving…';
  msg.style.display = 'none';

  // The key inputs render blank even when a key is already saved (the
  // server no longer sends raw key values to the browser — see
  // renderSettings). Only include a key field here if the admin actually
  // typed a new one, so leaving it blank preserves the existing saved key
  // instead of wiping it.
  const payload = {
    kpsc_policy_url: policyUrl,
    kpsc_policy_notes: policyNotes,
    kpsc_bank_account_number: bankAccountNumbers,
  };
  if (deepseekKey) payload.ai_deepseek_key = deepseekKey;
  if (openaiKey) payload.ai_openai_key = openaiKey;

  const res = await apiPost('settings', payload);

  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
  } else {
    msg.className = 'k-settings-msg k-msg-ok';
    msg.textContent = 'API keys & policy saved.';
    await renderSettings(document.getElementById('kpsc-main'));
    return;
  }

  msg.style.display = 'block';
  btn.disabled = false;
  btn.textContent = 'Save API Keys & Policy';
}

async function clearAiKeys() {
  if (!confirm('Remove all AI API keys? The portal will fall back to rule-based processing.')) return;
  await apiPost('settings', { ai_deepseek_key: '', ai_openai_key: '' });
  await renderSettings(document.getElementById('kpsc-main'));
}

async function saveSmsSettings() {
  const msg = document.getElementById('ks-termii-save-msg');
  const apiKey         = document.getElementById('ks-termii-key')?.value.trim()            || '';
  const senderId       = document.getElementById('ks-termii-sender')?.value.trim()         || 'RCCG-KP';
  const partnerSenderId = document.getElementById('ks-termii-partner-sender')?.value.trim() || '';
  const channel  = document.getElementById('ks-termii-channel')?.value   || 'dnd';
  const welcome  = document.getElementById('ks-termii-welcome')?.checked  ? '1' : '0';
  const payment  = document.getElementById('ks-termii-payment')?.checked  ? '1' : '0';
  const newMonth = document.getElementById('ks-termii-newmonth')?.checked ? '1' : '0';
  const remMode  = document.getElementById('ks-termii-rem-mode')?.value || 'day_of_month';
  const remDay   = String(parseInt(document.getElementById('ks-termii-rem-day')?.value  || '10', 10) || 10);
  const remFreq  = document.getElementById('ks-termii-rem-freq')?.value || 'monthly';
  const nairaPerPageRaw = parseFloat(document.getElementById('ks-sms-naira-per-page')?.value);
  const nairaPerPage = String(nairaPerPageRaw > 0 ? nairaPerPageRaw : 5);
  const res = await apiPost('settings', {
    kpsc_termii_api_key:              apiKey,
    kpsc_termii_sender_id:            senderId,
    kpsc_termii_partner_sender_id:    partnerSenderId,
    kpsc_termii_channel:              channel,
    kpsc_termii_welcome_sms:          welcome,
    kpsc_termii_payment_sms:          payment,
    kpsc_termii_newmonth_sms:         newMonth,
    kpsc_termii_reminder_mode:        remMode,
    kpsc_termii_reminder_day:         remDay,
    kpsc_termii_reminder_freq:        remFreq,
    kpsc_sms_naira_per_page:          nairaPerPage,
  });
  if (msg) {
    if (res?.error) {
      msg.className = 'k-settings-msg k-msg-error';
      msg.textContent = res.error;
    } else {
      msg.className = 'k-settings-msg k-msg-ok';
      msg.textContent = 'SMS settings saved.';
      setTimeout(async () => { await renderSettings(document.getElementById('kpsc-main')); }, 1200);
    }
    msg.style.display = 'block';
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3500);
  }
}

function toggleReminderDayField(mode) {
  const wrap = document.getElementById('ks-rem-day-wrap');
  if (wrap) wrap.style.display = mode === 'sat_before_last_sun' ? 'none' : 'flex';
}

async function clearSmsKey() {
  if (!confirm('Remove the Termii API key? All SMS automation will be disabled.')) return;
  await apiPost('settings', { kpsc_termii_api_key: '' });
  await renderSettings(document.getElementById('kpsc-main'));
}

async function saveRechargeBankDetails() {
  const msg = document.getElementById('ks-recharge-save-msg');
  const payload = {};
  for (let i = 1; i <= 2; i++) {
    payload[`kpsc_recharge_bank${i}_name`]         = document.getElementById(`ks-recharge-bank${i}-name`)?.value.trim()        || '';
    payload[`kpsc_recharge_bank${i}_number`]        = document.getElementById(`ks-recharge-bank${i}-number`)?.value.trim()      || '';
    payload[`kpsc_recharge_bank${i}_account_name`]  = document.getElementById(`ks-recharge-bank${i}-acctname`)?.value.trim()   || '';
  }
  payload.kpsc_recharge_min_amount = document.getElementById('ks-recharge-min-amount')?.value.trim() || '';
  const res = await apiPost('settings', payload);
  if (!res?.error) _cacheRechargeBankDetails(payload);
  if (msg) {
    if (res?.error) {
      msg.className = 'k-settings-msg k-msg-error';
      msg.textContent = res.error;
    } else {
      msg.className = 'k-settings-msg k-msg-ok';
      msg.textContent = 'Bank details saved.';
    }
    msg.style.display = 'block';
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
  }
}

// Feature 3 + 17: Save advanced SMS settings (triggers, quiet hours, frequency cap)
async function saveAdvSmsSettings() {
  const msg = document.getElementById('ks-advsms-save-msg');
  const anniversary  = document.getElementById('ks-termii-anniversary')?.checked  ? '1' : '0';
  const milestone    = document.getElementById('ks-termii-milestone')?.checked    ? '1' : '0';
  const lapsed       = document.getElementById('ks-termii-lapsed')?.checked       ? '1' : '0';
  const premeeting   = document.getElementById('ks-termii-premeeting')?.checked   ? '1' : '0';
  const actionitem   = document.getElementById('ks-termii-actionitem')?.checked   ? '1' : '0';
  const deadline     = document.getElementById('ks-termii-deadline')?.checked     ? '1' : '0';
  const windowStart  = document.getElementById('ks-sms-window-start')?.value || '08:00';
  const windowEnd    = document.getElementById('ks-sms-window-end')?.value   || '18:00';
  const freqCap      = String(parseInt(document.getElementById('ks-sms-freq-cap')?.value || '3', 10) || 3);
  const cooloffDays  = String(parseInt(document.getElementById('ks-sms-cooloff')?.value   || '7', 10) || 7);
  const res = await apiPost('settings', {
    kpsc_termii_anniversary_sms:  anniversary,
    kpsc_termii_milestone_sms:    milestone,
    kpsc_termii_lapsed_sms:       lapsed,
    kpsc_termii_premeeting_sms:   premeeting,
    kpsc_termii_actionitem_sms:   actionitem,
    kpsc_termii_deadline_sms:     deadline,
    kpsc_sms_send_window_start:   windowStart,
    kpsc_sms_send_window_end:     windowEnd,
    kpsc_sms_freq_cap:            freqCap,
    kpsc_sms_cooloff_days:        cooloffDays,
  });
  if (msg) {
    if (res?.error) {
      msg.className = 'k-settings-msg k-msg-error';
      msg.textContent = res.error;
    } else {
      msg.className = 'k-settings-msg k-msg-ok';
      msg.textContent = 'Advanced SMS settings saved.';
    }
    msg.style.display = 'block';
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
  }
}

// Feature 14: Test SMS
async function sendTestSms(btn) {
  const phone   = document.getElementById('ks-test-sms-phone')?.value.trim() || '';
  const resultEl = document.getElementById('ks-test-sms-result');
  if (!phone) { if (resultEl) { resultEl.textContent = '⚠️ Please enter a phone number.'; resultEl.style.color = '#c00'; } return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  if (resultEl) { resultEl.textContent = ''; resultEl.style.color = ''; }
  try {
    const res = await apiPost('kpsc-sms-test', { phone });
    if (resultEl) {
      resultEl.textContent = res.ok ? `✅ ${res.message}` : `❌ ${res.error || 'Send failed'}`;
      resultEl.style.color = res.ok ? '#1a7a1a' : '#c00';
    }
  } catch (e) {
    if (resultEl) { resultEl.textContent = `❌ Error: ${e.message}`; resultEl.style.color = '#c00'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Test SMS'; }
  }
}

// Feature 13: Check Termii balance
async function checkTermiiBalance(btn) {
  const displayEl = document.getElementById('ks-termii-balance-display');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Checking…';
  if (displayEl) { displayEl.textContent = ''; displayEl.style.color = ''; }
  try {
    const res = await apiGet('kpsc-termii-balance');
    if (displayEl) {
      if (res?.error) {
        displayEl.textContent = `❌ ${res.error}`;
        displayEl.style.color = '#c00';
      } else {
        const bal = res.balance ?? 'N/A';
        const low = typeof bal === 'number' && bal < 500;
        displayEl.textContent = `Balance: ${bal} ${res.currency || ''}${low ? ' ⚠️ Low balance!' : ''}`;
        displayEl.style.color = low ? '#c00' : '#1a7a1a';
      }
    }
  } catch (e) {
    if (displayEl) { displayEl.textContent = `❌ Error: ${e.message}`; displayEl.style.color = '#c00'; }
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

// ── Low-balance wallet notification ────────────────────────────────────────
const LOW_BALANCE_THRESHOLD = 200; // ₦

function isBalanceCacheFresh() {
  const c = S.termiiWalletCache;
  return !!(c && c.fetchedAt && (Date.now() - c.fetchedAt < 10 * 60 * 1000));
}

function lowBalanceNoticeHtml(balance) {
  const fmt = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  return `<div id="k-low-balance-notice" role="alert" style="
      display:flex;align-items:center;gap:12px;
      background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%);
      border:1.5px solid #f59e0b;border-left:5px solid #d97706;
      border-radius:10px;padding:13px 16px;margin:10px 0 8px;
      box-shadow:0 2px 12px rgba(217,119,6,0.16);
    ">
    <div style="font-size:22px;flex-shrink:0;line-height:1">⚠️</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:14px;color:#92400e;margin-bottom:2px;line-height:1.3">SMS Wallet Balance Low</div>
      <div style="font-size:13px;color:#b45309;line-height:1.4">${fmt(balance)} remaining — reminders may stop sending</div>
    </div>
    <button onclick="Kpsc.goToSmsWalletRecharge()" style="
        background:#d97706;color:#fff;border:none;border-radius:7px;
        padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;
        white-space:nowrap;flex-shrink:0;
      ">💳 Recharge</button>
    <button onclick="Kpsc.dismissLowBalanceNotice()" title="Dismiss for this session" style="
        background:none;border:none;color:#b45309;cursor:pointer;
        font-size:18px;padding:2px 5px;flex-shrink:0;line-height:1;opacity:0.55;
      ">✕</button>
  </div>`;
}

function injectLowBalanceNotice(main) {
  if (sessionStorage.getItem('k-lbn-dismissed')) return;
  if (document.getElementById('k-low-balance-notice')) return;
  const bal = S.termiiWalletCache?.balance;
  if (bal == null || bal > LOW_BALANCE_THRESHOLD) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = lowBalanceNoticeHtml(bal);
  const notice = wrap.firstElementChild;
  const subTabs = main.querySelector('.ka-subtabs');
  if (subTabs) {
    subTabs.insertAdjacentElement('afterend', notice);
  } else {
    const page = main.querySelector('.k-page');
    (page || main).insertBefore(notice, (page || main).firstChild);
  }
}

async function bgCheckLowBalance(main) {
  if (sessionStorage.getItem('k-lbn-dismissed')) return;
  try {
    if (!isBalanceCacheFresh()) {
      const res = await apiGet('kpsc-termii-balance');
      if (res?.balance != null) {
        S.termiiWalletCache = { balance: Number(res.balance), fetchedAt: Date.now() };
      } else {
        return;
      }
    }
    injectLowBalanceNotice(main);
  } catch (_) { /* non-critical — don't surface errors */ }
}

function dismissLowBalanceNotice() {
  sessionStorage.setItem('k-lbn-dismissed', '1');
  document.getElementById('k-low-balance-notice')?.remove();
}

function goToSmsWalletRecharge() {
  if (S.page !== 'sms_logs') {
    navigate('sms_logs');
    setTimeout(() => {
      document.getElementById('k-sms-wallet-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showRechargeWalletModal();
    }, 650);
  } else {
    document.getElementById('k-sms-wallet-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showRechargeWalletModal();
  }
}

// ── Recharge modal helpers ──────────────────────────────────────────────────

// Extract bank details from a raw settings object and cache in S.rechargeBankDetails.
// Call this anywhere settings are already loaded to avoid a redundant fetch in the modal.
function _cacheRechargeBankDetails(res) {
  if (!res || res.error) return;
  const banks = [];
  for (let i = 1; i <= 2; i++) {
    const name     = String(res[`kpsc_recharge_bank${i}_name`]         || '').trim();
    const number   = String(res[`kpsc_recharge_bank${i}_number`]       || '').trim();
    const acctName = String(res[`kpsc_recharge_bank${i}_account_name`] || '').trim();
    if (name || number) banks.push({ name, number, acctName });
  }
  S.rechargeBankDetails = { banks, minAmt: String(res.kpsc_recharge_min_amount || '').trim() };
}

function _rechargeModalBanksHtml({ banks = [], minAmt = '' } = {}) {
  const body = banks.length
    ? banks.map(b => `
        <div style="background:var(--bg2,#f5f7fa);border:1.5px solid var(--border,#dde3ec);border-radius:10px;padding:14px 18px;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:var(--text3,#8a94a6);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">${esc(b.name)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:24px;font-weight:800;letter-spacing:.06em;color:var(--navy,#1a2e4a)">${esc(b.number)}</span>
            <button class="kbtn kbtn-sm kbtn-ghost" style="font-size:11px" onclick="Kpsc.copyText('${esc(b.number)}', this)" title="Copy account number">📋 Copy</button>
          </div>
          ${b.acctName ? `<div style="font-size:13px;color:var(--text2,#555)">${esc(b.acctName)}</div>` : ''}
        </div>`).join('')
    : `<div style="text-align:center;padding:20px 0">
        <div style="font-size:32px;margin-bottom:8px">🏦</div>
        <p style="color:var(--text3,#888);font-size:13px;margin:0">No bank details saved yet.<br>Go to <strong>Settings → SMS Wallet Recharge</strong> to add your Termii virtual account details.</p>
      </div>`;
  return body + (minAmt ? `<p class="k-hint" style="margin-top:8px;text-align:center">Minimum recharge: <strong>₦${esc(minAmt)}</strong></p>` : '');
}

function _fillRechargeModal(details) {
  const body = document.getElementById('k-recharge-modal-body');
  if (!body) return;
  body.innerHTML = `
    <p style="font-size:14px;margin-bottom:14px;color:var(--text2,#444);line-height:1.5">
      Transfer to any virtual account below to top up your Termii SMS wallet. Balance updates automatically once the transfer is confirmed.
    </p>
    ${_rechargeModalBanksHtml(details)}
    <p class="k-hint" style="margin-top:10px">To update these details, go to <strong>Settings → SMS Wallet Recharge</strong>.</p>`;
}

async function showRechargeWalletModal() {
  document.getElementById('k-recharge-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'k-recharge-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:420px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">💳 Recharge SMS Wallet</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-recharge-modal')?.remove()">✕</button>
      </div>
      <div class="k-modal-body" id="k-recharge-modal-body">
        <div class="k-loading" style="padding:24px 0">Loading bank details…</div>
      </div>
    </div>`;
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  // Use in-memory cache if available (populated when Finance/Settings pages load)
  if (S.rechargeBankDetails) {
    _fillRechargeModal(S.rechargeBankDetails);
    return;
  }

  // Cache miss — fetch settings directly
  try {
    const res = await apiGet('settings');
    _cacheRechargeBankDetails(res);
    _fillRechargeModal(S.rechargeBankDetails || { banks: [], minAmt: '' });
  } catch (e) {
    console.error('showRechargeWalletModal: failed to load settings', e);
    const body = document.getElementById('k-recharge-modal-body');
    if (body) body.innerHTML = `
      <p style="color:#c00;font-size:13px;margin-bottom:10px">Could not load bank details${e?.message ? `: ${esc(e.message)}` : ''}.</p>
      <button class="kbtn kbtn-sm" onclick="Kpsc.showRechargeWalletModal()">🔄 Retry</button>`;
  }
}

// Feature 11: SMS Templates
async function renderSmsTemplatesList() {
  const container = document.getElementById('ks-sms-templates-list');
  if (!container) return;
  const data = await apiGet('kpsc-sms-templates').catch(() => []);
  const templates = Array.isArray(data) ? data : [];
  if (!templates.length) {
    container.innerHTML = '<p style="font-size:13px;color:#888">No templates saved yet.</p>';
    return;
  }
  container.innerHTML = `<div class="k-meeting-list">${templates.map(t => `
    <div class="k-meeting-card" style="cursor:default">
      <div class="k-mc-top">
        <div style="flex:1">
          <div class="k-mc-title">${esc(t.name)}</div>
          <div class="k-mc-meta" style="font-size:12px;margin-top:3px">${esc(t.body)}</div>
        </div>
        <button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.deleteSmsTemplate('${esc(t.id)}')">Delete</button>
      </div>
    </div>`).join('')}</div>`;
}

async function saveSmsTemplate() {
  const name = document.getElementById('ks-smst-name')?.value.trim() || '';
  const body = document.getElementById('ks-smst-body')?.value.trim() || '';
  const msg  = document.getElementById('ks-smst-save-msg');
  if (!name || !body) {
    if (msg) { msg.className = 'k-settings-msg k-msg-error'; msg.textContent = 'Name and body are required.'; msg.style.display = 'block'; }
    return;
  }
  const res = await apiPost('kpsc-sms-templates', { name, body });
  if (msg) {
    if (res?.error) {
      msg.className = 'k-settings-msg k-msg-error';
      msg.textContent = res.error;
    } else {
      msg.className = 'k-settings-msg k-msg-ok';
      msg.textContent = 'Template saved.';
      document.getElementById('ks-smst-name').value = '';
      document.getElementById('ks-smst-body').value = '';
      await renderSmsTemplatesList();
    }
    msg.style.display = 'block';
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
  }
}

async function deleteSmsTemplate(id) {
  if (!confirm('Delete this SMS template?')) return;
  await apiDelete(`kpsc-sms-templates/${id}`);
  await renderSmsTemplatesList();
}

async function aiGenerateNewMonthSms(btn) {
  const textarea = document.getElementById('ks-sms-newmonth');
  if (!textarea) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  try {
    const res = await apiPost('kpsc-ai-newmonth-sms', {});
    if (res?.error) { showToast(res.error, 'error'); return; }
    if (res?.message) {
      textarea.value = res.message;
      updateSmsCounter(textarea);
      if (res.warning) {
        showToast(res.warning, 'warn');
      } else {
        showToast('New month SMS drafted by AI! Review and save when ready.', 'success');
      }
    }
  } catch {
    showToast('AI generation failed. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function saveSystemSmsTemplates() {
  const msg = document.getElementById('ks-sms-texts-save-msg');
  const data = {
    kpsc_sms_text_welcome:     document.getElementById('ks-sms-welcome')?.value.trim()     || '',
    kpsc_sms_text_newmonth:    document.getElementById('ks-sms-newmonth')?.value.trim()    || '',
    kpsc_sms_text_anniversary: document.getElementById('ks-sms-anniversary')?.value.trim() || '',
    kpsc_sms_text_milestone6:  document.getElementById('ks-sms-milestone6')?.value.trim()  || '',
    kpsc_sms_text_milestone12: document.getElementById('ks-sms-milestone12')?.value.trim() || '',
    kpsc_sms_text_premeeting:  document.getElementById('ks-sms-premeeting')?.value.trim()  || '',
    kpsc_sms_text_deadline:    document.getElementById('ks-sms-deadline')?.value.trim()    || '',
    // Rotating payment thank-you templates (A/B/C)
    kpsc_sms_text_payment_a:   document.getElementById('ks-sms-payment-a')?.value.trim()   || '',
    kpsc_sms_text_payment_b:   document.getElementById('ks-sms-payment-b')?.value.trim()   || '',
    kpsc_sms_text_payment_c:   document.getElementById('ks-sms-payment-c')?.value.trim()   || '',
    // Rotating reminder templates (A/B/C)
    kpsc_sms_text_reminder_a:  document.getElementById('ks-sms-reminder-a')?.value.trim()  || '',
    kpsc_sms_text_reminder_b:  document.getElementById('ks-sms-reminder-b')?.value.trim()  || '',
    kpsc_sms_text_reminder_c:  document.getElementById('ks-sms-reminder-c')?.value.trim()  || '',
  };
  const res = await apiPost('settings', data);
  if (msg) {
    msg.className = res?.error ? 'k-settings-msg k-msg-error' : 'k-settings-msg k-msg-ok';
    msg.textContent = res?.error ? res.error : 'SMS message templates saved.';
    msg.style.display = 'block';
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
  }
}

// Feature 10: Scheduled SMS Blasts
async function renderScheduledSmsList() {
  const container = document.getElementById('ks-scheduled-sms-list');
  if (!container) return;
  const data = await apiGet('kpsc-scheduled-sms').catch(() => []);
  const blasts = Array.isArray(data) ? data : [];
  if (!blasts.length) {
    container.innerHTML = '<p style="font-size:13px;color:#888">No scheduled blasts.</p>';
    return;
  }
  container.innerHTML = `<div class="k-meeting-list">${blasts.map(b => `
    <div class="k-meeting-card" style="cursor:default">
      <div class="k-mc-top">
        <div style="flex:1">
          <div class="k-mc-title">${esc(b.sendAt?.slice(0,16) || '')} — <span class="kbadge badge-${b.status === 'sent' ? 'green' : 'amber'}">${esc(b.status)}</span></div>
          <div class="k-mc-meta" style="font-size:12px;margin-top:3px">${esc(b.message)}</div>
          ${b.status === 'sent' ? `<div class="k-mc-meta" style="font-size:11px;color:#888">Sent: ${b.sentCount}, Failed: ${b.failedCount}</div>` : ''}
        </div>
        ${b.status === 'pending' ? `<button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.deleteScheduledSms('${esc(b.id)}')">Cancel</button>` : ''}
      </div>
    </div>`).join('')}</div>`;
}

async function scheduleSmsBlast() {
  const message = document.getElementById('ks-ssms-message')?.value.trim()  || '';
  const sendAt  = document.getElementById('ks-ssms-sendAt')?.value.trim()   || '';
  const msg     = document.getElementById('ks-ssms-save-msg');
  if (!message || !sendAt) {
    if (msg) { msg.className = 'k-settings-msg k-msg-error'; msg.textContent = 'Message and send time are required.'; msg.style.display = 'block'; }
    return;
  }
  // Convert local datetime-local to ISO (treat as WAT = UTC+1)
  const sendAtIso = new Date(sendAt).toISOString();
  const res = await apiPost('kpsc-scheduled-sms', { message, sendAt: sendAtIso });
  if (msg) {
    if (res?.error) {
      msg.className = 'k-settings-msg k-msg-error';
      msg.textContent = res.error;
    } else {
      msg.className = 'k-settings-msg k-msg-ok';
      msg.textContent = 'Blast scheduled.';
      document.getElementById('ks-ssms-message').value = '';
      document.getElementById('ks-ssms-sendAt').value = '';
      await renderScheduledSmsList();
    }
    msg.style.display = 'block';
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
  }
}

async function deleteScheduledSms(id) {
  if (!confirm('Cancel this scheduled blast?')) return;
  await apiDelete(`kpsc-scheduled-sms/${id}`);
  await renderScheduledSmsList();
}


async function testDeepseekKey(btn) {
  const key = document.getElementById('ks-deepseek-key')?.value.trim() || '';
  const statusEl = document.getElementById('ks-deepseek-status');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Testing…';
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'k-key-status'; }
  try {
    const res = await apiPost('settings/test-deepseek', { key });
    if (statusEl) {
      statusEl.textContent = res.ok ? `✓ ${res.message}` : `✗ ${res.message || res.error}`;
      statusEl.className = `k-key-status ${res.ok ? 'k-key-ok' : 'k-key-fail'}`;
    }
  } catch (e) {
    if (statusEl) { statusEl.textContent = `✗ Test failed: ${e.message}`; statusEl.className = 'k-key-status k-key-fail'; }
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function testOpenaiKey(btn) {
  const key = document.getElementById('ks-openai-key')?.value.trim() || '';
  const statusEl = document.getElementById('ks-openai-status');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Testing…';
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'k-key-status'; }
  try {
    const res = await apiPost('settings/test-openai', { key });
    if (statusEl) {
      statusEl.textContent = res.ok ? `✓ ${res.message}` : `✗ ${res.message || res.error}`;
      statusEl.className = `k-key-status ${res.ok ? 'k-key-ok' : 'k-key-fail'}`;
    }
  } catch (e) {
    if (statusEl) { statusEl.textContent = `✗ Test failed: ${e.message}`; statusEl.className = 'k-key-status k-key-fail'; }
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function saveKpscOpsSettings() {
  const msg = document.getElementById('ks-ops-save-msg');
  const incomeText = document.getElementById('ks-income-cats')?.value || '';
  const expenseText = document.getElementById('ks-expense-cats')?.value || '';
  const cadence = document.getElementById('ks-meeting-cadence')?.value || 'none';
  const minimumBalance = Math.max(0, Number(document.getElementById('ks-minimum-balance')?.value) || 0);
  const incomeCategories = incomeText.split(/[\n,]/).map(s=>s.trim().toLowerCase().replace(/\s+/g,'_')).filter(Boolean);
  const expenseCategories = expenseText.split(/[\n,]/).map(s=>s.trim().toLowerCase().replace(/\s+/g,'_')).filter(Boolean);
  const res = await apiPost('settings', {
    kpsc_income_categories: incomeCategories,
    kpsc_expense_categories: expenseCategories,
    kpsc_meeting_cadence: cadence,
    kpsc_minimum_balance: minimumBalance,
  });
  if (!res?.error) S.kpscMeetingCadence = cadence;
  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
  } else {
    msg.className = 'k-settings-msg k-msg-ok';
    msg.textContent = 'Operations settings saved.';
  }
  msg.style.display = 'block';
  setTimeout(() => { if(msg) msg.style.display = 'none'; }, 3000);
}

function _illuField(id, value, label, w, h, shape, quality) {
  const hasImage = String(value || '').trim().length > 0;
  const sizeHint = shape ? `~${w}×${h} px ${shape}` : `~${w}×${h} px`;
  const q = quality ?? (w * h > 200000 ? 0.72 : 0.82);
  const thumbHtml = hasImage
    ? `<div style="margin-top:6px"><img src="${esc(value)}" alt="preview" style="max-height:64px;max-width:120px;border-radius:6px;border:1px solid var(--border);object-fit:cover;" /></div>`
    : '';
  return `
    <div style="margin-top:10px">
      <label class="k-label">${esc(label)} · ${esc(sizeHint)}</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="${id}" class="k-input" type="text" style="flex:1;min-width:180px"
          placeholder="https://example.com/image.jpg"
          value="${esc(value || '')}" />
        <label class="kbtn kbtn-sm" style="cursor:pointer;white-space:nowrap" title="Upload image from device">
          📁 Upload
          <input type="file" accept="image/*" style="display:none"
            onchange="Kpsc._handleIllustrationUpload('${id}', this, ${w}, ${h}, ${q})" />
        </label>
      </div>
      ${thumbHtml}
    </div>`;
}

async function savePartnershipSettings() {
  const msg = document.getElementById('ks-partnership-save-msg');
  const goal      = document.getElementById('ks-partnership-goal')?.value.trim() || '';
  const welfare   = document.getElementById('ks-welfare-cases')?.value.trim() || '0';
  const waNum     = document.getElementById('ks-wa-number')?.value.trim() || '';
  const logoUrl   = document.getElementById('ks-logo-url')?.value.trim() || '';
  const illuHero      = document.getElementById('ks-illu-hero')?.value.trim() || '';
  const illuStep1     = document.getElementById('ks-illu-step1')?.value.trim() || '';
  const illuStep2     = document.getElementById('ks-illu-step2')?.value.trim() || '';
  const illuStep3     = document.getElementById('ks-illu-step3')?.value.trim() || '';
  const visionSlide1  = document.getElementById('ks-vision-slide-1')?.value.trim() || '';
  const visionSlide2  = document.getElementById('ks-vision-slide-2')?.value.trim() || '';
  const visionSlide3  = document.getElementById('ks-vision-slide-3')?.value.trim() || '';
  const visionSlide4  = document.getElementById('ks-vision-slide-4')?.value.trim() || '';
  const visionDuration= document.getElementById('ks-vision-duration')?.value.trim() || '5';
  const ogTitle       = document.getElementById('ks-og-title')?.value.trim() || '';
  const ogDesc        = document.getElementById('ks-og-desc')?.value.trim() || '';
  const ogImage       = document.getElementById('ks-og-image')?.value.trim() || '';
  const favicon       = document.getElementById('ks-favicon')?.value.trim() || '';
  const res = await apiPost('settings', {
    partnership_annual_goal:      goal,
    kpsc_welfare_cases_ytd:       welfare,
    partnership_whatsapp_number:  waNum,
    partnership_logo_url:         logoUrl,
    partnership_illu_hero:        illuHero,
    partnership_illu_step1:       illuStep1,
    partnership_illu_step2:       illuStep2,
    partnership_illu_step3:       illuStep3,
    partnership_vision_slide_1:   visionSlide1,
    partnership_vision_slide_2:   visionSlide2,
    partnership_vision_slide_3:   visionSlide3,
    partnership_vision_slide_4:   visionSlide4,
    partnership_vision_duration:  visionDuration,
    partnership_og_title:         ogTitle,
    partnership_og_description:   ogDesc,
    partnership_og_image:         ogImage,
    partnership_favicon:          favicon,
  });
  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
  } else {
    msg.className = 'k-settings-msg k-msg-ok';
    msg.textContent = 'Partnership page settings saved.';
  }
  msg.style.display = 'block';
  setTimeout(() => { if(msg) msg.style.display = 'none'; }, 3000);
}

// ── ROLE PERMISSIONS ─────────────────────────────────────────────

const PERM_ROLES = [
  { key: 'acting_chairman',    label: 'Acting Chairman' },
  { key: 'general_secretary',  label: 'General Secretary' },
  { key: 'financial_secretary',label: 'Financial Secretary' },
  { key: 'treasurer',          label: 'Treasurer' },
  { key: 'committee_viewer',   label: 'Committee Viewer' },
  { key: 'it_admin',           label: 'IT Administrator' },
];

const PERM_PAGES = [
  { key: 'dashboard',        label: 'Dashboard' },
  { key: 'archive',          label: 'Meetings / Archive' },
  { key: 'projects',         label: 'Projects' },
  { key: 'partners',         label: 'Partners' },
  { key: 'partner-progress', label: 'Progress' },
  { key: 'finance',          label: 'Finance' },
  { key: 'reminders',        label: 'Reminders' },
  { key: 'reports',          label: 'Reports' },
  { key: 'members',          label: 'Members' },
  { key: 'settings',         label: 'Settings' },
  { key: 'inbox',            label: 'Inbox' },
];

function isPermForced(roleKey, pageKey) {
  // Dashboard is always accessible to every role
  if (pageKey === 'dashboard') return true;
  // Acting Chairman must always keep access to Settings (prevents self-lockout)
  if (roleKey === 'acting_chairman' && pageKey === 'settings') return true;
  return false;
}

function renderRolePermissionsCard() {
  const perms = effectiveRolePermissions();
  const writePerms = S.writePermissions || KPSC_WRITE_PERMISSIONS;
  const deletePerms = S.deletePermissions || KPSC_DELETE_PERMISSIONS;

  const roleCards = PERM_ROLES.map(role => {
    const allowed      = Array.isArray(perms[role.key]) ? perms[role.key] : (KPSC_PERMISSIONS[role.key] || []);
    const allowedWrite = Array.isArray(writePerms[role.key]) ? writePerms[role.key] : (KPSC_WRITE_PERMISSIONS[role.key] || []);
    const allowedDel   = Array.isArray(deletePerms[role.key]) ? deletePerms[role.key] : (KPSC_DELETE_PERMISSIONS[role.key] || []);

    const rows = PERM_PAGES.map(page => {
      const forcedRead  = isPermForced(role.key, page.key);
      const checkedRead  = forcedRead || allowed.includes(page.key);
      const checkedWrite = allowedWrite.includes(page.key);
      const checkedDel   = allowedDel.includes(page.key);
      // Write/delete only makes sense if read is granted
      const disableWD = !checkedRead && !forcedRead;
      return `
        <div class="k-perm-row">
          <span class="k-perm-page-name">${page.label}</span>
          <div class="k-perm-checks">
            <label class="k-perm-check-lbl" title="View / access this section">
              <input type="checkbox" id="kp-${role.key}-${page.key}-read"
                ${checkedRead ? 'checked' : ''}
                ${forcedRead  ? 'disabled title="Always enabled"' : ''}
                onchange="Kpsc.onPermReadChange('${role.key}','${page.key}',this.checked)"
              /><span>View</span>
            </label>
            <label class="k-perm-check-lbl" title="Edit / modify records in this section">
              <input type="checkbox" id="kp-${role.key}-${page.key}-write"
                ${checkedWrite ? 'checked' : ''}
                ${disableWD ? 'disabled' : ''}
              /><span>Edit</span>
            </label>
            <label class="k-perm-check-lbl" title="Delete records in this section">
              <input type="checkbox" id="kp-${role.key}-${page.key}-delete"
                ${checkedDel ? 'checked' : ''}
                ${disableWD ? 'disabled' : ''}
              /><span>Delete</span>
            </label>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="k-perm-role-card">
        <div class="k-perm-role-hdr">${role.label}</div>
        ${rows}
      </div>`;
  }).join('');

  return `
    <div class="k-card" style="margin-bottom:16px">
      <h2 class="k-card-title">Role Permissions</h2>
      <p class="k-card-sub">Control what each role can <strong>view</strong>, <strong>edit</strong>, and <strong>delete</strong> in each section. Greyed items are always enforced. "Meetings / Archive → Edit" also controls who can start a new meeting.</p>
      <div id="k-perm-roles-grid" class="k-perm-roles-grid">
        ${roleCards}
      </div>
      <div id="ks-perms-save-msg" class="k-settings-msg" style="display:none"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveRolePermissions()">Save Role Permissions</button>
        <button class="kbtn" onclick="Kpsc.resetRolePermissions()">Reset to Defaults</button>
      </div>
    </div>`;
}

function onPermReadChange(roleKey, pageKey, isChecked) {
  // When read is unchecked, also uncheck write and delete for that page
  if (!isChecked) {
    const writeEl  = document.getElementById(`kp-${roleKey}-${pageKey}-write`);
    const deleteEl = document.getElementById(`kp-${roleKey}-${pageKey}-delete`);
    if (writeEl)  { writeEl.checked  = false; writeEl.disabled  = true; }
    if (deleteEl) { deleteEl.checked = false; deleteEl.disabled = true; }
  } else {
    const writeEl  = document.getElementById(`kp-${roleKey}-${pageKey}-write`);
    const deleteEl = document.getElementById(`kp-${roleKey}-${pageKey}-delete`);
    if (writeEl)  writeEl.disabled  = false;
    if (deleteEl) deleteEl.disabled = false;
  }
}

async function saveRolePermissions() {
  const perms = {};
  const writePerms = {};
  const deletePerms = {};
  for (const role of PERM_ROLES) {
    perms[role.key] = PERM_PAGES
      .filter(page => isPermForced(role.key, page.key) || document.getElementById(`kp-${role.key}-${page.key}-read`)?.checked)
      .map(page => page.key);
    writePerms[role.key] = PERM_PAGES
      .filter(page => document.getElementById(`kp-${role.key}-${page.key}-write`)?.checked)
      .map(page => page.key);
    deletePerms[role.key] = PERM_PAGES
      .filter(page => document.getElementById(`kp-${role.key}-${page.key}-delete`)?.checked)
      .map(page => page.key);
  }
  const msg = document.getElementById('ks-perms-save-msg');
  const res = await apiPost('settings', { kpsc_role_permissions: perms, kpsc_write_permissions: writePerms, kpsc_delete_permissions: deletePerms });
  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
  } else {
    S.rolePermissions = perms;
    S.writePermissions = writePerms;
    S.deletePermissions = deletePerms;
    msg.className = 'k-settings-msg k-msg-ok';
    msg.textContent = 'Role permissions saved.';
  }
  msg.style.display = 'block';
  setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
}

async function resetRolePermissions() {
  if (!confirm('Reset all role permissions to defaults? This will undo any customisations.')) return;
  const msg = document.getElementById('ks-perms-save-msg');
  const res = await apiPost('settings', { kpsc_role_permissions: KPSC_PERMISSIONS, kpsc_write_permissions: KPSC_WRITE_PERMISSIONS, kpsc_delete_permissions: KPSC_DELETE_PERMISSIONS });
  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
    msg.style.display = 'block';
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
  } else {
    S.rolePermissions = null;
    S.writePermissions = null;
    S.deletePermissions = null;
    await renderSettings(document.getElementById('kpsc-main'));
  }
}

// ── PROJECTS ─────────────────────────────────────────────────────

function canManageProjects() {
  const role = String(S.user?.role || '').toLowerCase();
  return ['acting_chairman','general_secretary','financial_secretary','treasurer','it_admin'].includes(role);
}

const PROJECT_STATUSES = [
  { value: 'proposed',    label: 'Proposed',    cls: 'badge-gray' },
  { value: 'approved',    label: 'Approved',    cls: 'badge-blue' },
  { value: 'in_progress', label: 'In Progress', cls: 'badge-amber' },
  { value: 'completed',   label: 'Completed',   cls: 'badge-green' },
  { value: 'cancelled',   label: 'Cancelled',   cls: 'badge-red' },
];

const PROJECT_PRIORITIES = [
  { value: 'high',   label: 'High',   cls: 'badge-red' },
  { value: 'medium', label: 'Medium', cls: 'badge-amber' },
  { value: 'low',    label: 'Low',    cls: 'badge-gray' },
];

function projectStatusConfig(status) {
  return PROJECT_STATUSES.find(s => s.value === status) || { label: status, cls: 'badge-gray' };
}

function projectPriorityConfig(priority) {
  return PROJECT_PRIORITIES.find(p => p.value === priority) || { label: priority, cls: 'badge-gray' };
}

async function renderProjects(main) {
  const res = await apiGet('kpsc-projects');
  if (res?.error) throw new Error(res.error);
  S.projects = Array.isArray(res) ? res : [];
  const canManage = canManageProjects();
  const total = S.projects.length;
  const totalCost = S.projects.reduce((s,p) => s + Number(p.estimatedCost || 0), 0);
  const byStatus = {};
  for (const p of S.projects) byStatus[p.status] = (byStatus[p.status] || 0) + 1;

  const filterBtns = [
    { key: 'all', label: 'All' },
    { key: 'proposed', label: 'Proposed' },
    { key: 'approved', label: 'Approved' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
  ];
  const filtered = S.projectsFilter === 'all'
    ? S.projects
    : S.projects.filter(p => p.status === S.projectsFilter);

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>Church Projects</h2>
        ${canManage ? `<button class="kbtn kbtn-primary" onclick="Kpsc.openProjectModal()">+ Add Project</button>` : ''}
      </div>
      <p class="k-page-hint">Track planned and ongoing church projects. Visible to all committee members.</p>
      <div class="k-dash-stats" style="grid-template-columns:repeat(3,1fr)">
        <div class="k-stat"><div class="k-stat-val">${total}</div><div class="k-stat-lbl">Total Projects</div></div>
        <div class="k-stat"><div class="k-stat-val">${byStatus.in_progress || 0}</div><div class="k-stat-lbl">In Progress</div></div>
        <div class="k-stat k-stat-highlight"><div class="k-stat-val">₦${totalCost.toLocaleString('en-NG')}</div><div class="k-stat-lbl">Total Budget</div></div>
      </div>
      <div class="k-tabs" style="margin-bottom:16px">
        ${filterBtns.map(f => `<button class="k-tab ${S.projectsFilter === f.key ? 'active' : ''}" onclick="Kpsc.setProjectsFilter('${f.key}')">${f.label}${byStatus[f.key] ? ` (${byStatus[f.key]})` : ''}</button>`).join('')}
      </div>
      <div id="kpsc-projects-list">${renderProjectsList(filtered, canManage)}</div>
    </div>`;
}

function renderProjectsList(projects, canManage) {
  if (!projects.length) return `<div class="k-empty">No projects found.</div>`;
  return `<div class="k-meeting-list">${projects.map(p => {
    const sc = projectStatusConfig(p.status);
    const pc = projectPriorityConfig(p.priority);
    const progress = p.estimatedCost > 0 && p.actualCost > 0
      ? Math.min(100, Math.round((p.actualCost / p.estimatedCost) * 100)) : null;
    return `
      <div class="k-meeting-card" style="position:relative">
        ${canManage ? cardCtxMenu('proj-' + p.id,
          { label: '✏️ Edit',   onclick: `Kpsc.openProjectModal('${p.id}')` },
          { label: '🗑 Delete', onclick: `Kpsc.deleteProject('${p.id}')`, danger: true },
        ) : ''}
        <div class="k-mc-top">
          <div style="flex:1">
            <div class="k-mc-title" style="padding-right:${canManage ? '28px' : '0'}">${esc(p.title)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              <span class="kbadge ${sc.cls}">${sc.label}</span>
              <span class="kbadge ${pc.cls}">⚡ ${pc.label} Priority</span>
              ${p.source === 'ai_extracted' ? `<span class="kbadge badge-blue">🤖 AI extracted</span>` : ''}
            </div>
            ${p.description ? `<div class="k-page-hint" style="margin-top:8px;font-size:13px">${esc(p.description)}</div>` : ''}
            <div class="k-mc-meta" style="margin-top:8px">
              ${p.estimatedCost ? `<span>Estimated: ₦${Number(p.estimatedCost).toLocaleString('en-NG')}</span>` : ''}
              ${p.actualCost ? `<span>Actual: ₦${Number(p.actualCost).toLocaleString('en-NG')}</span>` : ''}
              ${p.targetDate ? `<span>Target: ${esc(fmtDate(p.targetDate))}</span>` : ''}
            </div>
            ${progress !== null ? `
              <div class="k-progress-row" style="margin-top:8px">
                <div class="k-progress-bar-bg"><div class="k-progress-bar" style="width:${progress}%;background:${p.status === 'completed' ? 'var(--green)' : 'var(--navy)'}"></div></div>
                <span class="k-progress-label">${progress}% funded</span>
              </div>` : ''}
          </div>
        </div>
        ${canManage ? `
          <div class="k-proj-card-actions">
            <select class="k-input k-input-sm" style="width:auto;padding:4px 8px" onchange="Kpsc.changeProjectStatus('${p.id}', this.value)">
              ${PROJECT_STATUSES.map(s => `<option value="${s.value}" ${p.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>` : ''}
      </div>`;
  }).join('')}</div>`;
}

function setProjectsFilter(filter) {
  S.projectsFilter = filter;
  const canManage = canManageProjects();
  const filtered = filter === 'all' ? S.projects : S.projects.filter(p => p.status === filter);
  const el = document.getElementById('kpsc-projects-list');
  if (el) el.innerHTML = renderProjectsList(filtered, canManage);
  document.querySelectorAll('.k-tab').forEach(b => {
    if (b.getAttribute('onclick')?.includes(`'${filter}'`)) b.classList.add('active');
    else b.classList.remove('active');
  });
}

function openProjectModal(id = null) {
  const existing = id ? S.projects.find(p => p.id === id) : null;
  document.getElementById('kpsc-project-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'kpsc-project-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title">${existing ? 'Edit Project' : 'New Project'}</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closeProjectModal()">✕</button>
      </div>
      <div class="k-modal-body">
        <label class="k-label">Project Title *</label>
        <input id="kprj-title" class="k-input" value="${esc(existing?.title || '')}" placeholder="e.g. Church Hall Renovation" />
        <label class="k-label">Description</label>
        <textarea id="kprj-desc" class="k-input k-textarea" style="min-height:70px">${esc(existing?.description || '')}</textarea>
        <label class="k-label">Estimated Cost (₦)</label>
        <input id="kprj-est-cost" type="number" min="0" class="k-input" value="${Number(existing?.estimatedCost || 0)}" />
        <label class="k-label">Actual/Spent So Far (₦)</label>
        <input id="kprj-actual-cost" type="number" min="0" class="k-input" value="${Number(existing?.actualCost || 0)}" />
        <label class="k-label">Priority</label>
        <select id="kprj-priority" class="k-input">
          ${PROJECT_PRIORITIES.map(p => `<option value="${p.value}" ${(existing?.priority||'medium')===p.value?'selected':''}>${p.label}</option>`).join('')}
        </select>
        <label class="k-label">Status</label>
        <select id="kprj-status" class="k-input">
          ${PROJECT_STATUSES.map(s => `<option value="${s.value}" ${(existing?.status||'proposed')===s.value?'selected':''}>${s.label}</option>`).join('')}
        </select>
        <label class="k-label">Target Completion Date</label>
        <input id="kprj-target-date" type="date" class="k-input" value="${esc(existing?.targetDate || '')}" />
        <label class="k-label">Notes</label>
        <textarea id="kprj-notes" class="k-input k-textarea" style="min-height:60px">${esc(existing?.notes || '')}</textarea>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveProject('${existing?.id || ''}', this)">Save Project</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function closeProjectModal() {
  document.getElementById('kpsc-project-modal')?.remove();
}

async function saveProject(id, btn) {
  const title = document.getElementById('kprj-title')?.value.trim() || '';
  if (!title) { showToast('Project title is required.', 'warn'); return; }
  btn.disabled = true;
  const payload = {
    title,
    description: document.getElementById('kprj-desc')?.value.trim() || '',
    estimatedCost: Number(document.getElementById('kprj-est-cost')?.value || 0),
    actualCost: Number(document.getElementById('kprj-actual-cost')?.value || 0),
    priority: document.getElementById('kprj-priority')?.value || 'medium',
    status: document.getElementById('kprj-status')?.value || 'proposed',
    targetDate: document.getElementById('kprj-target-date')?.value || '',
    notes: document.getElementById('kprj-notes')?.value.trim() || '',
    createdBy: S.user?.name || '',
  };
  const res = id ? await apiPut(`kpsc-projects/${id}`, payload) : await apiPost('kpsc-projects', payload);
  btn.disabled = false;
  if (res?.error) { showToast(res.error, 'error'); return; }
  closeProjectModal();
  await renderProjects(document.getElementById('kpsc-main'));
  showToast('Project saved.', 'success');
}

async function changeProjectStatus(id, status) {
  const res = await apiPut(`kpsc-projects/${id}`, { status });
  if (res?.error) { showToast(res.error, 'error'); return; }
  const idx = S.projects.findIndex(p => p.id === id);
  if (idx >= 0) S.projects[idx] = res;
  showToast('Project status updated.', 'success');
}

async function deleteProject(id) {
  if (!confirm('Delete this project?')) return;
  const res = await apiDelete(`kpsc-projects/${id}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  await renderProjects(document.getElementById('kpsc-main'));
  showToast('Project deleted.', 'success');
}

async function extractProjectsFromMeetingUI(meetingId, btn) {
  if (!meetingId) return;
  btn.disabled = true;
  btn.textContent = 'Extracting…';
  const res = await apiPost('kpsc-extract-projects', { meetingId, createdBy: S.user?.name || '' });
  btn.disabled = false;
  btn.textContent = '🤖 Extract Projects';
  if (res?.error) { showToast(res.error, 'error'); return; }
  if (!res.extracted) { showToast('No projects found in this meeting.', 'info'); return; }
  showToast(`${res.extracted} project(s) extracted and added to Projects.`, 'success');
}

// ── MEETING UPLOAD NOTES ──────────────────────────────────────────

function setMeetingTab(tab) {
  S._meetingTab = tab;
  persistMeetingUiState();
  const recPanel   = document.getElementById('km-rec-panel');
  const audioPanel = document.getElementById('km-audio-panel');
  const uploadPanel = document.getElementById('km-upload-panel');
  if (recPanel)   recPanel.style.display   = tab === 'record' ? '' : 'none';
  if (audioPanel) audioPanel.style.display = tab === 'audio'  ? '' : 'none';
  if (uploadPanel) uploadPanel.style.display = tab === 'upload' ? '' : 'none';
  document.querySelectorAll('.k-tab').forEach(b => {
    const onclick = b.getAttribute('onclick') || '';
    b.classList.toggle('active', onclick.includes(`'${tab}'`));
  });
}

function getSelectedImageFiles(input) {
  return Array.from(input?.files || []).filter(isImageFile);
}

function isImageFile(file) {
  return /^image\//i.test(file?.type || '') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file?.name || '');
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(String(e.target?.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderNotesPreview(previewEl, files, actionHandler, statusElementId = 'km-ocr-status') {
  if (!previewEl) return;
  if (!files.length) { previewEl.innerHTML = ''; return; }
  const dataUrls = await Promise.all(files.map(readFileAsDataURL));
  const total = dataUrls.length;
  const thumbs = dataUrls.map((url, idx) => `
    <img src="${esc(url)}" style="width:100%;border-radius:10px;border:1px solid var(--border)" alt="Handwritten notes photo ${idx + 1} of ${total}" />
  `).join('');
  const cols = files.length > 1 ? 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr));' : '';
  previewEl.innerHTML = `
    <div style="display:grid;${cols}gap:10px;margin-bottom:12px">${thumbs}</div>
    <div class="k-room-actions">
      <button class="kbtn kbtn-primary" onclick="${actionHandler}">🤖 Extract Text with AI</button>
    </div>
    <div id="${statusElementId}"></div>`;
}

async function ocrNotesImages(files) {
  const items = await Promise.all(files.map(async (file) => {
    try {
      const dataUrl = await readFileAsDataURL(file);
      const base64 = dataUrl.split(',')[1] || '';
      if (!base64) return { transcript: '', error: `Failed to read ${file.name || 'image'}` };
      const mimeType = file.type || 'image/jpeg';
      const res = await apiPost('kpsc-ocr-notes', { imageBase64: base64, mimeType });
      return { transcript: String(res?.transcript || '').trim(), error: res?.error ? String(res.error) : '' };
    } catch (e) {
      return { transcript: '', error: e?.message || 'OCR failed' };
    }
  }));
  const transcripts = items.map(i => i.transcript).filter(Boolean);
  const errors = items.map(i => i.error).filter(Boolean);
  return {
    transcript: transcripts.join('\n\n'),
    successCount: transcripts.length,
    totalCount: files.length,
    errors,
  };
}

async function previewNotesPhoto(input) {
  const preview = document.getElementById('km-notes-preview');
  const files = getSelectedImageFiles(input);
  if (!files.length) { if (preview) preview.innerHTML = ''; return; }
  await renderNotesPreview(preview, files, 'Kpsc.ocrNotesPhoto()', 'km-ocr-status');
}

async function ocrNotesPhoto() {
  const input = document.getElementById('km-notes-photo');
  const files = getSelectedImageFiles(input);
  if (!files.length) return;
  const status = document.getElementById('km-ocr-status');
  if (status) status.innerHTML = `<div class="k-loading" style="padding:16px">🤖 Analysing ${files.length} handwritten note photo${files.length === 1 ? '' : 's'}…</div>`;

  try {
    const ocr = await ocrNotesImages(files);
    if (!ocr.transcript) {
      const details = ocr.errors.length ? ` Details: ${ocr.errors.slice(0, 3).join(' | ')}` : '';
      if (status) status.innerHTML = `<div class="k-error-box">${esc((ocr.errors[0] || 'No text could be extracted. Please ensure the images are clear.') + details)}</div>`;
      return;
    }
    appendTranscriptText(ocr.transcript);
    showToast('Handwritten notes transcribed and saved to draft.', 'success');
    const note = ocr.errors.length ? ` (${ocr.errors.length} photo${ocr.errors.length === 1 ? '' : 's'} skipped due to OCR errors.)` : '';
    if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Extracted text from ${ocr.successCount} of ${ocr.totalCount} photo${ocr.totalCount === 1 ? '' : 's'}${note} Saved to draft — review, then click <strong>End Meeting</strong> below to proceed.</div>`;
  } catch (e) {
    if (status) status.innerHTML = `<div class="k-error-box">Error: ${esc(e.message)}</div>`;
  }
}

// ── MEETING UPLOAD AUDIO ──────────────────────────────────────────

const NOTES_SEPARATOR = "\n\n---\nSecretary's Handwritten Notes:\n";

function previewAudioFile(input) {
  const file = input.files?.[0];
  const preview = document.getElementById('km-audio-preview');
  const status  = document.getElementById('km-audio-status');
  if (!preview) return;
  if (!file) { preview.innerHTML = ''; if (status) status.innerHTML = ''; return; }
  const mb = (file.size / 1024 / 1024).toFixed(1);
  const tooBig = file.size > 24 * 1024 * 1024;
  preview.innerHTML = `
    <div style="background:var(--surface,#f8fafc);border:1px solid ${tooBig ? '#fca5a5' : 'var(--border)'};border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:10px">
      🎵 <strong>${esc(file.name)}</strong> &nbsp;·&nbsp; ${mb} MB
      ${tooBig ? `<span style="color:#dc2626;font-weight:600;margin-left:6px">— too large</span>` : ''}
    </div>
    ${tooBig ? `
    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px;font-size:13px;line-height:1.6;margin-bottom:10px">
      <strong style="color:#dc2626">⚠️ File exceeds the 25 MB limit.</strong><br>
      Compress it first using the free <strong>M4A Audio Compressor</strong> app (Play Store), then re-upload.<br><br>
      <strong>Recommended settings:</strong><br>
      &nbsp;• Bit rate: <strong>32k</strong><br>
      &nbsp;• Sample rate: <strong>16000 Hz / 16 kHz</strong><br>
      &nbsp;• Channels: <strong>1 (Mono)</strong><br>
      &nbsp;• Profile: <strong>HE_AAC</strong><br><br>
      <span style="color:#6b7280">A 78 MB file compresses to ≈ 10 MB with these settings — well under the limit with no loss in transcription accuracy.</span>
    </div>` : `
    <div class="k-room-actions">
      <button class="kbtn kbtn-primary" onclick="Kpsc.transcribeAudioFile()">🤖 Transcribe with AI</button>
    </div>`}`;
  if (status) status.innerHTML = '';
}

async function transcribeAudioFile() {
  const audioInput = document.getElementById('km-audio-file');
  const audioFile  = audioInput?.files?.[0];
  const status     = document.getElementById('km-audio-status');
  if (!audioFile) { showToast('Please select an audio file first.', 'error'); return; }

  const useDiarize = document.getElementById('km-audio-diarize')?.checked;

  // Clear any previous speaker map.
  const speakerMapEl = document.getElementById('km-speaker-map');
  if (speakerMapEl) speakerMapEl.innerHTML = '';

  // ── Diarization path ──────────────────────────────────────────
  if (useDiarize) {
    try {
      const diarizedTranscript = await transcribeAudioWithDiarization_UI(audioFile, status);
      if (diarizedTranscript !== null) {
        // Plain transcript returned (no utterances) — treat same as regular.
        appendTranscriptText(diarizedTranscript);
        if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Audio transcribed and saved. Review the transcript, then click <strong>End Meeting</strong> below to proceed.</div>`;
        showToast('Audio transcribed!', 'success');
      }
      // If null is returned, speaker assignment UI is showing — no further action here.
    } catch (e) {
      if (status) status.innerHTML = `<div class="k-error-box">Error: ${esc(e.message)}</div>`;
    }
    return;
  }

  // ── Standard (non-diarized) path ──────────────────────────────

  const notesInput = document.getElementById('km-audio-notes-photo');
  const notesFiles = getSelectedImageFiles(notesInput);

  const sizeMB = audioFile.size / 1024 / 1024;
  // Rough heuristic: the OpenAI transcribe endpoints process audio in
  // a few seconds plus ~2s per MB on the server side once received.
  // Used purely for the "estimated time left" hint — actual completion
  // is what counts.
  const estProcessSec = Math.max(6, Math.round(sizeMB * 2));

  let uploadStartedAt = Date.now();
  let processStartedAt = 0;
  let phase = 'upload';
  let lastBytes = 0;
  let lastTickAt = uploadStartedAt;

  const tick = setInterval(() => {
    if (phase !== 'process') return;
    const elapsed = Math.round((Date.now() - processStartedAt) / 1000);
    const remaining = Math.max(0, estProcessSec - elapsed);
    renderTranscribeProgress(status, {
      stage: '🤖 AI is transcribing your audio…',
      elapsedSec: elapsed,
      etaSec: remaining,
      message: 'The audio is uploaded; OpenAI is now generating the transcript.',
      sub: `Typical wait: ~${formatDurationSec(estProcessSec)} for a ${sizeMB.toFixed(1)} MB file. The transcript will be saved to your draft automatically.`,
    });
  }, 1000);

  try {
    renderTranscribeProgress(status, {
      stage: '📤 Uploading audio…',
      percent: 0,
      message: 'Preparing to upload to the server.',
      sub: `${sizeMB.toFixed(1)} MB · ${esc(audioFile.name)}`,
    });

    // OCR can run while the audio uploads — they hit different endpoints.
    const ocrPromise = notesFiles.length ? ocrNotesImages(notesFiles) : Promise.resolve(null);

    const audioRes = await uploadAudioWithRetry(
      'kpsc-transcribe-audio',
      audioFile,
      audioFile.type || 'audio/webm',
      ({ loaded, total, uploaded }) => {
        const now = Date.now();
        const dt = (now - lastTickAt) / 1000;
        const bps = dt > 0 ? (loaded - lastBytes) / dt : 0;
        lastBytes = loaded; lastTickAt = now;
        if (uploaded) {
          phase = 'process';
          processStartedAt = Date.now();
          renderTranscribeProgress(status, {
            stage: '🤖 AI is transcribing your audio…',
            elapsedSec: 0,
            etaSec: estProcessSec,
            message: 'Upload complete. OpenAI is now generating the transcript.',
            sub: 'You can keep this tab open — the transcript will be saved automatically.',
          });
          return;
        }
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        const remaining = bps > 0 && total > loaded ? Math.round((total - loaded) / bps) : null;
        renderTranscribeProgress(status, {
          stage: '📤 Uploading audio…',
          percent,
          elapsedSec: Math.round((now - uploadStartedAt) / 1000),
          etaSec: remaining,
          message: bps > 0 ? `Speed: ${formatBytesPerSec(bps)}` : 'Connecting…',
          sub: `${(loaded / 1024 / 1024).toFixed(1)} / ${sizeMB.toFixed(1)} MB uploaded`,
        });
      },
      (attempt, maxAttempts, waitMs, err) => {
        renderTranscribeProgress(status, {
          stage: `📡 Network hiccup — retrying upload (attempt ${attempt}/${maxAttempts})`,
          kind: 'warn',
          message: `Waiting ${Math.round(waitMs / 1000)}s before retrying. The retry happens automatically; no need to re-pick the file.`,
          sub: err?.message ? `Last error: ${err.message}` : '',
        });
        lastBytes = 0; lastTickAt = Date.now(); uploadStartedAt = Date.now();
        phase = 'upload';
      }
    );

    clearInterval(tick);

    handleKpscAuthFailure(audioRes);

    if (audioRes?.error && !audioRes?.transcript) {
      if (status) status.innerHTML = `<div class="k-error-box">${esc(audioRes.error)}</div>`;
      return;
    }

    const audioText = (audioRes?.transcript || '').trim();
    if (!audioText) {
      if (status) status.innerHTML = `<div class="k-error-box">No speech was detected in the audio file. Please check the recording and try again.</div>`;
      return;
    }

    // Wait for OCR if it was kicked off in parallel.
    const ocrRes = await ocrPromise;
    const ocrText = String(ocrRes?.transcript || '').trim();
    const ocrFailed = notesFiles.length > 0 && !ocrText;
    const combined = ocrText
      ? `${audioText}${NOTES_SEPARATOR}${ocrText}`
      : audioText;

    appendTranscriptText(combined);

    let successMsg = ocrText
      ? `✓ Audio transcribed and handwritten notes combined successfully (${ocrRes.successCount}/${ocrRes.totalCount} photo${ocrRes.totalCount === 1 ? '' : 's'}).`
      : '✓ Audio transcribed successfully.';
    if (ocrFailed) {
      const reason = ocrRes?.errors?.[0] || 'could not extract text from any notes photo';
      successMsg += ` (Note: handwritten notes were skipped — ${esc(reason)}.)`;
    } else if (ocrRes?.errors?.length) {
      successMsg += ` (${ocrRes.errors.length} photo${ocrRes.errors.length === 1 ? '' : 's'} skipped due to OCR errors.)`;
    }
    if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">${successMsg} Saved to draft — review the transcript, then click <strong>End Meeting</strong> below to proceed.</div>`;
    showToast(ocrText ? 'Audio and notes combined! Saved to draft.' : 'Audio transcribed and saved to draft.', 'success');
  } catch (e) {
    clearInterval(tick);
    if (status) status.innerHTML = `<div class="k-error-box">Transcription failed: ${esc(e?.message || String(e))}<br><span style="font-size:12px">Your file is still selected above — tap <strong>Transcribe with AI</strong> again to retry.</span></div>`;
  } finally {
    clearInterval(tick);
  }
}

async function previewAudioNotesPhoto(input) {
  const preview = document.getElementById('km-audio-notes-preview');
  const files = getSelectedImageFiles(input);
  if (!preview) return;
  if (!files.length) { preview.innerHTML = ''; return; }
  const dataUrls = await Promise.all(files.map(readFileAsDataURL));
  const total = dataUrls.length;
  const thumbs = dataUrls.map((url, idx) => `<img src="${esc(url)}" style="width:100%;border-radius:10px;border:1px solid var(--border)" alt="Audio notes photo ${idx + 1} of ${total}" />`).join('');
  const cols = files.length > 1 ? 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr));' : '';
  preview.innerHTML = `
    <div style="display:grid;${cols}gap:10px;margin-bottom:10px">${thumbs}</div>
    <div class="k-room-actions">
      <button class="kbtn kbtn-primary kbtn-sm" onclick="Kpsc.ocrNotesAndAppend(this)">📝 Extract text with AI</button>
    </div>
    <div id="km-notes-ocr-status" style="margin-top:8px"></div>`;
}

async function ocrNotesAndAppend(btn) {
  const notesInput = document.getElementById('km-audio-notes-photo');
  const files = getSelectedImageFiles(notesInput);
  if (!files.length) { showToast('No notes photos selected.', 'warn'); return; }
  const statusEl = document.getElementById('km-notes-ocr-status');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Extracting…';
  if (statusEl) statusEl.innerHTML = `<div style="color:var(--text2);font-size:13px">🔍 Extracting text from ${files.length} photo${files.length > 1 ? 's' : ''}…</div>`;
  try {
    const ocrRes = await ocrNotesImages(files);
    const ocrText = String(ocrRes?.transcript || '').trim();
    if (!ocrText) {
      if (statusEl) statusEl.innerHTML = `<div class="k-error-box">Could not extract text from the notes photo${files.length > 1 ? 's' : ''}. Make sure the handwriting is clear and well-lit.</div>`;
    } else {
      appendTranscriptText(`${NOTES_SEPARATOR}${ocrText}`);
      const count = `${ocrRes?.successCount || files.length}/${files.length}`;
      if (statusEl) statusEl.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:10px;font-size:13px;color:#065f46">✓ Notes text extracted (${count} photo${files.length > 1 ? 's' : ''}) and added to the transcript draft.</div>`;
      showToast('Notes text extracted and added to draft.', 'success');
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<div class="k-error-box">OCR failed: ${esc(e?.message || String(e))}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── MEETING LIVE RECORDING — also upload notes ────────────────────

async function previewRecNotesPhoto(input) {
  const preview = document.getElementById('km-rec-notes-preview');
  const files = getSelectedImageFiles(input);
  if (!preview) return;
  if (!files.length) { preview.innerHTML = ''; return; }
  await renderNotesPreview(preview, files, 'Kpsc.ocrRecNotesPhoto()', 'km-rec-notes-status');
}

async function ocrRecNotesPhoto() {
  const input = document.getElementById('km-rec-notes-photo');
  const files = getSelectedImageFiles(input);
  if (!files.length) return;
  const status = document.getElementById('km-rec-notes-status');
  if (status) status.innerHTML = `<div class="k-loading" style="padding:16px">🤖 Analysing ${files.length} handwritten note photo${files.length === 1 ? '' : 's'}…</div>`;

  try {
    const ocr = await ocrNotesImages(files);
    if (!ocr.transcript) {
      const details = ocr.errors.length ? ` Details: ${ocr.errors.slice(0, 3).join(' | ')}` : '';
      if (status) status.innerHTML = `<div class="k-error-box">${esc((ocr.errors[0] || 'No text could be extracted. Please ensure the images are clear.') + details)}</div>`;
      return;
    }

    appendTranscriptText(ocr.transcript);
    showToast('Handwritten notes appended and saved to draft.', 'success');
    const note = ocr.errors.length ? ` (${ocr.errors.length} photo${ocr.errors.length === 1 ? '' : 's'} skipped due to OCR errors.)` : '';
    if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Extracted text from ${ocr.successCount} of ${ocr.totalCount} photo${ocr.totalCount === 1 ? '' : 's'}${note} and saved to draft.</div>`;
  } catch (e) {
    if (status) status.innerHTML = `<div class="k-error-box">Error: ${esc(e.message)}</div>`;
  }
}

// ── FINANCE PDF RECONCILIATION ────────────────────────────────────

function setReconciliationTab(tab) {
  const pdfPanel = document.getElementById('krec-pdf-panel');
  const jsonPanel = document.getElementById('krec-json-panel');
  const pdfTab = document.getElementById('krec-tab-pdf');
  const jsonTab = document.getElementById('krec-tab-json');
  if (pdfPanel) pdfPanel.style.display = tab === 'pdf' ? '' : 'none';
  if (jsonPanel) jsonPanel.style.display = tab !== 'pdf' ? '' : 'none';
  if (pdfTab) pdfTab.classList.toggle('active', tab === 'pdf');
  if (jsonTab) jsonTab.classList.toggle('active', tab !== 'pdf');
}

const PDF_RECONCILIATION_STEPS = [
  { label: 'Extracting text', key: 'extract' },
  { label: 'Parsing transactions', key: 'parse' },
  { label: 'Matching to ledger', key: 'match' },
];

function renderPdfStepper(stepperEl, activeIdx, errorIdx, errorMsg) {
  if (!stepperEl) return;
  stepperEl.style.display = '';
  stepperEl.innerHTML = `<div class="krec-stepper">${PDF_RECONCILIATION_STEPS.map((s, i) => {
    let cls = 'krec-step';
    let icon = String(i + 1);
    if (i < activeIdx) { cls += ' krec-step-done'; icon = '✓'; }
    else if (i === activeIdx) { cls += ' krec-step-active'; }
    if (i === errorIdx) { cls += ' krec-step-error'; icon = '✕'; }
    return `<div class="${cls}"><span class="krec-step-pip">${icon}</span><span class="krec-step-label">${s.label}</span></div>${i < PDF_RECONCILIATION_STEPS.length - 1 ? '<div class="krec-step-connector"></div>' : ''}`;
  }).join('')}${errorMsg ? `<p class="krec-step-error-msg">${esc(errorMsg)}</p>` : ''}</div>`;
}

async function runPdfReconciliation(btn) {
  const input = document.getElementById('krec-pdf-input');
  const file = input?.files?.[0];
  if (!file) { showToast('Please select a PDF file first.', 'warn'); return; }
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    showToast('Please upload a PDF file.', 'warn'); return;
  }

  btn.disabled = true;
  btn.textContent = 'Processing…';

  const out = document.getElementById('krec-result');
  const stepperEl = document.getElementById('krec-stepper');
  if (out) out.innerHTML = '';
  renderPdfStepper(stepperEl, 0, -1, null);

  const resetBtn = () => {
    btn.disabled = false;
    btn.textContent = '🤖 Upload & Reconcile';
  };
  const stepError = (stepIdx, msg) => {
    renderPdfStepper(stepperEl, stepIdx, stepIdx, msg);
    resetBtn();
  };

  try {
    // Step 1: Extract text
    const pdfText = await extractPdfText(file);
    if (!pdfText.trim()) {
      stepError(0, 'No text could be extracted. This PDF may be a scanned image — use the JSON tab to paste transactions manually, or ask your bank for a digital statement.');
      return;
    }

    // Step 2: Parse transactions
    renderPdfStepper(stepperEl, 1, -1, null);
    const parseRes = await apiPost('kpsc-parse-statement', { statementText: pdfText });
    if (parseRes?.error) {
      stepError(1, parseRes.error);
      return;
    }
    const items = parseRes.items || [];
    if (!items.length) {
      stepError(1, 'No transactions found in the PDF. Check the file content or try the JSON tab.');
      return;
    }

    // Step 3: Reconcile
    renderPdfStepper(stepperEl, 2, -1, null);
    const recRes = await apiPost('kpsc-reconciliation', {
      statementYear: S.financeYear,
      statementMonth: S.financeMonth || 0,
      statementItems: items,
      createdBy: S.user?.name || '',
    });

    if (recRes?.error) {
      stepError(2, recRes.error);
      return;
    }

    // All done — mark all steps complete and show results
    renderPdfStepper(stepperEl, 3, -1, null);
    showToast(`PDF parsed: ${items.length} transaction(s) found.`, 'success');
    renderReconciliationResult(out, recRes);
    resetBtn();
  } catch (e) {
    showToast('Error processing PDF: ' + e.message, 'error');
    if (stepperEl) stepperEl.style.display = 'none';
    resetBtn();
    if (out) out.innerHTML = '';
  }
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText;
}

function renderReconciliationResult(out, res) {
  if (!out) return;
  const s = res.summary || {};
  const matches = Array.isArray(res.matches) ? res.matches : [];
  const unmatchedSt = Array.isArray(res.unmatchedStatement) ? res.unmatchedStatement : [];
  const unmatchedFin = Array.isArray(res.unmatchedFinance) ? res.unmatchedFinance : [];
  out.innerHTML = `
    <div class="k-rec-summary">
      <span class="k-rec-chip k-rec-matched">✓ ${s.matchedCount || 0} Matched</span>
      <span class="k-rec-chip k-rec-unmatched">⚠ ${s.unmatchedStatementCount || 0} Statement unmatched</span>
      <span class="k-rec-chip k-rec-missing">✗ ${s.unmatchedFinanceCount || 0} Records unmatched</span>
    </div>
    ${matches.length ? `
      <h4 class="k-sec-title" style="margin:12px 0 8px">Matched Items</h4>
      <div class="k-rec-table-wrap">
        <table class="k-rec-table">
          <thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Ref</th><th>Matched Record</th></tr></thead>
          <tbody>${matches.map(m=>`<tr class="k-rec-matched-row"><td>${esc(m.statementItem?.date||'')}</td><td>₦${Number(m.statementItem?.amount||0).toLocaleString('en-NG')}</td><td>${esc(m.statementItem?.type||'')}</td><td>${esc(m.statementItem?.reference||'—')}</td><td>${esc(fmtDate(m.financeEntry?.date||''))} — ${esc(m.financeEntry?.narration||m.financeEntry?.reference||'—')}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
    ${unmatchedSt.length ? `
      <h4 class="k-sec-title" style="margin:12px 0 8px;color:var(--amber)">Unmatched Statement Items</h4>
      <div class="k-rec-table-wrap">
        <table class="k-rec-table">
          <thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Reference</th></tr></thead>
          <tbody>${unmatchedSt.map(i=>`<tr class="k-rec-unmatched-row"><td>${esc(i.date||'')}</td><td>₦${Number(i.amount||0).toLocaleString('en-NG')}</td><td>${esc(i.type||'')}</td><td>${esc(i.reference||'—')}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
    <p class="k-hint" style="margin-top:12px">⚠️ Requires officer review before filing.</p>`;
}

// ── PRINT MINUTES ─────────────────────────────────────────────────

function printMinutes(meetingId) {
  const meeting = S.activeMeeting;
  if (!meeting?.minutesMarkdown) { showToast('No minutes to print. Process the meeting first.', 'warn'); return; }
  if (!meeting?.reviewedAt) { showToast('Approve and save the review before printing.', 'warn'); return; }

  function mdToHtml(md) {
    if (!md) return '';
    const lines = md.split('\n');
    const out = [];
    let inUl = false;
    let inOl = false;

    function escPrint(s) {
      return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function applyInlinePrint(escaped) {
      // Links: only allow https:// URLs
      escaped = escaped.replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      // Inline code
      escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
      // Bold
      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic
      escaped = escaped.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
      escaped = escaped.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');
      return escaped;
    }

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^#{1,6}\s/.test(line)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        const level = line.match(/^(#+)/)[1].length;
        out.push(`<h${level}>${applyInlinePrint(escPrint(line.replace(/^#+\s*/, '')))}</h${level}>`);
      } else if (/^[-*]\s/.test(line)) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${applyInlinePrint(escPrint(line.replace(/^[-*]\s*/, '')))}</li>`);
      } else if (/^\d+\.\s/.test(line)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${applyInlinePrint(escPrint(line.replace(/^\d+\.\s*/, '')))}</li>`);
      } else if (/^>\s/.test(line)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        out.push(`<blockquote>${applyInlinePrint(escPrint(line.replace(/^>\s*/, '')))}</blockquote>`);
      } else if (line === '') {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        out.push('');
      } else {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        out.push(`<p>${applyInlinePrint(escPrint(line))}</p>`);
      }
    }
    if (inUl) out.push('</ul>');
    if (inOl) out.push('</ol>');
    return out.join('\n');
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${meeting.title || 'KPSC Minutes'}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; font-size: 14px; line-height: 1.8; }
    h1 { font-size: 22px; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; color: #1e3a5f; }
    h2 { font-size: 16px; color: #1e3a5f; margin-top: 24px; }
    h3 { font-size: 14px; color: #2c5282; }
    ul { padding-left: 24px; }
    li { margin-bottom: 6px; }
    .header-meta { color: #666; font-size: 12px; margin-bottom: 24px; }
    @media print { button { display:none!important; } }
  </style>
</head>
<body>
  <div class="header-meta">
    <strong>RCCG Kingdom Parish — Kingdom Parish Stewardship Committee</strong>
  </div>
  ${mdToHtml(meeting.minutesMarkdown)}
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { showToast('Pop-up blocked. Please allow pop-ups for this site.', 'warn'); return; }
  win.document.write(html);
  win.document.close();
}

// ── WHATSAPP MINUTES SHARING ───────────────────────────────────────
async function shareMinutesWhatsApp(meetingId) {
  const meeting = S.activeMeeting;
  if (!meeting?.minutesMarkdown) { showToast('No minutes to share. Process the meeting first.', 'warn'); return; }
  if (!meeting?.reviewedAt) { showToast('Approve and save the review before sharing.', 'warn'); return; }
  const date    = meeting.meetingDate || '';
  const summary = meeting.summaryShort || 'Please find the meeting minutes in the KPSC portal.';
  const resCount = (meeting.resolutions || []).length;
  const actCount = (meeting.actionItems || []).length;
  const linkRes = await apiPost(`ai-secretary-meetings/${meetingId}/public-link`, {});
  if (linkRes?.error || !linkRes?.publicUrl) {
    showToast(linkRes?.error || 'Failed to generate public minutes link.', 'error');
    return;
  }
  if (S.activeMeeting?.id === meetingId) {
    S.activeMeeting.publicShareToken = linkRes.token || '';
  }
  const meetingIdx = S.meetings.findIndex(m => m.id === meetingId);
  if (meetingIdx >= 0) {
    S.meetings[meetingIdx] = { ...S.meetings[meetingIdx], publicShareToken: linkRes.token || '' };
  }

  const msg = [
    `*KPSC Meeting Minutes — ${meeting.title || 'KPSC Meeting'}*`,
    date ? `📅 Date: ${date}` : '',
    '',
    summary,
    '',
    resCount ? `📋 Resolutions: ${resCount}` : '',
    actCount ? `✅ Action Items: ${actCount}` : '',
    `🔗 Public minutes: ${linkRes.publicUrl}`,
    '',
    'Full minutes are available at the public link above.',
  ].filter(line => line !== undefined && line !== null).join('\n').trim();

  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');

  // Mark this meeting as distributed.
  const distributedIds = S._distributedMeetingIds || [];
  if (!distributedIds.includes(meetingId)) {
    const updated = [...distributedIds, meetingId];
    S._distributedMeetingIds = updated;
    await apiPost('settings', { kpsc_distributed_meeting_ids: updated }).catch(() => {});
  }
  renderPage('meeting');
  showToast('WhatsApp message prepared. Select recipients in WhatsApp to send.', 'success');
}

async function revokeMinutesPublicLink(meetingId) {
  const role = String(S.user?.role || '').toLowerCase();
  if (role !== 'acting_chairman' && role !== 'general_secretary') {
    showToast('Only the Acting Chairman or General Secretary can revoke the public minutes link.', 'error');
    return;
  }
  const meeting = S.activeMeeting;
  if (!meeting?.publicShareToken) { showToast('No public minutes link is active for this meeting.', 'info'); return; }
  if (!confirm('Revoke the public minutes link? Anyone with the old link will lose access immediately.')) return;
  const res = await apiPost(`ai-secretary-meetings/${meetingId}/revoke-public-link`, {});
  if (res?.error) { showToast(res.error, 'error'); return; }
  if (S.activeMeeting?.id === meetingId) {
    S.activeMeeting.publicShareToken = '';
  }
  const meetingIdx = S.meetings.findIndex(m => m.id === meetingId);
  if (meetingIdx >= 0) {
    S.meetings[meetingIdx] = { ...S.meetings[meetingIdx], publicShareToken: '' };
  }
  renderPage('meeting');
  showToast('Public minutes link revoked.', 'success');
}

// ── ACTION ITEM WHATSAPP NOTIFICATIONS ────────────────────────────
function renderActionNotifications(actions, meeting) {
  const assignedActions = actions.filter(a => a.assignee && a.assignee !== 'Unassigned');
  if (!assignedActions.length) return;

  const meetingTitle = meeting?.title || 'KPSC Meeting';
  const meetingDate  = meeting?.meetingDate || '';

  // Render a notification panel below the reviewed panel.
  const notifHtml = `
    <div id="kr-action-notifications" class="k-section" style="margin-top:16px;background:var(--surface,#f8fafc);border:1.5px solid var(--border);border-radius:10px;padding:14px">
      <h4 class="k-sub-title" style="margin-top:0">📲 Notify Assignees via WhatsApp</h4>
      <p class="k-review-hint" style="margin-bottom:12px">Tap a link below to open WhatsApp with a pre-composed notification for each assigned action item. Select the recipient in WhatsApp before sending.</p>
      ${assignedActions.map((a) => {
        const msg = [
          `*KPSC Action Item — ${meetingTitle}*`,
          meetingDate ? `📅 Meeting date: ${meetingDate}` : '',
          '',
          `Dear ${a.assignee},`,
          '',
          `You have been assigned the following action item from the KPSC meeting:`,
          `📌 ${a.task}`,
          a.dueDate ? `🗓️ Due: ${a.dueDate}` : '',
          '',
          'Please update the secretary on progress at your earliest convenience.',
          '— Kingdom Parish Stewardship Committee',
        ].filter(l => l !== undefined && l !== null).join('\n').trim();
        const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <span style="font-size:13px;color:var(--text-secondary,#666);min-width:120px">👤 ${esc(a.assignee)}</span>
            <span style="font-size:13px;flex:1">${esc(a.task.slice(0, 80))}${a.task.length > 80 ? '…' : ''}</span>
            <a href="${esc(waUrl)}" target="_blank" class="kbtn kbtn-sm" style="text-decoration:none;background:#25d366;color:#fff;border-color:#25d366">💬 Send via WhatsApp</a>
          </div>`;
      }).join('')}
    </div>`;

  // Insert after the kr-panel (reviewed state).
  const panel = document.getElementById('kr-panel');
  if (panel) panel.insertAdjacentHTML('afterend', notifHtml);
}

// ── AUDIO DIARIZATION ─────────────────────────────────────────────
// State: diarized utterances for speaker assignment UI.
let _diarizedUtterances = [];
let _diarizedSpeakerCount = 0;

async function transcribeAudioWithDiarization_UI(audioFile, status) {
  const sizeMB = audioFile.size / 1024 / 1024;
  // Diarization on Deepgram is generally fast — ~1s per 10s of audio
  // after upload. Use a slightly more generous estimate than Whisper.
  const estProcessSec = Math.max(8, Math.round(sizeMB * 3));

  let uploadStartedAt = Date.now();
  let processStartedAt = 0;
  let phase = 'upload';
  let lastBytes = 0;
  let lastTickAt = uploadStartedAt;

  const tick = setInterval(() => {
    if (phase !== 'process') return;
    const elapsed = Math.round((Date.now() - processStartedAt) / 1000);
    const remaining = Math.max(0, estProcessSec - elapsed);
    renderTranscribeProgress(status, {
      stage: '🎙️ Identifying speakers and transcribing…',
      elapsedSec: elapsed,
      etaSec: remaining,
      message: 'Deepgram is running speaker diarization on the upload.',
      sub: `Typical wait: ~${formatDurationSec(estProcessSec)} for a ${sizeMB.toFixed(1)} MB file.`,
    });
  }, 1000);

  renderTranscribeProgress(status, {
    stage: '📤 Uploading audio for diarization…',
    percent: 0,
    message: 'Preparing to upload.',
    sub: `${sizeMB.toFixed(1)} MB · ${esc(audioFile.name)}`,
  });

  let res;
  try {
    res = await uploadAudioWithRetry(
      'kpsc-transcribe-audio-diarize',
      audioFile,
      audioFile.type || 'audio/webm',
      ({ loaded, total, uploaded }) => {
        const now = Date.now();
        const dt = (now - lastTickAt) / 1000;
        const bps = dt > 0 ? (loaded - lastBytes) / dt : 0;
        lastBytes = loaded; lastTickAt = now;
        if (uploaded) {
          phase = 'process';
          processStartedAt = Date.now();
          renderTranscribeProgress(status, {
            stage: '🎙️ Identifying speakers and transcribing…',
            elapsedSec: 0,
            etaSec: estProcessSec,
            message: 'Upload complete. Deepgram is now diarizing.',
          });
          return;
        }
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        const remaining = bps > 0 && total > loaded ? Math.round((total - loaded) / bps) : null;
        renderTranscribeProgress(status, {
          stage: '📤 Uploading audio for diarization…',
          percent,
          elapsedSec: Math.round((now - uploadStartedAt) / 1000),
          etaSec: remaining,
          message: bps > 0 ? `Speed: ${formatBytesPerSec(bps)}` : 'Connecting…',
          sub: `${(loaded / 1024 / 1024).toFixed(1)} / ${sizeMB.toFixed(1)} MB uploaded`,
        });
      },
      (attempt, maxAttempts, waitMs, err) => {
        renderTranscribeProgress(status, {
          stage: `📡 Network hiccup — retrying (attempt ${attempt}/${maxAttempts})`,
          kind: 'warn',
          message: `Waiting ${Math.round(waitMs / 1000)}s before retry. No need to re-pick the file.`,
          sub: err?.message ? `Last error: ${err.message}` : '',
        });
        lastBytes = 0; lastTickAt = Date.now(); uploadStartedAt = Date.now();
        phase = 'upload';
      }
    );
  } finally {
    clearInterval(tick);
  }

  handleKpscAuthFailure(res);

  if (res?.error && !res?.transcript) {
    if (status) status.innerHTML = `<div class="k-error-box">${esc(res.error)}</div>`;
    return null;
  }
  if (!res?.transcript) {
    if (status) status.innerHTML = `<div class="k-error-box">No speech was detected in the audio file.</div>`;
    return null;
  }

  // If no diarization (speakerCount is 0 or utterances missing), just return plain transcript.
  if (!res.speakerCount || !res.utterances?.length) {
    return res.transcript;
  }

  // Store utterances for speaker assignment.
  _diarizedUtterances = res.utterances || [];
  _diarizedSpeakerCount = res.speakerCount || 0;

  // Render speaker assignment UI.
  const speakerMapEl = document.getElementById('km-speaker-map');
  if (speakerMapEl) {
    const memberNames = (S.members || []).map(m => m.name).filter(Boolean);
    const speakerNums = [...new Set(_diarizedUtterances.map(u => u.speaker))].sort((a, b) => a - b);
    speakerMapEl.innerHTML = `
      <div class="k-section" style="background:var(--surface,#f8fafc);border:1.5px solid var(--border);border-radius:10px;padding:14px;margin-top:8px">
        <h4 class="k-sub-title" style="margin-top:0">🎙️ Speaker Assignment</h4>
        <p class="k-review-hint">Deepgram detected ${_diarizedSpeakerCount} speaker(s). Assign each speaker label to a committee member name. Leave blank to keep the label as-is.</p>
        ${speakerNums.map(n => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
            <span class="kbadge badge-gray" style="min-width:80px">Speaker ${n}</span>
            <input list="km-member-names" id="km-spk-name-${n}" class="k-input" style="max-width:200px" placeholder="Enter member name…" />
          </div>`).join('')}
        <datalist id="km-member-names">
          ${memberNames.map(n => `<option value="${esc(n)}">`).join('')}
        </datalist>
        <div class="k-room-actions" style="margin-top:8px">
          <button class="kbtn kbtn-primary" onclick="Kpsc.applyDiarizedTranscript()">✅ Apply Names &amp; Add to Transcript</button>
          <button class="kbtn kbtn-ghost" onclick="Kpsc.applyDiarizedTranscriptRaw()">Add Without Names</button>
        </div>
      </div>`;
  }

  if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Diarization complete — ${_diarizedSpeakerCount} speaker(s) detected. Assign names above, then click "Apply".</div>`;

  // Fire-and-forget: try to auto-fill the speaker name dropdowns by running
  // each detected speaker's audio through the voice fingerprint matcher.
  // Failures are silent (manual assignment still works) — we just light up
  // the boxes that match an enrolled member.
  autoIdentifySpeakersFromUpload(audioFile, _diarizedUtterances).catch(e => {
    console.warn('[upload-voice-id] failed:', e);
  });

  return null; // transcript will be applied via applyDiarizedTranscript()
}

// Decode an uploaded audio file in the browser, slice each detected speaker's
// first ~3.5s of speech, mono-mix, resample to 16 kHz, encode WAV, and POST
// to /api/voice-identify. Pre-fills the speaker assignment dropdowns with
// matched member names so the user only has to confirm.
async function autoIdentifySpeakersFromUpload(audioFile, utterances) {
  if (!audioFile || !utterances?.length) return;

  // Decode the whole file once via Web Audio.
  let decoded;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const arrayBuf = await audioFile.arrayBuffer();
    decoded = await audioCtx.decodeAudioData(arrayBuf);
  } catch (e) {
    console.warn('[upload-voice-id] decodeAudioData failed:', e?.message || e);
    try { await audioCtx.close(); } catch (_) { /* noop */ }
    return;
  }

  const sampleRate = decoded.sampleRate;
  const speakerNums = [...new Set(utterances.map(u => Number(u.speaker)))].sort((a, b) => a - b);
  console.info(`[upload-voice-id] processing ${speakerNums.length} speaker(s) from uploaded audio (${decoded.duration.toFixed(1)}s @ ${sampleRate}Hz)`);

  const TARGET_SEC = 3.5;
  const MIN_SEC    = 1.5;

  for (const speakerIdx of speakerNums) {
    const segs = utterances.filter(u => Number(u.speaker) === speakerIdx);
    // Concatenate the first ~3.5s of this speaker's audio (across utterances).
    const slices = [];
    let collected = 0;
    for (const u of segs) {
      const startSec = Number(u.start);
      const endSec   = Number(u.end);
      if (!(endSec > startSec)) continue;
      const dur = endSec - startSec;
      const take = Math.min(dur, TARGET_SEC - collected);
      slices.push({ start: startSec, end: startSec + take });
      collected += take;
      if (collected >= TARGET_SEC) break;
    }
    if (collected < MIN_SEC) {
      console.info(`[upload-voice-id] speaker ${speakerIdx}: only ${collected.toFixed(2)}s of speech — skipping`);
      continue;
    }

    // Extract Float32, mono mixdown, then resample.
    const totalSamples = slices.reduce((a, s) => a + Math.round((s.end - s.start) * sampleRate), 0);
    const float32 = new Float32Array(totalSamples);
    const ch0 = decoded.getChannelData(0);
    const ch1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : null;
    let pos = 0;
    for (const s of slices) {
      const startSample = Math.max(0, Math.round(s.start * sampleRate));
      const length = Math.round((s.end - s.start) * sampleRate);
      for (let i = 0; i < length && pos < float32.length; i++) {
        const idx = startSample + i;
        if (idx >= ch0.length) break;
        float32[pos++] = ch1 ? (ch0[idx] + ch1[idx]) / 2 : ch0[idx];
      }
    }

    const resampled = resampleTo16k(float32, sampleRate);
    const int16     = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, Math.round(resampled[i] * 32767)));
    }
    const wavBuf  = pcm16ToWav(int16, 16000);
    const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });

    const form = new FormData();
    form.append('audio', wavBlob, `upload-speaker-${speakerIdx}.wav`);

    try {
      const res = await fetch(`${API}/voice-identify`, {
        method: 'POST',
        headers: { ...kpscSessionHeader() },
        body: form,
      });
      if (!res.ok) {
        console.warn(`[upload-voice-id] speaker ${speakerIdx}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      console.info(
        `[upload-voice-id] speaker ${speakerIdx} → match=${data.match}` +
        ` score=${typeof data.score === 'number' ? data.score.toFixed(3) : 'n/a'}` +
        (data.memberName ? ` member=${data.memberName}` : '')
      );
      if (data.match && data.memberName) {
        const input = document.getElementById(`km-spk-name-${speakerIdx}`);
        if (input && !input.value) {
          input.value = data.memberName;
          input.style.background  = '#d1fae5';
          input.style.borderColor = '#34d399';
          input.title = `🎙 Auto-matched (score ${data.score.toFixed(2)}). Edit if incorrect.`;
        }
      }
    } catch (e) {
      console.warn(`[upload-voice-id] speaker ${speakerIdx} error:`, e?.message || e);
    }
  }

  try { await audioCtx.close(); } catch (_) { /* noop */ }
}

function buildDiarizedTranscript(nameMap) {
  return _diarizedUtterances
    .map(u => `${nameMap[u.speaker] || `Speaker ${u.speaker}`}: ${String(u.transcript || '').trim()}`)
    .join('\n');
}

function applyDiarizedTranscript() {
  const speakerNums = [...new Set(_diarizedUtterances.map(u => u.speaker))];
  const nameMap = {};
  for (const n of speakerNums) {
    const val = document.getElementById(`km-spk-name-${n}`)?.value.trim();
    if (val) nameMap[n] = val;
  }
  appendTranscriptText(buildDiarizedTranscript(nameMap));
  const speakerMapEl = document.getElementById('km-speaker-map');
  if (speakerMapEl) speakerMapEl.innerHTML = '';
  const status = document.getElementById('km-audio-status');
  if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Speaker-labelled transcript added and saved to draft. Review, then click <strong>End Meeting</strong> below to proceed.</div>`;
  showToast('Diarized transcript applied!', 'success');
  _diarizedUtterances = [];
}

function applyDiarizedTranscriptRaw() {
  appendTranscriptText(buildDiarizedTranscript({}));
  const speakerMapEl = document.getElementById('km-speaker-map');
  if (speakerMapEl) speakerMapEl.innerHTML = '';
  const status = document.getElementById('km-audio-status');
  if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Transcript added with speaker labels and saved to draft. Review, then click <strong>End Meeting</strong> below to proceed.</div>`;
  showToast('Transcript applied.', 'success');
  _diarizedUtterances = [];
}
// ── PLAIN ENGLISH TOGGLE ──────────────────────────────────────────
let _plainEnglishCache = {}; // Cache {meetingId: plainEnglishText}

async function togglePlainEnglish(meetingId) {
  const btn = document.getElementById(`btn-plain-english-${meetingId}`);
  const minutesBody = document.getElementById(`minutes-body-${meetingId}`);
  const indicator = document.getElementById(`pe-indicator-${meetingId}`);
  if (!btn || !minutesBody) return;

  const isPlainEnglish = btn.dataset.plainEnglish === 'true';
  const meeting = S.activeMeeting;
  if (!meeting?.minutesMarkdown) return;

  if (isPlainEnglish) {
    // Toggle off: revert to original minutes
    btn.dataset.plainEnglish = 'false';
    btn.textContent = '📖 Read in plain English';
    btn.style.opacity = '1';
    minutesBody.innerHTML = minutesHtml(meeting.minutesMarkdown);
    if (indicator) indicator.style.display = 'none';
  } else {
    // Toggle on: show plain English version
    btn.dataset.plainEnglish = 'true';
    btn.textContent = '📖 Reading in plain English...';
    btn.style.opacity = '0.6';
    btn.disabled = true;

    try {
      // Check cache first
      if (_plainEnglishCache[meetingId]) {
        minutesBody.innerHTML = minutesHtml(_plainEnglishCache[meetingId]);
        btn.textContent = '📖 Reading in plain English';
        if (indicator) indicator.style.display = '';
      } else {
        // Fetch from API
        const response = await fetch(
          `/api/ai-secretary-meetings/${meetingId}/translate-plain-english`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...kpscSessionHeader()
            }
          }
        );
        const data = await response.json();

        if (!response.ok) {
          showToast(`Failed to translate: ${data.error || 'Unknown error'}`, 'error');
          btn.dataset.plainEnglish = 'false';
          btn.textContent = '📖 Read in plain English';
          btn.style.opacity = '1';
          btn.disabled = false;
          return;
        }

        // Cache the plain English version
        _plainEnglishCache[meetingId] = data.plainEnglish;
        minutesBody.innerHTML = minutesHtml(data.plainEnglish);
        btn.textContent = `📖 Reading in plain English${data.fromCache ? ' (cached)' : ''}`;
        if (indicator) indicator.style.display = '';
      }
    } catch (e) {
      showToast(`Error: ${e.message}`, 'error');
      btn.dataset.plainEnglish = 'false';
      btn.textContent = '📖 Read in plain English';
      btn.style.opacity = '1';
    }

    btn.disabled = false;
  }
}

// ── GLOBAL SEARCH ─────────────────────────────────────────────────
let _searchDebounceTimer = null;

function toggleSearch() {
  const overlay = document.getElementById('kpsc-search-overlay');
  if (!overlay) return;
  const isOpen = overlay.style.display !== 'none';
  if (isOpen) {
    closeSearch();
  } else {
    overlay.style.display = '';
    const input = document.getElementById('kpsc-search-input');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('kpsc-search-results').innerHTML = '';
  }
}

function onSearchInput(query) {
  clearTimeout(_searchDebounceTimer);
  if (!String(query || '').trim()) {
    document.getElementById('kpsc-search-results').innerHTML = '';
    return;
  }
  _searchDebounceTimer = setTimeout(() => globalSearch(query), 300);
}

function closeSearch() {
  const overlay = document.getElementById('kpsc-search-overlay');
  if (overlay) overlay.style.display = 'none';
  const input = document.getElementById('kpsc-search-input');
  if (input) input.value = '';
  const results = document.getElementById('kpsc-search-results');
  if (results) results.innerHTML = '';
  clearTimeout(_searchDebounceTimer);
}

// Escape a string for use in a regex (for highlight matching).
function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Return an HTML-escaped string with the matched substring wrapped in <mark>.
function highlightMatch(text, query) {
  const escaped = esc(text);
  const escapedQuery = esc(query);
  // Rebuild: search within the escaped text for the escaped query.
  const re = new RegExp(`(${escapeRegex(escapedQuery)})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

// Trigger a one-time background fetch of data that may not be loaded yet.
async function ensureSearchDataLoaded() {
  const loads = [];
  if (!S.partners.length) {
    loads.push(apiGet('kpsc-partners').then(r => { if (Array.isArray(r)) S.partners = r; }));
  }
  if (!S.projects.length) {
    loads.push(apiGet('kpsc-projects').then(r => { if (Array.isArray(r)) S.projects = r; }));
  }
  if (!S.meetings.length) {
    loads.push(apiGet('ai-secretary-meetings').then(r => {
      const arr = r?.meetings || r;
      if (Array.isArray(arr)) S.meetings = arr;
    }));
  }
  if (!S.members.length) {
    loads.push(apiGet('settings').then(r => {
      if (Array.isArray(r?.kpsc_members)) S.members = r.kpsc_members;
    }));
  }
  if (loads.length) await Promise.all(loads).catch(() => {});
}

async function globalSearch(query) {
  const resultsEl = document.getElementById('kpsc-search-results');
  if (!resultsEl) return;
  const q = String(query || '').trim();
  if (!q) { resultsEl.innerHTML = ''; return; }

  // Show a brief loading indicator while data is being fetched.
  resultsEl.innerHTML = '<div class="ka-search-loading">Searching…</div>';
  await ensureSearchDataLoaded();

  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const lq = q.toLowerCase();
  const MAX_PER_GROUP = 5;
  const sections = [];

  // ── Members (hidden for committee_viewer) ─────────────────────
  if (role !== 'committee_viewer') {
    const hits = [];
    for (const m of S.members) {
      if (hits.length >= MAX_PER_GROUP) break;
      const searchIn = [m.name, m.role, m.group, m.position].filter(Boolean).join(' ').toLowerCase();
      if (searchIn.includes(lq)) {
        const snippet = m.position ? `${esc(m.position)} · ${esc(m.group)}` : esc(m.group || '');
        hits.push(`
          <div class="ka-search-result" onclick="Kpsc.navigate('members');Kpsc.closeSearch()">
            <span class="ka-search-badge ka-badge-member">Member</span>
            <span class="ka-search-title">${highlightMatch(m.name || '', q)}</span>
            <span class="ka-search-sub">${snippet}</span>
          </div>`);
      }
    }
    if (hits.length) sections.push(`<div class="ka-search-group">${hits.join('')}</div>`);
  }

  // ── Partners ──────────────────────────────────────────────────
  {
    const hits = [];
    for (const p of S.partners) {
      if (hits.length >= MAX_PER_GROUP) break;
      const searchIn = [p.fullName, p.phone, p.email, p.partnershipType, p.group].filter(Boolean).join(' ').toLowerCase();
      if (searchIn.includes(lq)) {
        hits.push(`
          <div class="ka-search-result" onclick="Kpsc.navigate('partners');Kpsc.closeSearch()">
            <span class="ka-search-badge ka-badge-partner">Partner</span>
            <span class="ka-search-title">${highlightMatch(p.fullName || '', q)}</span>
            <span class="ka-search-sub">${esc(p.partnershipType ? p.partnershipType.replace(/_/g, ' ') : '')}</span>
          </div>`);
      }
    }
    if (hits.length) sections.push(`<div class="ka-search-group">${hits.join('')}</div>`);
  }

  // ── Meetings ──────────────────────────────────────────────────
  {
    const hits = [];
    for (const m of S.meetings) {
      if (hits.length >= MAX_PER_GROUP) break;
      const resText = (m.resolutions || []).map(r => [r.text, r.voteSummary].filter(Boolean).join(' ')).join(' ');
      const actText = (m.actionItems || []).map(a => [a.description, a.task, a.assignee].filter(Boolean).join(' ')).join(' ');
      const searchIn = [m.title, m.meetingDate, m.summaryShort, m.summaryLong, m.transcriptText, resText, actText].filter(Boolean).join(' ').toLowerCase();
      if (searchIn.includes(lq)) {
        // Find the first field that matched for the snippet.
        const fields = [
          { label: m.title, text: m.title },
          { label: 'Summary', text: m.summaryShort },
          { label: 'Transcript', text: m.transcriptText },
        ];
        let snippet = '';
        for (const f of fields) {
          if (f.text && f.text.toLowerCase().includes(lq)) {
            const idx = f.text.toLowerCase().indexOf(lq);
            const start = Math.max(0, idx - 30);
            const end   = Math.min(f.text.length, idx + q.length + 30);
            snippet = (start > 0 ? '…' : '') + highlightMatch(f.text.slice(start, end), q) + (end < f.text.length ? '…' : '');
            break;
          }
        }
        const meetingId = esc(m.id || '');
        hits.push(`
          <div class="ka-search-result" onclick="Kpsc.openMeeting('${meetingId}');Kpsc.closeSearch()">
            <span class="ka-search-badge ka-badge-meeting">Meeting</span>
            <span class="ka-search-title">${highlightMatch(m.title || '', q)}</span>
            ${snippet ? `<span class="ka-search-sub">${snippet}</span>` : `<span class="ka-search-sub">${esc(m.meetingDate || '')}</span>`}
          </div>`);
      }
    }
    if (hits.length) sections.push(`<div class="ka-search-group">${hits.join('')}</div>`);
  }

  // ── Projects ──────────────────────────────────────────────────
  {
    const hits = [];
    for (const p of S.projects) {
      if (hits.length >= MAX_PER_GROUP) break;
      const searchIn = [p.title, p.name, p.description, p.status, p.owner, p.createdBy].filter(Boolean).join(' ').toLowerCase();
      if (searchIn.includes(lq)) {
        hits.push(`
          <div class="ka-search-result" onclick="Kpsc.navigate('projects');Kpsc.closeSearch()">
            <span class="ka-search-badge ka-badge-project">Project</span>
            <span class="ka-search-title">${highlightMatch(p.title || p.name || '', q)}</span>
            <span class="ka-search-sub">${esc(p.status || '')}</span>
          </div>`);
      }
    }
    if (hits.length) sections.push(`<div class="ka-search-group">${hits.join('')}</div>`);
  }

  if (sections.length) {
    resultsEl.innerHTML = sections.join('<hr class="ka-search-divider" />');
  } else {
    resultsEl.innerHTML = `<div class="ka-search-empty">No results for <strong>${esc(q)}</strong></div>`;
  }
}

// Close search on outside click
document.addEventListener('click', e => {
  const overlay = document.getElementById('kpsc-search-overlay');
  if (!overlay || overlay.style.display === 'none') return;
  const toggle = document.getElementById('kpsc-search-toggle');
  if (!overlay.contains(e.target) && e.target !== toggle) {
    closeSearch();
  }
}, true);

// ── BOOT ──────────────────────────────────────────────────────────
function init() {
  const session = loadSession();
  if (session?.id) {
    S.user = session;
    if (S.user.mustChangePin) {
      showPinChangeModal();
    } else {
      enterApp();
    }
  } else {
    loadLoginOptions();
  }
}

// ── PUBLIC API ────────────────────────────────────────────────────
// ── B5: Follow-up actions ──────────────────────────────────────────

async function approveFollowup(id) {
  const msgEl = document.getElementById(`fu-msg-${id}`);
  const editedMessage = msgEl ? msgEl.value.trim() : '';
  const res = await apiPatch(`kpsc-followups/${id}`, { status: 'approved', editedMessage });
  if (res?.error) { showToast(res.error, 'error'); return; }
  // Copy to clipboard
  try {
    await navigator.clipboard.writeText(editedMessage);
    showToast('Approved and copied to clipboard!', 'success');
  } catch {
    showToast('Approved! (clipboard copy failed — copy manually)', 'info');
  }
  // Remove the row from DOM
  const row = document.getElementById(`fu-row-${id}`);
  if (row) row.remove();
  // Update S.followups
  S.followups = (S.followups || []).filter(f => f.id !== id);
  // Update card title count
  const title = document.querySelector('.k-fu-card summary .k-collapsible-title');
  if (title) title.textContent = `Follow-ups (${S.followups.filter(f => f.status === 'pending').length})`;
}

async function saveFollowupEdit(id) {
  const msgEl = document.getElementById(`fu-msg-${id}`);
  const editedMessage = msgEl ? msgEl.value.trim() : '';
  const res = await apiPatch(`kpsc-followups/${id}`, { editedMessage });
  if (res?.error) { showToast(res.error, 'error'); return; }
  showToast('Draft message saved.', 'success');
}

async function skipFollowup(id) {
  const res = await apiPatch(`kpsc-followups/${id}`, { status: 'skipped' });
  if (res?.error) { showToast(res.error, 'error'); return; }
  const row = document.getElementById(`fu-row-${id}`);
  if (row) row.remove();
  S.followups = (S.followups || []).filter(f => f.id !== id);
  showToast('Follow-up skipped.', 'info');
  const title = document.querySelector('.k-fu-card summary .k-collapsible-title');
  if (title) title.textContent = `Follow-ups (${S.followups.filter(f => f.status === 'pending').length})`;
}

// ── NOTIFICATION LOG ──────────────────────────────────────────────
// Full history of all saved/finalized WhatsApp meeting notifications.
// Shows agenda items, usage frequency, outcome statuses, and options to
// reuse a past notification as a starting point for a new draft.

async function renderNotificationLog(main) {
  main.innerHTML = '<div class="k-loading">Loading notification history…</div>';
  const res = await apiGet('kpsc-whatsapp-draft');
  const allDrafts = (Array.isArray(res) ? res : []).filter(d => d.status === 'saved' || d.status === 'finalized');
  S.agendaBuilderDraftsHistory = Array.isArray(res) ? res : [];

  // Build agenda item frequency map across all drafts
  const itemFreq = new Map();
  for (const d of allDrafts) {
    const items = Array.isArray(d.agendaItems) ? d.agendaItems : [];
    for (const item of items) {
      const label = typeof item === 'string' ? item : (item.topic || '');
      if (!label) continue;
      const key = label.toLowerCase().trim();
      itemFreq.set(key, (itemFreq.get(key) || 0) + 1);
    }
  }

  if (!allDrafts.length) {
    main.innerHTML = `
      <div class="k-page">
        <div class="k-section-hdr" style="margin-top:0">
          <h2 style="font-size:16px;margin:0">📜 Notification Log</h2>
        </div>
        <div class="k-section">
          <p class="k-hint" style="text-align:center;padding:24px">No saved meeting notifications yet. Build your first one in the <button class="kbtn-link" onclick="Kpsc.navigate('agenda_builder')">Agenda Builder</button>.</p>
        </div>
      </div>`;
    return;
  }

  // Sort by most recent first (already ordered from API)
  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr" style="margin-top:0">
        <h2 style="font-size:16px;margin:0">📜 Meeting Notification Log</h2>
        <p class="k-page-hint" style="margin:4px 0 0">Complete history of all KPSC meeting notifications. Reuse any past notification as a starting point for a new draft.</p>
      </div>

      <!-- Agenda Item Frequency Summary -->
      ${itemFreq.size > 0 ? `
      <details class="k-collapsible" style="margin-bottom:16px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <summary class="k-collapsible-hdr" style="padding:12px 14px;background:var(--card);cursor:pointer">
          <span class="k-collapsible-title" style="font-size:13px;font-weight:600">📊 Agenda Item Frequency</span>
        </summary>
        <div style="padding:12px 14px;background:var(--surface,#f8fafc)">
          <p class="k-hint" style="margin:0 0 10px;font-size:12px">How often each topic has appeared across all meeting notifications.</p>
          <div>
            ${[...itemFreq.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([key, count]) => {
                const pct = Math.round((count / allDrafts.length) * 100);
                return `
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <div style="flex:1;font-size:12px;color:var(--text1);text-transform:capitalize">${esc(key)}</div>
                    <div style="width:80px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;flex-shrink:0">
                      <div style="width:${pct}%;height:100%;background:var(--navy,#1e3a5f);border-radius:3px"></div>
                    </div>
                    <span class="kbadge badge-gray" style="font-size:10px;flex-shrink:0">${count}×</span>
                  </div>`;
              }).join('')}
          </div>
        </div>
      </details>` : ''}

      <!-- All Notifications -->
      <div class="k-section" style="padding:0">
        ${allDrafts.map(d => {
          const label = d.meetingTitle || fmtDate(d.meetingDate) || 'Untitled';
          const dateStr = fmtDate(d.meetingDate || d.createdAt?.slice(0,10) || '');
          const timeStr = formatMeetingTime(d.meetingTime);
          const items = Array.isArray(d.agendaItems) ? d.agendaItems : [];
          const outcomes = Array.isArray(d.agendaOutcomes) ? d.agendaOutcomes : [];
          const carryFwdCount = outcomes.filter(o => o.status === 'carry_forward' || o.status === 'not_discussed').length;
          const resolvedCount = outcomes.filter(o => o.status === 'resolved').length;
          const statusBadge = d.status === 'finalized'
            ? '<span class="kbadge badge-green" style="font-size:10px">Finalized</span>'
            : '<span class="kbadge badge-amber" style="font-size:10px">Saved</span>';
          return `
            <div class="k-meeting-card" style="padding:14px 16px;margin-bottom:10px">
              <div style="display:flex;align-items:flex-start;gap:10px">
                <div style="flex:1">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                    <span style="font-size:14px;font-weight:700;color:var(--navy)">${esc(label)}</span>
                    ${statusBadge}
                  </div>
                  <div style="font-size:12px;color:var(--text2);margin-bottom:6px">${dateStr}${timeStr ? ' · ' + esc(timeStr) : ''}${d.venue ? ' · ' + esc(d.venue) : ''}</div>

                  <!-- Agenda items list (collapsed by default) -->
                  ${items.length ? `
                  <details style="margin-bottom:6px">
                    <summary style="font-size:12px;color:var(--text2);cursor:pointer">${items.length} agenda items</summary>
                    <ol style="margin:6px 0 0 16px;padding:0;font-size:12px;color:var(--text1)">
                      ${items.map((item, i) => {
                        const lbl = typeof item === 'string' ? item : (item.topic || '');
                        const outcome = outcomes.find(o => (o.topic || '').toLowerCase().trim() === lbl.toLowerCase().trim());
                        const outIcon = outcome ? ({ resolved: '✅', carry_forward: '🔁', not_discussed: '⏭️' }[outcome.status] || '') : '';
                        const freq = itemFreq.get(lbl.toLowerCase().trim()) || 0;
                        return `<li style="margin-bottom:3px">${outIcon} ${esc(lbl)}${freq > 1 ? ` <span style="color:var(--text2);font-size:10px">(${freq}×)</span>` : ''}</li>`;
                      }).join('')}
                    </ol>
                  </details>` : ''}

                  ${outcomes.length ? `
                  <div style="font-size:11px;color:var(--text2)">
                    Outcomes: ${resolvedCount} resolved · ${carryFwdCount} carry forward
                  </div>` : ''}
                  ${d.linkedMeetingId ? `
                  <button class="kbtn-link" style="font-size:11px;margin-top:4px" onclick="Kpsc.openMeeting('${esc(d.linkedMeetingId)}')">→ Open linked meeting</button>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                  ${d.messageText ? `<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.abCopyHistoryMessage(${esc(JSON.stringify(d.messageText))})">📋 Copy</button>` : ''}
                  <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.abReuseAsDraft(${esc(JSON.stringify(d.id))});Kpsc.navigate('agenda_builder')">🔄 Reuse</button>
                  ${d.messageText ? `<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.abPrintFromDraft(${esc(JSON.stringify(d))})">🖨️ Print</button>` : ''}
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>

      <div style="margin-top:4px;padding:0 0 20px">
        <button class="kbtn" onclick="Kpsc.navigate('agenda_builder')">← Back to Agenda Builder</button>
      </div>
    </div>`;
}

// ── AGENDA BUILDER ────────────────────────────────────────────────

const AB_TAGS = [
  { key: 'general',   label: 'General',   cls: 'badge-gray'   },
  { key: 'important', label: 'Important', cls: 'badge-amber'  },
  { key: 'urgent',    label: 'Urgent',    cls: 'badge-red'    },
];
const AB_PRIORITY_COLORS = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };

// Format an HH:MM string (24h) to a human-readable 12-hour time display, e.g. "09:00" → "09:00 AM".
// Returns the raw value if parsing fails.
function formatMeetingTime(hhmm) {
  if (!hhmm) return '';
  try {
    const [h, m] = hhmm.split(':');
    return new Date(0, 0, 0, h, m).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return hhmm;
  }
}

// MIME type to file extension map for recorded audio. Used when uploading voice
// notes to Whisper. Handles the main formats MediaRecorder can produce in modern browsers.
const AUDIO_MIME_TO_EXT = {
  'audio/ogg':  'ogg',
  'audio/webm': 'webm',
  'audio/mp4':  'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav':  'wav',
};

function abTagBadge(tag) {
  const t = AB_TAGS.find(x => x.key === tag) || AB_TAGS[0];
  return `<span class="kbadge ${t.cls}" style="font-size:10px">${t.label}</span>`;
}

async function renderAgendaBuilder(main) {
  // Reload notes from server
  const notesRes = await apiGet('kpsc-agenda-notes');
  S.agendaNotes = Array.isArray(notesRes) ? notesRes : [];

  // Load recent WhatsApp drafts (used for history panel and restoring state)
  const draftsRes = await apiGet('kpsc-whatsapp-draft');
  const drafts = Array.isArray(draftsRes) ? draftsRes : [];
  S.agendaBuilderDraftsHistory = drafts;
  const latestDraft = drafts[0] || null;
  if (latestDraft && !S.agendaBuilderDraftId) {
    S.agendaBuilderDraftId = latestDraft.id;
    if (latestDraft.agendaItems?.length && !S.agendaBuilderSelected.length) {
      S.agendaBuilderSelected = latestDraft.agendaItems.map(i => typeof i === 'string' ? i : (i.topic || ''));
    }
    if (latestDraft.messageText && !S.agendaBuilderMessage) {
      S.agendaBuilderMessage = latestDraft.messageText;
    }
    if (latestDraft.prepChecklist?.length && !S.agendaBuilderChecklist.length) {
      S.agendaBuilderChecklist = latestDraft.prepChecklist;
    }
  }

  // Load agenda templates
  const templatesRes = await apiGet('kpsc-agenda-templates');
  S.agendaBuilderTemplates = Array.isArray(templatesRes) ? templatesRes : [];

  const step = S.agendaBuilderStep || 'notes';
  const unusedNotes = S.agendaNotes.filter(n => !n.is_used);

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr" style="margin-top:0">
        <h2 style="font-size:16px;margin:0">📋 Meeting Agenda Builder</h2>
        <p class="k-page-hint" style="margin:4px 0 0">Build your meeting agenda, generate an AI-powered WhatsApp notification, and auto-create your meeting draft — all in one place.</p>
      </div>

      <!-- Step progress bar -->
      <div class="k-ab-steps" style="display:flex;gap:0;margin:16px 0;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
        ${[
          { key: 'notes',    label: '1. Notes',    emoji: '📝' },
          { key: 'select',   label: '2. Agenda',   emoji: '📋' },
          { key: 'settings', label: '3. Settings', emoji: '⚙️' },
          { key: 'draft',    label: '4. Message',  emoji: '💬' },
        ].map(s => `
          <button class="k-ab-step${step === s.key ? ' active' : ''}" onclick="Kpsc.abSetStep('${s.key}')"
            style="flex:1;border:none;padding:10px 4px;font-size:12px;font-weight:600;cursor:pointer;background:${step === s.key ? 'var(--navy,#1e3a5f)' : 'var(--surface,#f8fafc)'};color:${step === s.key ? '#fff' : 'var(--text2)'};border-right:1px solid var(--border)">
            ${s.emoji} ${s.label}
          </button>`).join('')}
      </div>

      <!-- Step 1: Notes Notepad -->
      <div id="ab-step-notes" style="${step !== 'notes' ? 'display:none' : ''}">
        ${renderAbNotesStep(unusedNotes)}
      </div>

      <!-- Step 2: AI Suggestions + Agenda Selector -->
      <div id="ab-step-select" style="${step !== 'select' ? 'display:none' : ''}">
        ${renderAbSelectStep()}
      </div>

      <!-- Step 3: Meeting Settings + Prep Checklist -->
      <div id="ab-step-settings" style="${step !== 'settings' ? 'display:none' : ''}">
        ${renderAbSettingsStep(latestDraft)}
      </div>

      <!-- Step 4: WhatsApp Draft Builder + History -->
      <div id="ab-step-draft" style="${step !== 'draft' ? 'display:none' : ''}">
        ${renderAbDraftStep(latestDraft)}
      </div>
    </div>`;

  // Bind autogrow to note textarea if visible
  const noteTA = document.getElementById('ab-note-text');
  if (noteTA) noteTA.addEventListener('input', () => { noteTA.style.height = 'auto'; noteTA.style.height = noteTA.scrollHeight + 'px'; });
}

function renderAbNotesStep(unusedNotes) {
  const usedNotes = S.agendaNotes.filter(n => n.is_used);
  const recurringCount = unusedNotes.filter(n => n.is_recurring).length;
  return `
    <div class="k-section">
      <h3 class="k-sec-title">📝 Personal Agenda Notes</h3>
      <p class="k-page-hint">Add quick notes for agenda items — typed or by voice. These become suggestions in Step 2. Mark an item as <strong>Recurring</strong> so it's always pre-ticked in every meeting's agenda.</p>

      <div class="k-form-group">
        <label class="k-label">New Note</label>
        <textarea class="k-input" id="ab-note-text" rows="3" placeholder="e.g. Discuss generator fund. New partnership renewal dates. Welfare committee update…" style="resize:vertical"></textarea>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
          <select class="k-input" id="ab-note-tag" style="width:auto;flex-shrink:0">
            ${AB_TAGS.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}
          </select>
          <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.abSaveNote()">+ Add Note</button>
          <button class="kbtn kbtn-sm ${S.agendaBuilderNotesRec ? 'kbtn-amber' : ''}" id="ab-voice-btn" onclick="Kpsc.abToggleVoice()">
            ${S.agendaBuilderNotesRec ? '⏹ Stop Recording' : '🎙 Record Voice Note'}
          </button>
          <span class="k-hint" id="ab-voice-status" style="font-size:11px"></span>
        </div>
      </div>

      ${recurringCount > 0 ? `<p class="k-hint" style="margin-bottom:8px">🔁 <strong>${recurringCount} recurring item${recurringCount > 1 ? 's' : ''}</strong> will always be pre-ticked in Step 2.</p>` : ''}

      <div id="ab-notes-list" style="margin-top:8px">
        ${unusedNotes.length === 0 ? '<p class="k-hint">No notes yet. Add your first note above.</p>' : unusedNotes.map(n => `
          <div class="k-meeting-card" style="padding:10px 12px;margin-bottom:8px;${n.is_recurring ? 'border-left:3px solid var(--navy)' : ''}" id="ab-note-row-${n.id}">
            <div style="display:flex;align-items:flex-start;gap:8px">
              <div style="flex:1">
                <div style="font-size:13px;color:var(--text1);line-height:1.5">${esc(n.text)}</div>
                <div style="margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  ${abTagBadge(n.tag)}
                  ${n.is_recurring ? '<span class="kbadge badge-navy" style="font-size:10px;background:var(--navy,#1e3a5f);color:#fff">🔁 Recurring</span>' : ''}
                  ${(n.usage_count || 0) > 0 ? `<span class="kbadge badge-gray" style="font-size:10px">Used ${n.usage_count}×</span>` : ''}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-top:2px">
                <button class="kbtn kbtn-sm kbtn-ghost" style="font-size:11px;${n.is_recurring ? 'color:var(--navy)' : ''}" title="${n.is_recurring ? 'Remove recurring — will no longer be auto-added' : 'Mark as recurring — always pre-ticked in agenda'}" onclick="Kpsc.abToggleRecurring('${n.id}',${n.is_recurring ? 0 : 1})">
                  ${n.is_recurring ? '🔁 Recurring' : '☆ Recurring'}
                </button>
                <button class="kbtn kbtn-sm kbtn-ghost" style="color:var(--danger,#dc2626);padding:2px 6px" onclick="Kpsc.abDeleteNote('${n.id}')">✕</button>
              </div>
            </div>
          </div>`).join('')}
      </div>

      ${usedNotes.length ? `
      <details class="k-collapsible" style="margin-top:16px">
        <summary class="k-collapsible-hdr"><span class="k-collapsible-title" style="font-size:12px;color:var(--text2)">Used notes (${usedNotes.length})</span></summary>
        <div style="padding:8px 0">
          ${usedNotes.map(n => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;opacity:0.55">
              <span style="font-size:12px;flex:1;text-decoration:line-through">${esc(n.text)}</span>
              ${abTagBadge(n.tag)}
              ${(n.usage_count || 0) > 0 ? `<span class="kbadge badge-gray" style="font-size:10px">${n.usage_count}×</span>` : ''}
            </div>`).join('')}
        </div>
      </details>` : ''}

      <div style="margin-top:20px;display:flex;gap:8px">
        <button class="kbtn kbtn-primary" onclick="Kpsc.abSetStep('select')">Next: Build Agenda →</button>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.navigate('notification_log')" title="View full notification history">📜 Notification Log</button>
      </div>
    </div>`;
}

function renderAbSelectStep() {
  const suggestions = S.agendaBuilderSuggestions;
  const selected = S.agendaBuilderSelected;
  const templates = S.agendaBuilderTemplates;

  const templatesHtml = templates.length ? `
    <div id="ab-templates-panel" style="margin-bottom:16px;background:var(--surface,#f8fafc);border:1px solid var(--border);border-radius:8px;padding:12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:var(--text2)">📂 Templates:</span>
        <select class="k-input" id="ab-template-select" style="flex:1;min-width:160px;font-size:12px">
          <option value="">— Choose a template to load —</option>
          ${templates.map(t => `<option value="${esc(t.id)}">${esc(t.title)} (${Array.isArray(t.items) ? t.items.length : 0} items)</option>`).join('')}
        </select>
        <button class="kbtn kbtn-sm" onclick="Kpsc.abLoadTemplate()">Load</button>
        ${templates.map(t => `
          <button class="kbtn kbtn-sm kbtn-ghost" style="font-size:11px;color:var(--danger,#dc2626)" title="Delete template: ${esc(t.title)}" onclick="Kpsc.abDeleteTemplate('${esc(t.id)}','${esc(t.title)}')">✕ ${esc(t.title)}</button>
        `).join('')}
      </div>
    </div>` : '';

  return `
    <div class="k-section">
      <h3 class="k-sec-title">📋 Build Your Agenda</h3>
      <p class="k-page-hint">AI analyses past meetings and your notes to suggest agenda items. Select, reorder, or add your own.</p>

      ${templatesHtml}

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="kbtn kbtn-ai" id="ab-suggest-btn" onclick="Kpsc.abSuggestAgenda(this)">
          🤖 AI Suggest Agenda Items
        </button>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.abClearSuggestions()">Clear</button>
        ${selected.length >= 2 ? `<button class="kbtn kbtn-sm" onclick="Kpsc.abSaveAsTemplate()">💾 Save as Template</button>` : ''}
        <button class="kbtn kbtn-sm" onclick="Kpsc.abPrintAgenda()">🖨️ Print Agenda</button>
      </div>

      ${suggestions.length ? `
      <div id="ab-suggestions-panel" style="margin-bottom:20px">
        <div class="k-review-step-label" style="margin-top:0">AI Suggestions — click to add to your agenda</div>
        <p class="k-hint" style="margin:0 0 8px;font-size:11px">Items marked <strong>🔁 Recurring</strong> or <strong>⬆️ Carry Forward</strong> are pre-ticked automatically.</p>
        <div id="ab-suggestions-list">
          ${suggestions.map((s, i) => {
            const label = typeof s === 'string' ? s : (s.topic || '');
            const reason = (typeof s === 'object' && s.reason) ? s.reason : '';
            const priority = (typeof s === 'object' && s.priority) ? s.priority : 'medium';
            const src = (typeof s === 'object' && s.source) ? s.source : '';
            const cf = (typeof s === 'object' && s.carryForward);
            const isRecurring = (typeof s === 'object' && s.source === 'recurring');
            const alreadySelected = selected.includes(label);
            const priColor = AB_PRIORITY_COLORS[priority] || '#666';
            return `
              <div class="k-meeting-card" id="ab-sug-${i}" style="padding:10px 12px;margin-bottom:6px;cursor:pointer;opacity:${alreadySelected ? '0.45' : '1'};${isRecurring ? 'border-left:3px solid var(--navy)' : cf ? 'border-left:3px solid #d97706' : ''}"
                onclick="Kpsc.abToggleSuggestion(${i})">
                <div style="display:flex;align-items:flex-start;gap:8px">
                  <span style="font-size:16px;flex-shrink:0">${alreadySelected ? '✅' : '⬜'}</span>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:600;color:var(--text1);line-height:1.4">${esc(label)}</div>
                    ${reason ? `<div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(reason)}</div>` : ''}
                    <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
                      <span style="font-size:10px;font-weight:600;color:${priColor}">● ${priority}</span>
                      ${isRecurring ? '<span class="kbadge" style="font-size:10px;background:var(--navy,#1e3a5f);color:#fff">🔁 Recurring</span>' : src ? `<span class="kbadge badge-gray" style="font-size:10px">${src.replace(/_/g,' ')}</span>` : ''}
                      ${cf ? `<span class="kbadge badge-amber" style="font-size:10px">⬆️ carry forward</span>` : ''}
                    </div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>` : `
      <p class="k-hint" id="ab-suggestions-empty" style="margin-bottom:16px">Click <strong>AI Suggest Agenda Items</strong> to get smart agenda suggestions based on your past meetings and notes.</p>`}

      <div class="k-review-step-label" style="margin-top:8px">Your Selected Agenda (drag to reorder)</div>
      <div id="ab-selected-list" style="margin-bottom:12px">
        ${renderAbSelectedList(selected)}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        <input class="k-input" id="ab-custom-item" type="text" placeholder="Type a custom agenda item…" style="flex:1;min-width:160px" onkeydown="if(event.key==='Enter')Kpsc.abAddCustomItem()" />
        <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.abAddCustomItem()">+ Add Item</button>
      </div>

      <div style="margin-top:20px;display:flex;gap:8px">
        <button class="kbtn" onclick="Kpsc.abSetStep('notes')">← Notes</button>
        <button class="kbtn kbtn-primary" onclick="Kpsc.abSetStep('settings')">Next: Settings →</button>
      </div>
    </div>`;
}

function renderAbSelectedList(selected) {
  if (!selected.length) {
    return '<p class="k-hint" style="padding:12px;text-align:center;background:var(--surface,#f8fafc);border:1px dashed var(--border);border-radius:6px">No items selected yet. Add suggestions above or type a custom item.</p>';
  }
  return selected.map((item, i) => `
    <div class="k-meeting-card" id="ab-sel-${i}" style="padding:8px 12px;margin-bottom:5px;display:flex;align-items:center;gap:8px;cursor:grab" draggable="true"
      ondragstart="Kpsc.abDragStart(${i})" ondragover="Kpsc.abDragOver(event,${i})" ondrop="Kpsc.abDrop(${i})">
      <span style="font-size:14px;flex-shrink:0;color:var(--text2);cursor:grab">⠿</span>
      <span style="flex:1;font-size:13px;color:var(--text1)">${esc(item)}</span>
      <button class="kbtn kbtn-sm kbtn-ghost" style="color:var(--danger,#dc2626);padding:2px 6px;flex-shrink:0" onclick="Kpsc.abRemoveSelected(${i})">✕</button>
    </div>`).join('');
}

function renderAbSettingsStep(latestDraft) {
  const d = latestDraft || {};
  // Use in-memory checklist state (kept in sync when toggled); fall back to draft's checklist or defaults.
  const DEFAULT_CHECKLIST = [
    { id: 'venue',       label: 'Venue confirmed and arranged',         done: false },
    { id: 'attendance',  label: 'Attendance sheet prepared',            done: false },
    { id: 'minutes',     label: 'Previous minutes distributed to members', done: false },
    { id: 'agenda_copy', label: 'Printed agenda copies ready',          done: false },
    { id: 'sound',       label: 'Sound system / microphone checked',    done: false },
    { id: 'projector',   label: 'Projector / whiteboard available',     done: false },
    { id: 'refresh',     label: 'Refreshments arranged',                done: false },
  ];
  const checklist = S.agendaBuilderChecklist.length
    ? S.agendaBuilderChecklist
    : (d.prepChecklist?.length ? d.prepChecklist : DEFAULT_CHECKLIST);

  const doneCount = checklist.filter(c => c.done).length;

  return `
    <div class="k-section">
      <h3 class="k-sec-title">⚙️ Meeting Settings</h3>
      <p class="k-page-hint">Configure the meeting details used in the WhatsApp notification.</p>

      <div class="k-field-row">
        <div class="k-field">
          <label class="k-label">Meeting Date</label>
          <input class="k-input" id="ab-meeting-date" type="date" value="${esc(d.meetingDate || today())}" />
        </div>
        <div class="k-field k-field-sm">
          <label class="k-label">Time</label>
          <input class="k-input" id="ab-meeting-time" type="time" value="${esc(d.meetingTime || '09:00')}" />
        </div>
      </div>

      <div class="k-field">
        <label class="k-label">Venue</label>
        <input class="k-input" id="ab-venue" type="text" value="${esc(d.venue || 'Church Premises')}" placeholder="e.g. Church Main Hall" />
      </div>

      <div class="k-field">
        <label class="k-label">Meeting Title (for draft)</label>
        <input class="k-input" id="ab-meeting-title" type="text" value="${esc(d.meetingTitle || '')}" placeholder="e.g. KPSC Routine Monthly Meeting" />
      </div>

      <div class="k-field">
        <label class="k-label">Urgency</label>
        <select class="k-input" id="ab-urgency">
          <option value="normal" ${(d.urgency || 'normal') === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="urgent" ${d.urgency === 'urgent' ? 'selected' : ''}>Urgent</option>
          <option value="extraordinary" ${d.urgency === 'extraordinary' ? 'selected' : ''}>Extraordinary</option>
        </select>
      </div>

      <div class="k-field">
        <label class="k-att-member" style="gap:10px;cursor:pointer">
          <input type="checkbox" id="ab-tag-all" ${d.tagAll ? 'checked' : ''} style="width:16px;height:16px" />
          <span>Tag @all members in the WhatsApp message</span>
        </label>
      </div>

      <!-- Pre-Meeting Prep Checklist removed -->

      <div style="margin-top:20px;display:flex;gap:8px">
        <button class="kbtn" onclick="Kpsc.abSetStep('select')">← Agenda</button>
        <button class="kbtn kbtn-primary" onclick="Kpsc.abGoToDraft(this)">Next: Generate Message →</button>
      </div>
    </div>`;
}

function renderAbDraftStep(latestDraft) {
  const msg = S.agendaBuilderMessage || (latestDraft?.messageText || '');
  const hasDraft = !!S.agendaBuilderDraftId;

  // Past notifications history (saved/finalized drafts, excluding current draft)
  const history = (S.agendaBuilderDraftsHistory || [])
    .filter(d => (d.status === 'saved' || d.status === 'finalized') && d.id !== S.agendaBuilderDraftId)
    .slice(0, 5);

  return `
    <div class="k-section">
      <h3 class="k-sec-title">💬 WhatsApp Notification</h3>
      <p class="k-page-hint">Review your AI-generated WhatsApp message. Refine it, then share to WhatsApp and optionally open the meeting draft.</p>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="kbtn kbtn-ai" id="ab-build-btn" onclick="Kpsc.abBuildMessage(this)" ${!hasDraft && !S.agendaBuilderSelected.length ? 'disabled' : ''}>
          ${msg ? '🔄 Regenerate Message' : '🤖 Generate WhatsApp Message'}
        </button>
      </div>

      ${msg ? `
      <div class="k-form-group">
        <label class="k-label">Message</label>
        <textarea class="k-input" id="ab-message-text" rows="14" style="font-family:monospace;font-size:13px;line-height:1.6" oninput="Kpsc.abUpdateWaPreview()">${esc(msg)}</textarea>
      </div>

      <div class="k-review-step-label" style="margin-top:12px">AI Refinement Tools</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineMessage('proofread', this)">✏️ Proofread</button>
        <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineMessage('tone_formal', this)">🎩 Formal</button>
        <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineMessage('tone_warm', this)">💛 Warm</button>
        <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineMessage('tone_urgent', this)">🚨 Urgent</button>
        <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineMessage('shorten', this)">✂️ Shorten</button>
        <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineMessage('expand', this)">📖 Expand</button>
        <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineMessage('simplify', this)">🟢 Simplify</button>
      </div>

      <div class="k-review-step-label" style="margin-top:0">WhatsApp Preview</div>
      <div id="ab-wa-preview" class="k-wa-preview" style="background:#e9f5e2;border-radius:10px 10px 10px 2px;padding:14px 16px;font-size:13px;line-height:1.65;white-space:pre-wrap;color:#111;max-height:280px;overflow-y:auto;border:1px solid #c5e0ba;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        ${renderWaPreview(msg)}
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="kbtn kbtn-primary" style="background:#25d366;border-color:#25d366;color:#fff" onclick="Kpsc.abShareWhatsApp()">
          📲 Share via WhatsApp
        </button>
        <button class="kbtn kbtn-primary" onclick="Kpsc.abCopyMessage()">📋 Copy Message</button>
        <button class="kbtn" onclick="Kpsc.abSaveDraft(this)">💾 Save Draft</button>
        <button class="kbtn" onclick="Kpsc.abPrintAgenda()">🖨️ Print Agenda</button>
      </div>

      <div style="margin-top:16px">
        <button class="kbtn kbtn-primary" style="width:100%" onclick="Kpsc.abFinalizeAndOpenMeeting(this)">
          ✅ Save &amp; Open Meeting Draft
        </button>
        <p class="k-hint" style="margin-top:6px;text-align:center">Saves this notification and creates/opens a meeting draft with the agenda pre-filled.</p>
      </div>

      <!-- SMS Blast to KPSC Members -->
      <div class="k-section" style="margin-top:24px;border:1px solid var(--border);border-radius:8px;padding:16px">
        <h3 class="k-sec-title" style="margin-top:0">📱 SMS Blast to Members</h3>
        <p class="k-hint">AI will draft a compact SMS version of the meeting agenda for KPSC committee members. Members must have a phone number saved in the Roster.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <button class="kbtn kbtn-ai" id="ab-sms-draft-btn" onclick="Kpsc.abDraftMemberSms(this)">
            🤖 Draft SMS Message
          </button>
        </div>
        <div id="ab-sms-section" style="display:none">
          <div class="k-form-group">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <label class="k-label" style="margin:0">SMS Message</label>
              <span id="ab-sms-char-count" style="font-size:12px;color:var(--text2)">0 chars · 0 SMS pages</span>
            </div>
            <textarea class="k-input" id="ab-sms-text" rows="8" style="font-family:monospace;font-size:13px;line-height:1.55"
              oninput="Kpsc.abUpdateSmsCharCount()"></textarea>
            <p class="k-hint" style="margin-top:4px">Standard SMS: 160 chars per page. Unicode (emoji/special chars): 70 chars per page.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineSmsMessage('proofread', this)">✏️ Proofread</button>
            <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineSmsMessage('shorten', this)">✂️ Shorten</button>
            <button class="kbtn kbtn-sm kbtn-ai" onclick="Kpsc.abRefineSmsMessage('formal', this)">🎩 Formal</button>
            <button class="kbtn kbtn-sm" onclick="Kpsc.abCopySmsMessage()">📋 Copy SMS</button>
          </div>
          <button class="kbtn kbtn-primary" style="width:100%;background:var(--navy)" onclick="Kpsc.abSendBulkMemberSms(this)">
            📤 Save &amp; Send Bulk SMS to Members
          </button>
          <p id="ab-sms-result" class="k-hint" style="margin-top:8px;display:none"></p>
        </div>
      </div>
      ` : `<p class="k-hint" style="padding:20px;text-align:center;background:var(--surface,#f8fafc);border:1px dashed var(--border);border-radius:6px">Click <strong>Generate WhatsApp Message</strong> above to draft the notification.</p>`}

      <!-- Past Notifications History (last 5, compact) -->
      ${history.length ? `
      <details class="k-collapsible" style="margin-top:24px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <summary class="k-collapsible-hdr" style="padding:12px 14px;background:var(--card);cursor:pointer">
          <span class="k-collapsible-title" style="font-size:13px;font-weight:600">📜 Recent Notifications (${history.length})</span>
        </summary>
        <div style="padding:12px 14px 14px;background:var(--surface,#f8fafc)">
          <p class="k-hint" style="margin:0 0 10px;font-size:12px">Previous saved meeting notifications — copy, adapt, or view full log.</p>
          ${history.map(d => {
            const label = d.meetingTitle || fmtDate(d.meetingDate) || 'Untitled';
            const items = Array.isArray(d.agendaItems) ? d.agendaItems.length : 0;
            const date = fmtDate(d.meetingDate || d.createdAt?.slice(0,10) || '');
            const outcomes = Array.isArray(d.agendaOutcomes) ? d.agendaOutcomes : [];
            return `
              <div class="k-meeting-card" style="padding:10px 12px;margin-bottom:8px">
                <div style="display:flex;align-items:flex-start;gap:8px">
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:600;color:var(--text1)">${esc(label)}</div>
                    <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(date)} · ${items} agenda items${outcomes.length ? ` · ${outcomes.filter(o => o.status === 'carry_forward' || o.status === 'not_discussed').length} carry-forward` : ''}</div>
                    ${d.linkedMeetingId ? `<div style="font-size:11px;color:var(--navy);margin-top:2px;cursor:pointer" onclick="Kpsc.openMeeting('${esc(d.linkedMeetingId)}')">→ Open linked meeting</div>` : ''}
                  </div>
                  <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
                    ${d.messageText ? `<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.abCopyHistoryMessage(${esc(JSON.stringify(d.messageText))})">📋 Copy</button>` : ''}
                    <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.abReuseAsDraft(${esc(JSON.stringify(d.id))})">🔄 Reuse</button>
                  </div>
                </div>
              </div>`;
          }).join('')}
          <button class="kbtn kbtn-sm kbtn-ghost" style="margin-top:4px;width:100%" onclick="Kpsc.navigate('notification_log')">📜 View Full Notification Log →</button>
        </div>
      </details>` : ''}

      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="kbtn" onclick="Kpsc.abSetStep('settings')">← Settings</button>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.navigate('notification_log')">📜 Notification Log</button>
      </div>
    </div>`;
}

function renderWaPreview(text) {
  if (!text) return '';
  // Convert WhatsApp *bold* and _italic_ to HTML
  return esc(text)
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');
}

// ── Agenda Builder Actions ────────────────────────────────────────

function abSetStep(step) {
  S.agendaBuilderStep = step;
  ['notes','select','settings','draft'].forEach(s => {
    const el = document.getElementById(`ab-step-${s}`);
    if (el) el.style.display = s === step ? '' : 'none';
  });
  // Update step buttons
  document.querySelectorAll('.k-ab-step').forEach(btn => {
    const isActive = btn.getAttribute('onclick')?.includes(`'${step}'`);
    btn.style.background = isActive ? 'var(--navy,#1e3a5f)' : 'var(--surface,#f8fafc)';
    btn.style.color = isActive ? '#fff' : 'var(--text2)';
  });
  // Refresh agenda list when entering select step
  if (step === 'select') {
    const listEl = document.getElementById('ab-selected-list');
    if (listEl) listEl.innerHTML = renderAbSelectedList(S.agendaBuilderSelected);
  }
}

async function abSaveNote() {
  const textEl = document.getElementById('ab-note-text');
  const tagEl  = document.getElementById('ab-note-tag');
  const text = textEl?.value?.trim() || '';
  if (!text) { showToast('Please enter a note first.', 'warn'); return; }
  const res = await apiPost('kpsc-agenda-notes', { text, tag: tagEl?.value || 'general', source: 'typed' });
  if (res?.error) { showToast(res.error, 'error'); return; }
  S.agendaNotes.unshift(res);
  if (textEl) textEl.value = '';
  // Re-render notes list
  const listEl = document.getElementById('ab-notes-list');
  const unusedNotes = S.agendaNotes.filter(n => !n.is_used);
  if (listEl) listEl.innerHTML = unusedNotes.length === 0
    ? '<p class="k-hint">No notes yet. Add your first note above.</p>'
    : unusedNotes.map(n => `
        <div class="k-meeting-card" style="padding:10px 12px;margin-bottom:8px" id="ab-note-row-${n.id}">
          <div style="display:flex;align-items:flex-start;gap:8px">
            <div style="flex:1;font-size:13px;color:var(--text1);line-height:1.5">${esc(n.text)}</div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              ${abTagBadge(n.tag)}
              <button class="kbtn kbtn-sm kbtn-ghost" style="color:var(--danger,#dc2626);padding:2px 6px" onclick="Kpsc.abDeleteNote('${n.id}')">✕</button>
            </div>
          </div>
        </div>`).join('');
  showToast('Note added.', 'success');
}

async function abDeleteNote(id) {
  if (!confirm('Delete this agenda note?')) return;
  const res = await apiDelete(`kpsc-agenda-notes/${id}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  S.agendaNotes = S.agendaNotes.filter(n => n.id !== id);
  const row = document.getElementById(`ab-note-row-${id}`);
  if (row) row.remove();
  showToast('Note deleted.', 'info');
}

async function abToggleRecurring(id, makeRecurring) {
  const res = await apiPut(`kpsc-agenda-notes/${id}`, { isRecurring: !!makeRecurring });
  if (res?.error) { showToast(res.error, 'error'); return; }
  // Update in-memory state
  const note = S.agendaNotes.find(n => n.id === id);
  if (note) note.is_recurring = res.is_recurring;
  // Re-render just the notes list
  const unusedNotes = S.agendaNotes.filter(n => !n.is_used);
  const listEl = document.getElementById('ab-notes-list');
  if (listEl) {
    listEl.innerHTML = unusedNotes.length === 0
      ? '<p class="k-hint">No notes yet. Add your first note above.</p>'
      : unusedNotes.map(n => `
          <div class="k-meeting-card" style="padding:10px 12px;margin-bottom:8px;${n.is_recurring ? 'border-left:3px solid var(--navy)' : ''}" id="ab-note-row-${n.id}">
            <div style="display:flex;align-items:flex-start;gap:8px">
              <div style="flex:1">
                <div style="font-size:13px;color:var(--text1);line-height:1.5">${esc(n.text)}</div>
                <div style="margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  ${abTagBadge(n.tag)}
                  ${n.is_recurring ? '<span class="kbadge" style="font-size:10px;background:var(--navy,#1e3a5f);color:#fff">🔁 Recurring</span>' : ''}
                  ${(n.usage_count || 0) > 0 ? `<span class="kbadge badge-gray" style="font-size:10px">Used ${n.usage_count}×</span>` : ''}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-top:2px">
                <button class="kbtn kbtn-sm kbtn-ghost" style="font-size:11px;${n.is_recurring ? 'color:var(--navy)' : ''}" onclick="Kpsc.abToggleRecurring('${n.id}',${n.is_recurring ? 0 : 1})">
                  ${n.is_recurring ? '🔁 Recurring' : '☆ Recurring'}
                </button>
                <button class="kbtn kbtn-sm kbtn-ghost" style="color:var(--danger,#dc2626);padding:2px 6px" onclick="Kpsc.abDeleteNote('${n.id}')">✕</button>
              </div>
            </div>
          </div>`).join('');
  }
  showToast(makeRecurring ? '🔁 Item marked as recurring — it will always be pre-ticked.' : 'Recurring flag removed.', 'success');
}

let _abDragIdx = null;
function abDragStart(idx) { _abDragIdx = idx; }
function abDragOver(e, idx) { e.preventDefault(); }
function abDrop(targetIdx) {
  if (_abDragIdx === null || _abDragIdx === targetIdx) return;
  const arr = [...S.agendaBuilderSelected];
  const [moved] = arr.splice(_abDragIdx, 1);
  arr.splice(targetIdx, 0, moved);
  S.agendaBuilderSelected = arr;
  _abDragIdx = null;
  const listEl = document.getElementById('ab-selected-list');
  if (listEl) listEl.innerHTML = renderAbSelectedList(arr);
}

function abToggleSuggestion(idx) {
  const sug = S.agendaBuilderSuggestions[idx];
  if (!sug) return;
  const label = typeof sug === 'string' ? sug : (sug.topic || '');
  if (!label) return;
  const pos = S.agendaBuilderSelected.indexOf(label);
  if (pos >= 0) {
    S.agendaBuilderSelected.splice(pos, 1);
  } else {
    S.agendaBuilderSelected.push(label);
  }
  // Toggle visual state
  const el = document.getElementById(`ab-sug-${idx}`);
  if (el) {
    const isNowSelected = S.agendaBuilderSelected.includes(label);
    el.style.opacity = isNowSelected ? '0.45' : '1';
    const icon = el.querySelector('span');
    if (icon) icon.textContent = isNowSelected ? '✅' : '⬜';
  }
  // Refresh selected list
  const listEl = document.getElementById('ab-selected-list');
  if (listEl) listEl.innerHTML = renderAbSelectedList(S.agendaBuilderSelected);
}

function abRemoveSelected(idx) {
  S.agendaBuilderSelected.splice(idx, 1);
  const listEl = document.getElementById('ab-selected-list');
  if (listEl) listEl.innerHTML = renderAbSelectedList(S.agendaBuilderSelected);
  // Un-highlight any corresponding suggestion
  S.agendaBuilderSuggestions.forEach((s, i) => {
    const label = typeof s === 'string' ? s : (s.topic || '');
    const el = document.getElementById(`ab-sug-${i}`);
    if (el && !S.agendaBuilderSelected.includes(label)) {
      el.style.opacity = '1';
      const icon = el.querySelector('span');
      if (icon) icon.textContent = '⬜';
    }
  });
}

function abAddCustomItem() {
  const input = document.getElementById('ab-custom-item');
  const text = input?.value?.trim() || '';
  if (!text) { showToast('Type an agenda item first.', 'warn'); return; }

  // Smart deduplication: case-insensitive comparison against selected items and current suggestions
  const normalize = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const newKey = normalize(text);
  const duplicate = S.agendaBuilderSelected.find(s => normalize(s) === newKey)
    || S.agendaBuilderSuggestions.find(s => {
      const label = typeof s === 'string' ? s : (s.topic || '');
      return normalize(label) === newKey;
    });
  if (duplicate) {
    const dupLabel = typeof duplicate === 'string' ? duplicate : (duplicate.topic || String(duplicate));
    showToast(`"${dupLabel}" is already in your agenda.`, 'info');
    if (input) input.value = '';
    return;
  }

  S.agendaBuilderSelected.push(text);
  if (input) input.value = '';
  const listEl = document.getElementById('ab-selected-list');
  if (listEl) listEl.innerHTML = renderAbSelectedList(S.agendaBuilderSelected);
}

function abClearSuggestions() {
  S.agendaBuilderSuggestions = [];
  const panel = document.getElementById('ab-suggestions-panel');
  if (panel) panel.innerHTML = '';
  const empty = document.getElementById('ab-suggestions-empty');
  if (empty) empty.style.display = '';
}

async function abSuggestAgenda(btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  try {
    const res = await apiPost('kpsc-agenda-suggest', {});
    if (res?.error) { showToast(res.error, 'error'); return; }
    S.agendaBuilderSuggestions = res.suggestions || [];
    // Auto-tick items marked as isPreTicked (recurring or carry-forward) if not already in selected list
    for (const sug of S.agendaBuilderSuggestions) {
      if (typeof sug === 'object' && sug.isPreTicked) {
        const label = sug.topic || '';
        if (label && !S.agendaBuilderSelected.includes(label)) {
          S.agendaBuilderSelected.push(label);
        }
      }
    }
    // Re-render suggestions panel
    const panelContainer = document.getElementById('ab-step-select');
    if (panelContainer) {
      panelContainer.innerHTML = renderAbSelectStep();
    }
    const src = res.source === 'ai' ? 'AI' : 'template';
    const preTickedCount = S.agendaBuilderSuggestions.filter(s => typeof s === 'object' && s.isPreTicked).length;
    const msg = preTickedCount > 0
      ? `${S.agendaBuilderSuggestions.length} suggestions generated (${src}). ${preTickedCount} recurring/carry-forward item${preTickedCount > 1 ? 's' : ''} pre-ticked.`
      : `${S.agendaBuilderSuggestions.length} agenda suggestions generated (${src}).`;
    showToast(msg, 'success');
  } catch (e) {
    showToast('Could not generate suggestions. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function abGoToDraft(btn) {
  // Save settings and create/update draft before going to draft step
  const meetingDate = document.getElementById('ab-meeting-date')?.value || today();
  const meetingTime = document.getElementById('ab-meeting-time')?.value || '09:00';
  const venue = document.getElementById('ab-venue')?.value?.trim() || 'Church Premises';
  const meetingTitle = document.getElementById('ab-meeting-title')?.value?.trim() || '';
  const urgency = document.getElementById('ab-urgency')?.value || 'normal';
  const tagAll = !!(document.getElementById('ab-tag-all')?.checked);

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    // Persist current checklist state if it has been touched
    const prepChecklist = S.agendaBuilderChecklist.length ? S.agendaBuilderChecklist : undefined;
    let draftRes;
    if (S.agendaBuilderDraftId) {
      draftRes = await apiPut(`kpsc-whatsapp-draft/${S.agendaBuilderDraftId}`, {
        agendaItems: S.agendaBuilderSelected.map(t => ({ topic: t })),
        meetingDate, meetingTime, venue, meetingTitle, urgency, tagAll,
        ...(prepChecklist ? { prepChecklist } : {}),
      });
    } else {
      draftRes = await apiPost('kpsc-whatsapp-draft', {
        agendaItems: S.agendaBuilderSelected.map(t => ({ topic: t })),
        meetingDate, meetingTime, venue, meetingTitle, urgency, tagAll,
        ...(prepChecklist ? { prepChecklist } : {}),
      });
    }
    if (draftRes?.error) { showToast(draftRes.error, 'error'); return; }
    S.agendaBuilderDraftId = draftRes.id;
    // Sync checklist from server response (includes defaults if first save)
    if (draftRes.prepChecklist?.length && !S.agendaBuilderChecklist.length) {
      S.agendaBuilderChecklist = draftRes.prepChecklist;
    }
    abSetStep('draft');
    // Re-render draft step with latest data
    const draftEl = document.getElementById('ab-step-draft');
    if (draftEl) draftEl.innerHTML = renderAbDraftStep(draftRes);
  } catch {
    showToast('Could not save settings. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function abBuildMessage(btn) {
  if (!S.agendaBuilderDraftId) { showToast('Please complete Step 3 first.', 'warn'); return; }
  const currentMsg = document.getElementById('ab-message-text')?.value?.trim() || '';
  // If the user has edited the text, first save it
  if (currentMsg) {
    await apiPut(`kpsc-whatsapp-draft/${S.agendaBuilderDraftId}`, { messageText: currentMsg });
  }

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  try {
    const res = await apiPost(`kpsc-whatsapp-draft/${S.agendaBuilderDraftId}/build`, {});
    if (res?.error) { showToast(res.error, 'error'); return; }
    S.agendaBuilderMessage = res.messageText || '';
    const ta = document.getElementById('ab-message-text');
    if (ta) { ta.value = S.agendaBuilderMessage; } else {
      const draftEl = document.getElementById('ab-step-draft');
      if (draftEl) draftEl.innerHTML = renderAbDraftStep({ messageText: S.agendaBuilderMessage });
    }
    abUpdateWaPreview();
    showToast('Message generated.', 'success');
  } catch {
    showToast('Could not generate message. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function abUpdateWaPreview() {
  const ta = document.getElementById('ab-message-text');
  const text = ta?.value || S.agendaBuilderMessage || '';
  const preview = document.getElementById('ab-wa-preview');
  if (preview) preview.innerHTML = renderWaPreview(text);
}

async function abRefineMessage(action, btn) {
  if (!S.agendaBuilderDraftId) { showToast('Please generate a message first.', 'warn'); return; }
  const currentMsg = document.getElementById('ab-message-text')?.value?.trim() || S.agendaBuilderMessage || '';
  if (!currentMsg) { showToast('Please generate a message first.', 'warn'); return; }

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳…';
  try {
    const res = await apiPost(`kpsc-whatsapp-draft/${S.agendaBuilderDraftId}/refine`, { action, messageText: currentMsg });
    if (res?.error) { showToast(res.error, 'error'); return; }
    S.agendaBuilderMessage = res.messageText || currentMsg;
    const ta = document.getElementById('ab-message-text');
    if (ta) ta.value = S.agendaBuilderMessage;
    abUpdateWaPreview();
    showToast('Message refined.', 'success');
  } catch {
    showToast('Could not refine message. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function abSaveDraft(btn) {
  if (!S.agendaBuilderDraftId) { showToast('No draft to save.', 'warn'); return; }
  const msg = document.getElementById('ab-message-text')?.value?.trim() || S.agendaBuilderMessage || '';
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const res = await apiPut(`kpsc-whatsapp-draft/${S.agendaBuilderDraftId}`, { messageText: msg, status: 'saved' });
    if (res?.error) { showToast(res.error, 'error'); return; }
    S.agendaBuilderMessage = msg;
    showToast('Draft saved.', 'success');
  } catch {
    showToast('Could not save draft.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function abCopyMessage() {
  const msg = document.getElementById('ab-message-text')?.value?.trim() || S.agendaBuilderMessage || '';
  if (!msg) { showToast('No message to copy.', 'warn'); return; }
  navigator.clipboard.writeText(msg).then(
    () => showToast('Message copied to clipboard!', 'success'),
    () => showToast('Could not copy. Please copy manually.', 'warn'),
  );
}

function abShareWhatsApp() {
  const msg = document.getElementById('ab-message-text')?.value?.trim() || S.agendaBuilderMessage || '';
  if (!msg) { showToast('Generate a message first.', 'warn'); return; }
  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  showToast('WhatsApp opened. Select recipients to send.', 'success');
}

async function abFinalizeAndOpenMeeting(btn) {
  if (!S.agendaBuilderDraftId) { showToast('No draft to finalize.', 'warn'); return; }
  const msg = document.getElementById('ab-message-text')?.value?.trim() || S.agendaBuilderMessage || '';
  if (!msg) { showToast('Please generate a message before finalizing.', 'warn'); return; }

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Saving…';
  try {
    const res = await apiPost(`kpsc-whatsapp-draft/${S.agendaBuilderDraftId}/finalize`, {
      messageText: msg,
      meetingTitle: document.getElementById('ab-meeting-title')?.value?.trim() || '',
    });
    if (res?.error) { showToast(res.error, 'error'); return; }
    const linkedId = res.linkedMeetingId;
    // Mark notes as used
    S.agendaNotes = S.agendaNotes.map(n => {
      const used = res.agendaItems?.some(i => i?.noteId === n.id);
      return used ? { ...n, is_used: 1 } : n;
    });
    // Reset builder state
    S.agendaBuilderDraftId = null;
    S.agendaBuilderSelected = [];
    S.agendaBuilderMessage = '';
    S.agendaBuilderSuggestions = [];
    S.agendaBuilderStep = 'notes';
    S.agendaBuilderChecklist = [];
    S.agendaBuilderDraftsHistory = [];
    showToast('Agenda saved! Opening meeting draft…', 'success');
    if (linkedId) {
      // Reload meetings first
      const meetingsRes = await apiGet('ai-secretary-meetings');
      if (!meetingsRes?.error && Array.isArray(meetingsRes)) S.meetings = meetingsRes;
      await openMeeting(linkedId);
    } else {
      navigate('archive');
    }
  } catch {
    showToast('Could not finalize. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── Agenda Builder: Member SMS Blast ──────────────────────────────────

/**
 * Calls DeepSeek (or falls back to a local template) to draft a compact SMS
 * version of the current agenda for KPSC committee members.
 */
async function abDraftMemberSms(btn) {
  const agendaItems = S.agendaBuilderSelected || [];
  const meetingTitle = document.getElementById('ab-meeting-title')?.value?.trim()
    || document.getElementById('ab-settings-title')?.value?.trim()
    || 'KPSC Committee Meeting';
  const meetingDate = document.getElementById('ab-settings-date')?.value?.trim() || '';

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Drafting SMS…';

  try {
    // Drafted server-side (kpsc-draft-agenda-sms) — the browser no longer
    // fetches the raw DeepSeek key from /api/settings to call DeepSeek itself.
    let smsText = '';
    try {
      const res = await apiPost('kpsc-draft-agenda-sms', { meetingTitle, meetingDate, agendaItems });
      smsText = String(res?.smsText || '').trim();
    } catch { /* fall back to template */ }

    if (!smsText) {
      const items = agendaItems.slice(0, 3).join(', ') + (agendaItems.length > 3 ? ', & more' : '');
      smsText = `Dear Member, you are invited to the ${meetingTitle}${meetingDate ? ' on ' + meetingDate : ''}. Agenda: ${items}. Your attendance is important. God bless you. — RCCG Kingdom Parish`;
    }

    const smsEl = document.getElementById('ab-sms-text');
    if (smsEl) smsEl.value = smsText;
    const smsSection = document.getElementById('ab-sms-section');
    if (smsSection) smsSection.style.display = '';
    abUpdateSmsCharCount();
    showToast('SMS draft ready. Review and send when satisfied.', 'success');
  } catch (e) {
    showToast('Could not draft SMS: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function abUpdateSmsCharCount() {
  const smsEl = document.getElementById('ab-sms-text');
  const countEl = document.getElementById('ab-sms-char-count');
  if (!smsEl || !countEl) return;
  const text = smsEl.value;
  const len = text.length;
  // Heuristic: detect likely non-GSM-7 characters (emoji, Arabic, Cyrillic, CJK etc.).
  // This covers the most common cases; extended GSM-7 chars (€, [, {, |, ~, ^, \) are
  // rare in church messages and don't affect the page count estimate significantly.
  const isUnicode = /[^\u0020-\u007e\u00a0-\u00ff]/.test(text);
  const pageSize = isUnicode ? 70 : 160;
  const pages = len === 0 ? 0 : Math.ceil(len / pageSize);
  const type = isUnicode ? 'Unicode' : 'GSM';
  countEl.textContent = `${len} chars · ${pages} SMS page${pages !== 1 ? 's' : ''} (${type})`;
  countEl.style.color = pages > 2 ? '#e45' : 'var(--text2)';
}

async function abRefineSmsMessage(action, btn) {
  const smsEl = document.getElementById('ab-sms-text');
  if (!smsEl?.value?.trim()) { showToast('Generate an SMS draft first.', 'warn'); return; }

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳…';

  try {
    // Refined server-side (kpsc-refine-agenda-sms) — the browser no longer
    // needs the raw DeepSeek key to call the API directly.
    const res = await apiPost('kpsc-refine-agenda-sms', { action, smsText: smsEl.value });
    if (res?.error) { showToast(res.error, 'warn'); return; }
    const refined = String(res?.refined || '').trim();
    if (refined) {
      smsEl.value = refined;
      abUpdateSmsCharCount();
      showToast('SMS refined.', 'success');
    }
  } catch (e) {
    showToast('Refinement failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function abCopySmsMessage() {
  const smsEl = document.getElementById('ab-sms-text');
  const text = smsEl?.value?.trim();
  if (!text) { showToast('No SMS message to copy.', 'warn'); return; }
  navigator.clipboard.writeText(text).then(
    () => showToast('SMS copied to clipboard!', 'success'),
    () => showToast('Could not copy. Please copy manually.', 'warn'),
  );
}

async function abSendBulkMemberSms(btn) {
  const smsEl = document.getElementById('ab-sms-text');
  const message = smsEl?.value?.trim();
  if (!message) { showToast('Please draft an SMS message first.', 'warn'); return; }

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Sending…';

  const resultEl = document.getElementById('ab-sms-result');

  try {
    const res = await apiPost('kpsc-sms-send', { message });
    if (res?.error) {
      showToast(res.error, 'error');
      if (resultEl) {
        resultEl.textContent = `❌ ${res.error}`;
        resultEl.style.display = 'block';
        resultEl.style.color = '#e45';
      }
    } else {
      const msg = `✅ SMS sent to ${res.sent} member${res.sent !== 1 ? 's' : ''}${res.failed > 0 ? ` (${res.failed} failed)` : ''}.`;
      showToast(msg, res.failed > 0 ? 'warn' : 'success');
      if (resultEl) {
        resultEl.textContent = msg;
        resultEl.style.display = 'block';
        resultEl.style.color = res.failed > 0 ? '#f80' : '#2a6';
      }
    }
  } catch (e) {
    showToast('Could not send SMS: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── Agenda Builder: Templates ─────────────────────────────────

async function abSaveAsTemplate() {
  const items = [...S.agendaBuilderSelected];
  if (items.length < 2) { showToast('Add at least 2 agenda items to save as a template.', 'warn'); return; }
  const name = prompt('Template name (e.g. "Monthly Routine Meeting"):')?.trim();
  if (!name) return;
  const res = await apiPost('kpsc-agenda-templates', { title: name, items });
  if (res?.error) { showToast(res.error, 'error'); return; }
  S.agendaBuilderTemplates.unshift(res);
  showToast(`Template "${name}" saved.`, 'success');
  // Refresh select step panel
  const panel = document.getElementById('ab-step-select');
  if (panel) panel.innerHTML = renderAbSelectStep();
}

function abLoadTemplate() {
  const sel = document.getElementById('ab-template-select');
  const id = sel?.value;
  if (!id) { showToast('Please select a template to load.', 'warn'); return; }
  const tpl = S.agendaBuilderTemplates.find(t => t.id === id);
  if (!tpl) return;
  const items = Array.isArray(tpl.items) ? tpl.items : [];
  const existing = S.agendaBuilderSelected;
  const toAdd = items.filter(i => !existing.includes(i));
  if (!toAdd.length) { showToast('All items from this template are already in your agenda.', 'info'); return; }
  S.agendaBuilderSelected = [...existing, ...toAdd];
  showToast(`Loaded ${toAdd.length} item(s) from "${tpl.title}".`, 'success');
  const listEl = document.getElementById('ab-selected-list');
  if (listEl) listEl.innerHTML = renderAbSelectedList(S.agendaBuilderSelected);
  if (sel) sel.value = '';
}

async function abDeleteTemplate(id, name) {
  if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
  const res = await apiDelete(`kpsc-agenda-templates/${id}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  S.agendaBuilderTemplates = S.agendaBuilderTemplates.filter(t => t.id !== id);
  showToast(`Template "${name}" deleted.`, 'info');
  const panel = document.getElementById('ab-step-select');
  if (panel) panel.innerHTML = renderAbSelectStep();
}

// ── Agenda Builder: Pre-Meeting Checklist ─────────────────────

function abToggleChecklist(idx) {
  if (!S.agendaBuilderChecklist.length) {
    // If not yet loaded, pull from the settings step defaults
    const DEFAULT_CHECKLIST = [
      { id: 'venue',       label: 'Venue confirmed and arranged',         done: false },
      { id: 'attendance',  label: 'Attendance sheet prepared',            done: false },
      { id: 'minutes',     label: 'Previous minutes distributed to members', done: false },
      { id: 'agenda_copy', label: 'Printed agenda copies ready',          done: false },
      { id: 'sound',       label: 'Sound system / microphone checked',    done: false },
      { id: 'projector',   label: 'Projector / whiteboard available',     done: false },
      { id: 'refresh',     label: 'Refreshments arranged',                done: false },
    ];
    S.agendaBuilderChecklist = DEFAULT_CHECKLIST;
  }
  if (idx >= 0 && idx < S.agendaBuilderChecklist.length) {
    S.agendaBuilderChecklist[idx].done = !S.agendaBuilderChecklist[idx].done;
    // Persist checklist to draft in background (non-blocking)
    if (S.agendaBuilderDraftId) {
      apiPut(`kpsc-whatsapp-draft/${S.agendaBuilderDraftId}`, { prepChecklist: S.agendaBuilderChecklist })
        .catch(() => { /* silently ignore */ });
    }
    // Update badge counter without full re-render
    const doneCount = S.agendaBuilderChecklist.filter(c => c.done).length;
    const total = S.agendaBuilderChecklist.length;
    const badge = document.querySelector('.k-collapsible-title .kbadge');
    if (badge) {
      badge.textContent = `${doneCount}/${total} done`;
      badge.className = `kbadge ${doneCount === total ? 'badge-green' : 'badge-amber'}`;
    }
  }
}

function abResetChecklist() {
  S.agendaBuilderChecklist = S.agendaBuilderChecklist.map(c => ({ ...c, done: false }));
  if (S.agendaBuilderDraftId) {
    apiPut(`kpsc-whatsapp-draft/${S.agendaBuilderDraftId}`, { prepChecklist: S.agendaBuilderChecklist })
      .catch(() => { /* silently ignore */ });
  }
  // Re-render checklist items
  const container = document.getElementById('ab-checklist-items');
  if (container) {
    container.innerHTML = S.agendaBuilderChecklist.map((item, i) => `
      <label class="k-att-member" style="gap:10px;cursor:pointer;margin-bottom:10px;display:flex;align-items:center">
        <input type="checkbox" id="ab-chk-${i}" onchange="Kpsc.abToggleChecklist(${i})" style="width:16px;height:16px;flex-shrink:0" />
        <span style="font-size:13px">${esc(item.label)}</span>
      </label>`).join('');
  }
  const badge = document.querySelector('.k-collapsible-title .kbadge');
  if (badge) { badge.textContent = `0/${S.agendaBuilderChecklist.length} done`; badge.className = 'kbadge badge-amber'; }
  showToast('Checklist reset.', 'info');
}

// ── Agenda Builder: Print Formal Agenda ──────────────────────

function abPrintAgenda() {
  const items = [...S.agendaBuilderSelected];
  if (!items.length) { showToast('Add agenda items before printing.', 'warn'); return; }

  // Gather meeting settings from DOM (if on settings step) or from latest draft state
  const meetingDate = document.getElementById('ab-meeting-date')?.value || '';
  const meetingTime = document.getElementById('ab-meeting-time')?.value || '';
  const venue = document.getElementById('ab-venue')?.value?.trim() || 'Church Premises';
  const meetingTitle = document.getElementById('ab-meeting-title')?.value?.trim()
    || (S.agendaBuilderDraftsHistory[0]?.meetingTitle || 'KPSC Meeting');

  // Format date for display
  let dateDisplay = meetingDate;
  if (meetingDate) {
    try {
      const d = new Date(meetingDate + 'T12:00:00');
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      dateDisplay = `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch { /* use raw */ }
  }

  const timeDisplay = meetingTime ? formatMeetingTime(meetingTime) : '';

  const agendaLines = items.map((item, i) => `
    <div style="display:flex;gap:14px;padding:10px 0;border-bottom:1px solid #e8ecf0">
      <span style="font-weight:700;color:#1e3a5f;min-width:28px;font-size:14px">${i + 1}.</span>
      <span style="font-size:14px;line-height:1.5">${esc(item)}</span>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Meeting Agenda — ${esc(meetingTitle)}</title>
<style>
  @page { margin: 30mm 25mm; }
  body { font-family: 'Times New Roman', serif; color: #111; }
  .header { text-align: center; border-bottom: 3px double #1e3a5f; padding-bottom: 16px; margin-bottom: 24px; }
  .org { font-size: 13px; font-weight: 700; color: #1e3a5f; letter-spacing: 1px; text-transform: uppercase; }
  .title { font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
  .meta { font-size: 13px; color: #444; line-height: 1.8; }
  .agenda-section { margin-top: 24px; }
  .agenda-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #1e3a5f; border-bottom: 1px solid #1e3a5f; padding-bottom: 4px; margin-bottom: 0; }
  .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 12px; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <div class="org">Redeemed Christian Church of God · Kingdom Parish, Aguleri</div>
  <div class="title">${esc(meetingTitle)}</div>
  <div class="meta">
    ${dateDisplay ? `<strong>Date:</strong> ${esc(dateDisplay)}` : ''}
    ${timeDisplay ? ` &nbsp;|&nbsp; <strong>Time:</strong> ${esc(timeDisplay)}` : ''}
    ${venue ? ` &nbsp;|&nbsp; <strong>Venue:</strong> ${esc(venue)}` : ''}
  </div>
</div>

<div class="agenda-section">
  <div class="agenda-title">Agenda</div>
  ${agendaLines}
</div>

<div style="margin-top:32px">
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr>
      <td style="padding:8px 0;width:50%">Chaired by: __________________________</td>
      <td style="padding:8px 0;width:50%">Minutes by: __________________________</td>
    </tr>
    <tr>
      <td style="padding:8px 0">Signed: __________________________</td>
      <td style="padding:8px 0">Date: __________________________</td>
    </tr>
  </table>
</div>

<div class="footer">
  This agenda was generated by the KPSC Portal · Kingdom Parish Secretary's Committee
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=700,height=900');
  if (!win) { showToast('Could not open print window. Allow pop-ups for this site.', 'warn'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}

// ── Agenda Builder: History Copy ──────────────────────────────

// Print a formal agenda from a past draft object (for use from the notification log).
function abPrintFromDraft(draft) {
  if (!draft) return;
  const items = (Array.isArray(draft.agendaItems) ? draft.agendaItems : []).map(i => typeof i === 'string' ? i : (i.topic || ''));
  if (!items.length) { showToast('This draft has no agenda items to print.', 'warn'); return; }
  // Temporarily populate the selected list so abPrintAgenda() can use it
  const prev = S.agendaBuilderSelected;
  const prevDraft = S.agendaBuilderDraftsHistory;
  S.agendaBuilderSelected = items;
  // Also push as first history entry so title/date/venue are picked up
  S.agendaBuilderDraftsHistory = [draft, ...S.agendaBuilderDraftsHistory.filter(d => d.id !== draft.id)];
  abPrintAgenda();
  S.agendaBuilderSelected = prev;
  S.agendaBuilderDraftsHistory = prevDraft;
}

function abCopyHistoryMessage(msg) {
  if (!msg) return;
  navigator.clipboard.writeText(msg).then(
    () => showToast('Copied to clipboard.', 'success'),
    () => showToast('Could not copy. Please copy manually.', 'warn'),
  );
}

// Load a past draft as the starting point for a new draft (Reuse / Adapt).
// Copies the agenda items, settings, and message text into the builder state,
// then creates a fresh draft so the original remains intact in the history.
async function abReuseAsDraft(draftId) {
  const past = (S.agendaBuilderDraftsHistory || []).find(d => d.id === draftId);
  if (!past) { showToast('Past draft not found.', 'error'); return; }
  if (!confirm(`Start a new draft based on "${past.meetingTitle || 'this past notification'}"?\n\nThe agenda items, settings, and message will be loaded as a starting point.`)) return;

  // Clear current draft state and populate from past draft
  S.agendaBuilderDraftId = null;
  S.agendaBuilderSelected = (Array.isArray(past.agendaItems) ? past.agendaItems : [])
    .map(i => typeof i === 'string' ? i : (i.topic || ''));
  S.agendaBuilderMessage = past.messageText || '';
  S.agendaBuilderChecklist = [];  // start fresh checklist for the new meeting

  // Navigate to Step 2 so the user adjusts the agenda for the new meeting
  abSetStep('select');
  const listEl = document.getElementById('ab-selected-list');
  if (listEl) listEl.innerHTML = renderAbSelectedList(S.agendaBuilderSelected);
  showToast('Past draft loaded as a starting point. Adjust the agenda and proceed to Step 3 to set the new meeting date.', 'info');
}

// ── Post-Meeting Outcome Helpers ──────────────────────────────────

// Called when the secretary taps a status button for an agenda item in the outcomes panel.
function abSetOutcome(meetingId, topic, status, rowIdx) {
  if (!S._meetingAgendaOutcomes) S._meetingAgendaOutcomes = {};
  if (!S._meetingAgendaOutcomes[meetingId]) S._meetingAgendaOutcomes[meetingId] = {};

  const current = S._meetingAgendaOutcomes[meetingId][topic];
  // Toggle off if same status clicked again
  if (current === status) {
    delete S._meetingAgendaOutcomes[meetingId][topic];
  } else {
    S._meetingAgendaOutcomes[meetingId][topic] = status;
  }

  // Re-render the row's buttons to reflect the new selection
  const rowEl = document.getElementById(`km-outcome-row-${rowIdx}`);
  if (rowEl) {
    const selectedStatus = S._meetingAgendaOutcomes[meetingId][topic] || '';
    const STATUS_OPTIONS = [
      { value: 'resolved',      label: '✅ Discussed & Resolved',           color: '#16a34a' },
      { value: 'carry_forward', label: '🔁 Discussed — Carry Forward',      color: '#d97706' },
      { value: 'not_discussed', label: '⏭️ Not Discussed — Carry Forward', color: '#6b7280' },
    ];
    const btnGroup = rowEl.querySelector('div[style*="flex"]');
    if (btnGroup) {
      btnGroup.innerHTML = STATUS_OPTIONS.map(o => `
        <button class="kbtn kbtn-sm ${selectedStatus === o.value ? 'kbtn-primary' : 'kbtn-ghost'}"
          style="font-size:11px;${selectedStatus === o.value ? `background:${o.color};border-color:${o.color}` : ''}"
          onclick="Kpsc.abSetOutcome(${esc(JSON.stringify(meetingId))},${esc(JSON.stringify(topic))},${esc(JSON.stringify(o.value))},${rowIdx})"
        >${esc(o.label)}</button>
      `).join('');
    }
  }
}

// Called when "Save Outcomes" is clicked in the Post-Meeting Closure panel.
async function abSaveOutcomes(meetingId, btn) {
  const outcomes = S._meetingAgendaOutcomes?.[meetingId] || {};
  const outcomeArray = Object.entries(outcomes).map(([topic, status]) => ({ topic, status }));

  // Find the linked WhatsApp draft for this meeting
  const draft = (S.agendaBuilderDraftsHistory || []).find(d => d.linkedMeetingId === meetingId);
  if (!draft) {
    // Try to load all drafts to find one linked to this meeting
    const allDrafts = await apiGet('kpsc-whatsapp-draft');
    if (!Array.isArray(allDrafts)) { showToast('Could not load notification drafts.', 'error'); return; }
    S.agendaBuilderDraftsHistory = allDrafts;
    const foundDraft = allDrafts.find(d => d.linkedMeetingId === meetingId);
    if (!foundDraft) {
      showToast('No linked meeting notification found. Please use the Agenda Builder to create and link a notification for this meeting first.', 'warn');
      return;
    }
    return abSaveOutcomesToDraft(foundDraft.id, outcomeArray, btn);
  }
  return abSaveOutcomesToDraft(draft.id, outcomeArray, btn);
}

async function abSaveOutcomesToDraft(draftId, outcomes, btn) {
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const res = await apiPost(`kpsc-whatsapp-draft/${draftId}/outcomes`, { outcomes });
    if (res?.error) { showToast(res.error, 'error'); return; }
    // Update history entry with new outcomes
    if (Array.isArray(S.agendaBuilderDraftsHistory)) {
      const idx = S.agendaBuilderDraftsHistory.findIndex(d => d.id === draftId);
      if (idx >= 0) S.agendaBuilderDraftsHistory[idx] = { ...S.agendaBuilderDraftsHistory[idx], ...res };
    }
    const cfCount = Array.isArray(res.carryForwardItems) ? res.carryForwardItems.length : 0;
    const msg = cfCount > 0
      ? `Outcomes saved. ${cfCount} item${cfCount > 1 ? 's' : ''} will be carried forward to the next meeting.`
      : 'Outcomes saved successfully.';
    showToast(msg, 'success');
    // Re-render the outcomes panel to show the "all done" confirmation
    const outcomePanel = document.querySelector('[id^="km-save-outcomes-btn"]')?.closest('details');
    if (outcomePanel) {
      const summary = outcomePanel.querySelector('summary .kbadge');
      if (summary) summary.textContent = `${outcomes.length}/${outcomes.length} marked`;
      if (summary) summary.className = 'kbadge badge-green';
      outcomePanel.open = false;
    }
  } catch {
    showToast('Could not save outcomes. Check your connection.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

/**
 * Uses AI to analyse the current meeting's transcript/minutes and suggest an
 * outcome (resolved / carry_forward / not_discussed) for each agenda item.
 * High-confidence suggestions are auto-applied; medium and low confidence items
 * are flagged for human review with a badge showing the AI's rationale.
 *
 * @param {string} meetingId  The active meeting's ID
 * @param {HTMLButtonElement} btn  The clicked button (disabled during the request)
 */
async function abAiAnalyseOutcomes(meetingId, btn) {
  const statusEl = document.getElementById('km-ai-outcomes-status');
  const origText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '🤖 Analysing…'; }
  if (statusEl) statusEl.textContent = 'AI is reading the minutes…';

  try {
    const res = await apiPost(`ai-secretary-meetings/${meetingId}/suggest-outcomes`, {});
    if (res?.error) {
      showToast(res.error, 'error');
      if (statusEl) statusEl.textContent = '';
      return;
    }
    // Store suggestions
    if (!S._meetingOutcomeSuggestions) S._meetingOutcomeSuggestions = {};
    const sugMap = {};
    const STATUS_OPTIONS = [
      { value: 'resolved',      label: '✅ Resolved' },
      { value: 'carry_forward', label: '🔁 Carry Forward' },
      { value: 'not_discussed', label: '⏭️ Not Discussed' },
    ];
    for (const s of (res.suggestions || [])) {
      const opt = STATUS_OPTIONS.find(o => o.value === s.status);
      sugMap[s.topic] = { status: s.status, confidence: s.confidence, rationale: s.rationale, label: opt?.label || s.status, needsHumanInput: s.needsHumanInput };
      // Auto-apply high-confidence suggestions only if not already set
      if (s.confidence === 'high' && !S._meetingAgendaOutcomes?.[meetingId]?.[s.topic]) {
        if (!S._meetingAgendaOutcomes) S._meetingAgendaOutcomes = {};
        if (!S._meetingAgendaOutcomes[meetingId]) S._meetingAgendaOutcomes[meetingId] = {};
        S._meetingAgendaOutcomes[meetingId][s.topic] = s.status;
      }
    }
    S._meetingOutcomeSuggestions[meetingId] = sugMap;

    const highCount = (res.suggestions || []).filter(s => s.confidence === 'high').length;
    const needsReview = (res.suggestions || []).filter(s => s.needsHumanInput).length;
    let msg = `AI analysed ${(res.suggestions || []).length} items. ${highCount} auto-applied.`;
    if (needsReview > 0) msg += ` ${needsReview} need your review.`;
    showToast(msg, 'success');
    if (statusEl) statusEl.textContent = needsReview > 0 ? `⚠️ ${needsReview} item(s) need your input` : '✓ All suggestions applied';

    // Re-render the outcomes list (use same item resolution priority as renderPostMeetingOutcomes)
    const meeting = S.activeMeeting;
    if (meeting) {
      const listEl = document.getElementById('km-outcomes-list');
      if (listEl) {
        let items2 = [];
        if (Array.isArray(meeting.agendaItems) && meeting.agendaItems.length) {
          items2 = meeting.agendaItems.filter(i => String(i).trim().length > 1).map(i => typeof i === 'object' ? (i.topic || String(i)) : String(i));
        }
        if (!items2.length) {
          const draft = (S.agendaBuilderDraftsHistory || []).find(d => d.linkedMeetingId === meeting.id);
          if (draft && Array.isArray(draft.agendaItems) && draft.agendaItems.length) {
            items2 = draft.agendaItems.filter(i => String(i).trim().length > 1).map(i => typeof i === 'object' ? (i.topic || String(i)) : String(i));
          }
        }
        if (!items2.length && meeting.agendaText) {
          const rawLines = meeting.agendaText.split('\n').map(l => l.trim()).filter(Boolean);
          items2 = rawLines.map(l => l.replace(/^[\d]+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim()).filter(l => l.length > 1);
        }
        const outcomes2 = S._meetingAgendaOutcomes[meetingId] || {};
        const STATUS_OPTIONS2 = [
          { value: 'resolved',      label: '✅ Resolved',      color: '#16a34a' },
          { value: 'carry_forward', label: '🔁 Carry Forward', color: '#d97706' },
          { value: 'not_discussed', label: '⏭️ Not Discussed', color: '#6b7280' },
        ];
        listEl.innerHTML = items2.map((item, i) => {
          const cur = outcomes2[item] || '';
          const sug2 = sugMap[item];
          return `<div class="k-outcome-row" id="km-outcome-row-${i}">
            <div class="k-outcome-topic">${esc(item)}${outcomeConfidenceBadge(sug2, cur)}</div>
            <div class="k-outcome-btns">
              ${STATUS_OPTIONS2.map(o => `<button class="kbtn kbtn-sm ${cur === o.value ? 'kbtn-primary' : 'kbtn-ghost'}" style="${cur === o.value ? `background:${o.color};border-color:${o.color}` : ''}" onclick="Kpsc.abSetOutcome(${esc(JSON.stringify(meetingId))},${esc(JSON.stringify(item))},${esc(JSON.stringify(o.value))},${i})">${esc(o.label)}</button>`).join('')}
            </div>
          </div>`;
        }).join('');
      }
    }
  } catch {
    showToast('AI analysis failed. Check your connection.', 'error');
    if (statusEl) statusEl.textContent = '';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

// ── Agenda Builder Voice Note ───────────────────────────────────

async function abToggleVoice() {
  const btn = document.getElementById('ab-voice-btn');
  const statusEl = document.getElementById('ab-voice-status');
  if (S.agendaBuilderNotesRec) {
    // Stop recording
    S.agendaBuilderNotesRec.stop();
    S.agendaBuilderNotesRec = null;
    if (btn) btn.textContent = '🎙 Record Voice Note';
    if (statusEl) statusEl.textContent = 'Processing…';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const mr = new MediaRecorder(stream);
    S.agendaBuilderNotesRec = mr;
    mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      S.agendaBuilderNotesRec = null;
      if (btn) { btn.textContent = '🎙 Record Voice Note'; btn.classList.remove('kbtn-amber'); }
      if (statusEl) statusEl.textContent = 'Transcribing…';
      try {
        // Map MIME type to a file extension for the transcription upload.
        const mimeType = mr.mimeType || 'audio/webm';
        const mime = mimeType.split(';')[0].trim().toLowerCase();
        const ext = AUDIO_MIME_TO_EXT[mime] || 'webm';
        const audioFile = new File(chunks, `note.${ext}`, { type: mimeType });
        // Transcribed server-side via the existing kpsc-transcribe-audio
        // endpoint — the browser never sees the raw OpenAI key (it used to
        // fetch it from /api/settings and call OpenAI directly from here).
        const data = await uploadAudioWithRetry('kpsc-transcribe-audio', audioFile, mimeType);
        if (data?.error) throw new Error(data.error);
        const transcribed = (data.transcript || '').trim();
        if (transcribed) {
          const ta = document.getElementById('ab-note-text');
          if (ta) {
            ta.value = ta.value ? `${ta.value}\n${transcribed}` : transcribed;
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
          }
          if (statusEl) statusEl.textContent = '✓ Transcribed';
        } else {
          if (statusEl) statusEl.textContent = 'Nothing captured.';
        }
      } catch (e2) {
        if (statusEl) statusEl.textContent = `Transcription failed: ${e2.message}`;
      }
    };
    mr.start();
    if (btn) { btn.textContent = '⏹ Stop Recording'; btn.classList.add('kbtn-amber'); }
    if (statusEl) statusEl.textContent = '● Recording…';
  } catch (e) {
    showToast(`Microphone error: ${e.message}`, 'error');
  }
}

function showNewMonthDraftModal() {
  const d = S.newmonthDraft;
  if (!d) return;
  document.getElementById('nm-draft-modal')?.remove();
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLabel = d.draftMonth ? (MONTH_NAMES[d.draftMonth - 1] || '') : '';
  const yearLabel  = d.draftYear || '';
  const charCount = (d.draft || '').length;
  const pages = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

  const modal = document.createElement('div');
  modal.id = 'nm-draft-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:520px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Happy New Month SMS — ${monthLabel} ${yearLabel}</span>
        <button class="kbtn kbtn-ghost kbtn-sm" onclick="Kpsc.dismissNewMonthDraft()">✕</button>
      </div>
      <div class="k-modal-body">
        <p class="k-hint" style="margin-bottom:12px">AI-drafted on the 3rd. This will auto-send on the 1st of ${monthLabel}. Edit if needed, then save.</p>
        <textarea id="nm-draft-text" class="k-textarea" style="width:100%;min-height:120px;font-size:14px;padding:10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;resize:vertical">${esc(d.draft || '')}</textarea>
        <div id="nm-draft-charcount" style="font-size:12px;color:var(--text3);margin:4px 0 0">
          ${charCount} chars — ${pages} SMS page${pages !== 1 ? 's' : ''} (GSM-7)
        </div>
      </div>
      <div class="k-modal-footer">
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveNewMonthDraft()">Save Changes</button>
        <button class="kbtn kbtn-ghost" onclick="Kpsc.dismissNewMonthDraft()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const ta = document.getElementById('nm-draft-text');
  const ccDiv = document.getElementById('nm-draft-charcount');
  if (ta && ccDiv) {
    ta.addEventListener('input', () => {
      const n = ta.value.length;
      const pg = n <= 160 ? 1 : Math.ceil(n / 153);
      ccDiv.textContent = `${n} chars — ${pg} SMS page${pg !== 1 ? 's' : ''} (GSM-7)`;
    });
  }
}

async function saveNewMonthDraft() {
  const ta = document.getElementById('nm-draft-text');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) { showToast('Draft cannot be empty', 'warn'); return; }
  try {
    await apiPost('kpsc-newmonth-draft', { draft: text });
    if (S.newmonthDraft) S.newmonthDraft.draft = text;
    document.getElementById('nm-draft-modal')?.remove();
    showToast('Draft saved!', 'success');
  } catch {
    showToast('Failed to save draft', 'error');
  }
}

function dismissNewMonthDraft() {
  document.getElementById('nm-draft-modal')?.remove();
  if (S.newmonthDraft) S.newmonthDraft.draft = '';
  document.getElementById('nm-draft-banner')?.remove();
}

// ══════════════════════════════════════════════════════════════════════
// KPSC POLICY MANAGEMENT
// ══════════════════════════════════════════════════════════════════════

async function loadKpscPoliciesCard() {
  const container = document.getElementById('ks-policies-content');
  if (!container) return;
  container.innerHTML = '<em style="font-size:13px;color:#888">Loading…</em>';
  try {
    const [welfareRes, byelawRes, welfareHist, byelawHist, summaries] = await Promise.all([
      apiGet('kpsc-policy?type=welfare').catch(() => null),
      apiGet('kpsc-policy?type=byelaw').catch(() => null),
      apiGet('kpsc-policy/versions?type=welfare').catch(() => null),
      apiGet('kpsc-policy/versions?type=byelaw').catch(() => null),
      apiGet('kpsc-policy/summary').catch(() => null),
    ]);
    container.innerHTML = renderPoliciesCardContent({
      welfare: welfareRes,
      byelaw: byelawRes,
      welfareVersions: welfareHist?.versions || [],
      byelawVersions: byelawHist?.versions || [],
      welfareSummary: summaries?.welfareSummary || '',
      byelawSummary: summaries?.byelawSummary || '',
    });
  } catch (e) {
    container.innerHTML = `<p class="k-hint" style="color:var(--danger)">Failed to load policy data.</p>`;
  }
}

function renderPoliciesCardContent({ welfare, byelaw, welfareVersions, byelawVersions, welfareSummary, byelawSummary }) {
  return `
    ${renderPolicySection('welfare', 'Welfare Support Policy', welfare, welfareVersions, welfareSummary)}
    <div style="height:1px;background:var(--border);margin:24px 0"></div>
    ${renderPolicySection('byelaw', 'KPSC Byelaw & Governance', byelaw, byelawVersions, byelawSummary)}
  `;
}

function renderPolicySection(type, title, current, versions, summaryText) {
  const hasContent = current?.content;
  const recentVersions = (versions || []).slice(0, 5);
  const hasMore = (versions || []).length > 5;

  return `
    <div class="k-policy-section" id="kps-${type}">
      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--navy)">${title}</h3>
      ${hasContent ? `<p class="k-hint" style="margin-bottom:12px">Current: <strong>v${current.version}</strong> · Effective ${esc(current.effectiveDate || '')} · Approved by ${esc(current.approvedBy || 'Unknown')}</p>` : `<p class="k-hint" style="margin-bottom:12px;color:var(--danger)">No version published yet.</p>`}

      <div class="k-form-group">
        <label class="k-label">Login Page Summary (2–3 sentences)</label>
        <textarea id="kps-${type}-summary" class="k-input k-textarea" rows="2" placeholder="Brief summary shown to visitors on the KPSC login page.">${esc(summaryText)}</textarea>
      </div>

      <div class="k-form-group" style="margin-top:12px">
        <label class="k-label">Import from Document or URL</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
          <label class="kbtn kbtn-sm kbtn-ghost" style="cursor:pointer;margin:0" title="Upload PDF, Word (.docx), or plain text file">
            📎 Upload File
            <input type="file" id="kps-${type}-file-input" accept=".pdf,.docx,.doc,.txt" style="display:none"
              onchange="Kpsc.importPolicyFile('${type}',this)">
          </label>
          <div style="display:flex;gap:6px;flex:1;min-width:220px">
            <input type="url" id="kps-${type}-url-input" class="k-input" style="font-size:13px;padding:6px 10px"
              placeholder="https://… paste policy URL" />
            <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.importPolicyUrl('${type}')" id="kps-${type}-url-btn">🔗 Import</button>
          </div>
        </div>
        <p class="k-hint" style="margin-bottom:8px">Supports PDF, Word (.docx), plain text, or any public web URL. After import the text is automatically AI-formatted into structured Markdown.</p>
      </div>

      <div class="k-form-group" style="margin-top:4px">
        <label class="k-label">Policy Text (Markdown)</label>
        <div style="margin-bottom:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.policyToolbar('${type}','bold')" title="Bold"><strong>B</strong></button>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.policyToolbar('${type}','italic')" title="Italic"><em>I</em></button>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.policyToolbar('${type}','h2')" title="Section heading">H2</button>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.policyToolbar('${type}','h3')" title="Subsection">H3</button>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.policyToolbar('${type}','ul')" title="Bullet list">• List</button>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.policyToolbar('${type}','ol')" title="Numbered list">1. List</button>
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.policyToolbar('${type}','hr')" title="Divider">—</button>
          <button class="kbtn kbtn-sm kbtn-primary" id="kps-${type}-ai-btn" onclick="Kpsc.aiFormatPolicy('${type}')">✨ AI Format</button>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <textarea id="kps-${type}-edit" class="k-input k-textarea k-policy-textarea" rows="14"
              oninput="Kpsc.updatePolicyPreview('${type}')"
              style="font-family:monospace;font-size:12px;resize:vertical">${esc(hasContent ? current.content : '')}</textarea>
          </div>
          <div style="flex:1;min-width:0;max-height:340px;overflow-y:auto;border:1.5px solid var(--border);border-radius:8px;padding:12px;background:#fafafa;font-size:14px;line-height:1.7" id="kps-${type}-preview">
            ${hasContent ? minutesHtml(current.content) : '<em style="color:#aaa">Live preview…</em>'}
          </div>
        </div>
      </div>

      <div class="k-form-group" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:180px">
          <label class="k-label">Change Summary</label>
          <input type="text" id="kps-${type}-change-summary" class="k-input" placeholder="e.g. Updated eligibility criteria" />
        </div>
        <div style="width:150px">
          <label class="k-label">Effective Date</label>
          <input type="date" id="kps-${type}-effective-date" class="k-input" value="${new Date().toISOString().slice(0,10)}" />
        </div>
      </div>
      <div id="kps-${type}-msg" class="k-settings-msg" style="display:none;margin-top:8px"></div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="kbtn kbtn-primary" onclick="Kpsc.publishPolicyVersion('${type}',this)">Publish New Version</button>
        <a class="kbtn kbtn-ghost" href="/kpsc/${type === 'welfare' ? 'welfare-policy' : 'byelaw'}/" target="_blank" rel="noopener">View Public Page ↗</a>
      </div>

      ${recentVersions.length ? `
      <div style="margin-top:16px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">Version History</div>
        <div id="kps-${type}-history">
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <thead><tr style="color:var(--text3)"><th style="text-align:left;padding:4px 8px 4px 0">Ver</th><th style="text-align:left;padding:4px 8px">Date</th><th style="text-align:left;padding:4px 8px">Approved by</th><th style="text-align:left;padding:4px 8px">Summary</th><th></th></tr></thead>
            <tbody>
              ${recentVersions.map(v => `
                <tr style="border-top:1px solid var(--border)">
                  <td style="padding:6px 8px 6px 0;color:${v.is_current?'var(--green)':'var(--text2)'};font-weight:${v.is_current?'600':'400'}">v${v.version_num}${v.is_current?' ✓':''}</td>
                  <td style="padding:6px 8px;color:var(--text2)">${esc(v.effective_date||v.created_at?.slice(0,10)||'')}</td>
                  <td style="padding:6px 8px;color:var(--text2)">${esc(v.approved_by||'')}</td>
                  <td style="padding:6px 8px;color:var(--text2);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.change_summary||'')}</td>
                  <td style="padding:6px 8px">${v.is_current?'':'<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.confirmRollbackPolicy(\''+type+'\',\''+v.id+'\','+v.version_num+')">Rollback</button>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          ${hasMore ? `<button class="kbtn kbtn-sm kbtn-ghost" style="margin-top:6px" onclick="Kpsc.showAllPolicyVersions('${type}')">Show all ${versions.length} versions</button>` : ''}
        </div>
      </div>` : ''}
    </div>
  `;
}

function updatePolicyPreview(type) {
  const md = document.getElementById(`kps-${type}-edit`)?.value || '';
  const preview = document.getElementById(`kps-${type}-preview`);
  if (preview) preview.innerHTML = md ? minutesHtml(md) : '<em style="color:#aaa">Live preview…</em>';
}

function policyToolbar(type, action) {
  const ta = document.getElementById(`kps-${type}-edit`);
  if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const sel = ta.value.slice(start, end);
  const before = ta.value.slice(0, start), after = ta.value.slice(end);
  let insert = '';
  if (action === 'bold')   insert = `**${sel || 'bold text'}**`;
  if (action === 'italic') insert = `_${sel || 'italic text'}_`;
  if (action === 'h2')     insert = `\n## ${sel || 'Section Heading'}\n`;
  if (action === 'h3')     insert = `\n### ${sel || 'Subsection'}\n`;
  if (action === 'ul')     insert = `\n- ${sel || 'item'}\n`;
  if (action === 'ol')     insert = `\n1. ${sel || 'item'}\n`;
  if (action === 'hr')     insert = `\n\n---\n\n`;
  ta.value = before + insert + after;
  ta.selectionStart = ta.selectionEnd = start + insert.length;
  ta.focus();
  updatePolicyPreview(type);
}

async function aiFormatPolicy(type) {
  const btn = document.getElementById(`kps-${type}-ai-btn`);
  const ta = document.getElementById(`kps-${type}-edit`);
  if (!ta || !btn) return;
  const rawText = ta.value.trim();
  if (!rawText) { showToast('Paste policy text first, then click AI Format.', 'info'); return; }
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Formatting…';
  try {
    const res = await apiPost('kpsc-policy/ai-format', { text: rawText, docType: type });
    if (res?.formatted) {
      ta.value = res.formatted;
      updatePolicyPreview(type);
      showToast('Formatted — review the structure before publishing.', 'success');
    } else {
      showToast('AI formatting failed — you can still publish the text as-is.', 'error');
    }
  } catch (e) {
    showToast('AI formatting failed — you can still publish the text as-is.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function publishPolicyVersion(type, btn) {
  const content = document.getElementById(`kps-${type}-edit`)?.value?.trim() || '';
  const summary = document.getElementById(`kps-${type}-summary`)?.value?.trim() || '';
  const changeSummary = document.getElementById(`kps-${type}-change-summary`)?.value?.trim() || '';
  const effectiveDate = document.getElementById(`kps-${type}-effective-date`)?.value || '';
  const msgEl = document.getElementById(`kps-${type}-msg`);
  if (!content) { if (msgEl) { msgEl.style.display='block'; msgEl.className='k-settings-msg k-settings-msg-err'; msgEl.textContent='Policy text cannot be empty.'; } return; }
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Publishing…';
  try {
    const res = await apiPost('kpsc-policy', { policyType: type, contentMd: content, summary, changeSummary, effectiveDate });
    if (res?.versionNum) {
      if (msgEl) { msgEl.style.display='block'; msgEl.className='k-settings-msg k-settings-msg-ok'; msgEl.textContent=`Published as v${res.versionNum}.`; }
      showToast(`${type === 'welfare' ? 'Welfare Policy' : 'Byelaw'} published as v${res.versionNum}.`, 'success');
      setTimeout(() => loadKpscPoliciesCard(), 800);
    } else {
      if (msgEl) { msgEl.style.display='block'; msgEl.className='k-settings-msg k-settings-msg-err'; msgEl.textContent=res?.error||'Failed to publish.'; }
    }
  } catch (e) {
    if (msgEl) { msgEl.style.display='block'; msgEl.className='k-settings-msg k-settings-msg-err'; msgEl.textContent='Failed to publish: '+e.message; }
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function confirmRollbackPolicy(type, targetVersionId, targetVersionNum) {
  document.getElementById('kps-rollback-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'kps-rollback-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:420px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Rollback to v${targetVersionNum}?</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('kps-rollback-modal').remove()">✕</button>
      </div>
      <div class="k-modal-body">
        <p style="font-size:14px;line-height:1.6">A new version will be created with the content from <strong>v${targetVersionNum}</strong>. The public page will update immediately. All previous versions remain visible in the history.</p>
      </div>
      <div class="k-modal-footer" style="display:flex;gap:8px">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('kps-rollback-modal').remove()">Cancel</button>
        <button class="kbtn kbtn-danger" onclick="Kpsc.doRollbackPolicy('${type}','${targetVersionId}',this)">Rollback to v${targetVersionNum}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function doRollbackPolicy(type, targetVersionId, btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Rolling back…';
  try {
    const res = await apiPost('kpsc-policy/rollback', { targetVersionId });
    if (res?.versionNum) {
      document.getElementById('kps-rollback-modal')?.remove();
      showToast(`Rolled back. Now at v${res.versionNum}.`, 'success');
      setTimeout(() => loadKpscPoliciesCard(), 600);
    } else {
      showToast(res?.error || 'Rollback failed.', 'error');
    }
  } catch (e) {
    showToast('Rollback failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function showAllPolicyVersions(type) {
  try {
    const res = await apiGet(`kpsc-policy/versions?type=${type}`);
    const versions = res?.versions || [];
    const container = document.getElementById(`kps-${type}-history`);
    if (!container) return;
    container.innerHTML = `
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr style="color:var(--text3)"><th style="text-align:left;padding:4px 8px 4px 0">Ver</th><th style="text-align:left;padding:4px 8px">Date</th><th style="text-align:left;padding:4px 8px">Approved by</th><th style="text-align:left;padding:4px 8px">Summary</th><th></th></tr></thead>
        <tbody>
          ${versions.map(v => `
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:6px 8px 6px 0;color:${v.is_current?'var(--green)':'var(--text2)'};font-weight:${v.is_current?'600':'400'}">v${v.version_num}${v.is_current?' ✓':''}</td>
              <td style="padding:6px 8px;color:var(--text2)">${esc(v.effective_date||v.created_at?.slice(0,10)||'')}</td>
              <td style="padding:6px 8px;color:var(--text2)">${esc(v.approved_by||'')}</td>
              <td style="padding:6px 8px;color:var(--text2);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.change_summary||'')}</td>
              <td style="padding:6px 8px">${v.is_current?'':'<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.confirmRollbackPolicy(\''+type+'\',\''+v.id+'\','+v.version_num+')">Rollback</button>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    showToast('Failed to load version history.', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════
// KPSC AMENDMENT WORKFLOW
// ══════════════════════════════════════════════════════════════════════

function canApplyAmendment() {
  const role = String(S.user?.role || '').toLowerCase();
  return role === 'acting_chairman' || role === 'general_secretary' || role === 'it_admin';
}

function showAmendmentWorkflowModal(insightText, meetingId, itemKey) {
  document.getElementById('k-amendment-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'k-amendment-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:620px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">📜 Apply Byelaw Amendment</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-amendment-modal').remove()">✕</button>
      </div>
      <div class="k-modal-body" id="k-amendment-body">
        <div class="k-amendment-steps" style="display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px">
          <span class="k-amend-step k-amend-step-active" id="k-amend-s1">① Review</span>
          <span class="k-amend-step" id="k-amend-s2">② Check Diff</span>
          <span class="k-amend-step" id="k-amend-s3">③ Apply</span>
        </div>
        <div id="k-amend-panel-1">
          <p style="font-size:12px;color:var(--text2);margin-bottom:6px">Amendment from meeting:</p>
          <blockquote class="k-amendment-quote">${esc(insightText)}</blockquote>
          <p class="k-hint" style="margin-top:10px">AI will read the current byelaw and identify exactly which text changes. Review the diff before applying.</p>
        </div>
        <div id="k-amend-panel-2" style="display:none"></div>
      </div>
      <div class="k-modal-footer" id="k-amendment-footer" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-amendment-modal').remove()">Cancel</button>
        <button class="kbtn kbtn-primary" id="k-amend-gen-btn" onclick="Kpsc.generateAmendmentDiff('${esc(insightText).replace(/'/g,"\\'")}','${meetingId}')">Generate Diff →</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function generateAmendmentDiff(insightText, meetingId) {
  const btn = document.getElementById('k-amend-gen-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analysing byelaw…'; }
  try {
    const res = await apiPost('kpsc-amendment-preview', { insightText, meetingId });
    const panel2 = document.getElementById('k-amend-panel-2');
    const panel1 = document.getElementById('k-amend-panel-1');
    const footer = document.getElementById('k-amendment-footer');
    const s2 = document.getElementById('k-amend-s2'), s3 = document.getElementById('k-amend-s3');
    if (!panel2) return;
    panel1.style.display = 'none';
    panel2.style.display = 'block';
    if (s2) s2.className = 'k-amend-step k-amend-step-active';

    if (!res?.found) {
      // Manual entry mode
      panel2.innerHTML = `
        <div class="k-amendment-warn" style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px">
          ⚠️ ${esc(res?.reason || 'AI could not identify the specific text to change.')} Please enter it manually.
        </div>
        <label class="k-label">Current byelaw text to replace</label>
        <textarea id="k-amend-old-text" class="k-input k-textarea" rows="4" placeholder="Paste the exact text from the byelaw that should be changed…"></textarea>
        <label class="k-label" style="margin-top:10px">Replacement text</label>
        <textarea id="k-amend-new-text" class="k-input k-textarea" rows="4" placeholder="Type the new text that will replace it…"
          oninput="document.getElementById('k-amend-proofread-area')&&(document.getElementById('k-amend-proofread-area').style.display='block')"></textarea>
        <div id="k-amend-proofread-area" style="display:none;margin-top:8px">
          <button class="kbtn kbtn-sm kbtn-ghost" id="k-amend-proof-btn" onclick="Kpsc.aiProofreadAmendment()">✨ AI Proofread</button>
        </div>`;
      if (footer) footer.innerHTML = `
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-amendment-modal').remove()">Cancel</button>
        <button class="kbtn kbtn-primary" onclick="Kpsc.showAmendmentApplyConfirm('${esc(insightText).replace(/'/g,"\\'")}','${meetingId}','manual',null)">Review & Apply →</button>`;
    } else {
      // Found — show diff
      panel2.innerHTML = `
        <p style="font-size:12px;color:var(--text2);margin-bottom:8px">AI identified the following change (confidence: <strong>${res.confidence || 'high'}</strong>):</p>
        ${res.reason ? `<p class="k-hint" style="margin-bottom:10px">${esc(res.reason)}</p>` : ''}
        <div style="display:flex;gap:10px" class="k-diff-wrap">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-transform:uppercase">Before</div>
            <div class="k-diff-old" style="background:#fff5f5;border:1px solid #ffcdd2;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.6;max-height:260px;overflow-y:auto;white-space:pre-wrap">${esc(res.oldText || '')}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-transform:uppercase">After</div>
            <div class="k-diff-new" id="k-amend-new-display" style="background:#f1f8f1;border:1px solid #c8e6c9;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.6;max-height:260px;overflow-y:auto;white-space:pre-wrap">${esc(res.newText || '')}</div>
          </div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="kbtn kbtn-sm kbtn-ghost" id="k-amend-proof-btn" onclick="Kpsc.aiProofreadAmendment()">✨ AI Proofread new text</button>
          <span id="k-amend-proof-toggle" style="display:none;font-size:12px;color:var(--text2)"></span>
        </div>
        <input type="hidden" id="k-amend-old-stored" value="${esc(res.oldText || '')}">
        <input type="hidden" id="k-amend-new-stored" value="${esc(res.newText || '')}">`;
      if (footer) footer.innerHTML = `
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-amendment-modal').remove()">Reject</button>
        <button class="kbtn kbtn-primary" onclick="Kpsc.showAmendmentApplyConfirm('${esc(insightText).replace(/'/g,"\\'")}','${meetingId}','${res.confidence||'high'}','${esc(res.byelawVersionId||'')}')">Approve & Apply →</button>`;
      if (s3) s3.className = 'k-amend-step';
    }
  } catch (e) {
    showToast('Failed to generate diff: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

async function aiProofreadAmendment() {
  const btn = document.getElementById('k-amend-proof-btn');
  const newDisplay = document.getElementById('k-amend-new-display');
  const newTextarea = document.getElementById('k-amend-new-text');
  const source = newDisplay || newTextarea;
  if (!source || !btn) return;
  const text = newDisplay ? (document.getElementById('k-amend-new-stored')?.value || newDisplay.textContent || '') : newTextarea.value;
  if (!text.trim()) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Proofreading…';
  try {
    const res = await apiPost('kpsc-amendment-proofread', { text });
    if (res?.improved) {
      if (newDisplay) {
        // Store original, show proofread
        const origStored = document.getElementById('k-amend-new-stored');
        const toggle = document.getElementById('k-amend-proof-toggle');
        if (origStored && !origStored.dataset.original) origStored.dataset.original = origStored.value;
        origStored.value = res.improved;
        newDisplay.textContent = res.improved;
        if (toggle) {
          toggle.style.display = 'inline';
          toggle.innerHTML = `<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.toggleProofreadView()">Show AI draft</button>`;
          toggle.dataset.showing = 'proofread';
          toggle.dataset.original = origStored.dataset.original || '';
          toggle.dataset.proofread = res.improved;
        }
      } else if (newTextarea) {
        newTextarea.value = res.improved;
      }
      showToast('Proofread complete.', 'success');
    } else {
      showToast('Proofread failed.', 'error');
    }
  } catch (e) {
    showToast('Proofread failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function toggleProofreadView() {
  const toggle = document.getElementById('k-amend-proof-toggle');
  const newDisplay = document.getElementById('k-amend-new-display');
  const stored = document.getElementById('k-amend-new-stored');
  if (!toggle || !newDisplay || !stored) return;
  const showing = toggle.dataset.showing || 'proofread';
  if (showing === 'proofread') {
    newDisplay.textContent = toggle.dataset.original || '';
    stored.value = toggle.dataset.original || '';
    toggle.innerHTML = `<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.toggleProofreadView()">Show proofread</button>`;
    toggle.dataset.showing = 'original';
  } else {
    newDisplay.textContent = toggle.dataset.proofread || '';
    stored.value = toggle.dataset.proofread || '';
    toggle.innerHTML = `<button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.toggleProofreadView()">Show AI draft</button>`;
    toggle.dataset.showing = 'proofread';
  }
}

function showAmendmentApplyConfirm(insightText, meetingId, aiConfidence, byelawVersionId) {
  const oldText = document.getElementById('k-amend-old-stored')?.value || document.getElementById('k-amend-old-text')?.value || '';
  const newText = document.getElementById('k-amend-new-stored')?.value || document.getElementById('k-amend-new-text')?.value || '';
  if (!newText.trim()) { showToast('Replacement text cannot be empty.', 'error'); return; }

  document.getElementById('k-amend-confirm-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'k-amend-confirm-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal" style="max-width:420px">
      <div class="k-modal-hdr">
        <span class="k-modal-title">Confirm Amendment</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('k-amend-confirm-modal').remove()">✕</button>
      </div>
      <div class="k-modal-body">
        <p style="font-size:14px;line-height:1.6">This will update the <strong>KPSC Byelaw</strong> and create a new version. Members will see the updated text immediately on the public page.</p>
        <p style="font-size:13px;color:var(--text2);margin-top:8px">This action is logged in the amendment audit trail and can be rolled back via Settings → Policies.</p>
      </div>
      <div class="k-modal-footer" style="display:flex;gap:8px">
        <button class="kbtn kbtn-ghost" onclick="document.getElementById('k-amend-confirm-modal').remove()">Go Back</button>
        <button class="kbtn kbtn-primary" id="k-amend-final-btn" onclick="Kpsc.applyAmendmentFinal('${esc(insightText).replace(/'/g,"\\'")}','${meetingId}','${aiConfidence}','${byelawVersionId||''}',this)">Apply Amendment</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function applyAmendmentFinal(insightText, meetingId, aiConfidence, byelawVersionId, btn) {
  const oldText = document.getElementById('k-amend-old-stored')?.value || document.getElementById('k-amend-old-text')?.value || '';
  const newText = document.getElementById('k-amend-new-stored')?.value || document.getElementById('k-amend-new-text')?.value || '';
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Applying…';
  try {
    const res = await apiPost('kpsc-amendment-apply', { oldText, newText, insightText, meetingId, byelawVersionId, aiConfidence });
    if (res?.versionNum) {
      document.getElementById('k-amend-confirm-modal')?.remove();
      document.getElementById('k-amendment-modal')?.remove();
      showToast(`Byelaw updated to v${res.versionNum}.`, 'success');
      // Mark the amendment as applied in the insights view
      const amendBtns = document.querySelectorAll(`[data-amendment-key="${meetingId}"]`);
      amendBtns.forEach(el => {
        el.outerHTML = `<span class="kbadge badge-green" style="cursor:pointer" title="Click to view version history" onclick="Kpsc.navigate('settings')">✓ Applied in v${res.versionNum}</span>`;
      });
    } else {
      showToast(res?.error || 'Failed to apply amendment.', 'error');
    }
  } catch (e) {
    showToast('Failed to apply amendment: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ══════════════════════════════════════════════════════════════════════
// POLICY DOCUMENT IMPORT (file upload + URL)
// ══════════════════════════════════════════════════════════════════════

async function importPolicyFile(type, input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = ''; // reset so same file can be re-selected
  const ext = file.name.split('.').pop().toLowerCase();

  showToast(`Reading ${file.name}…`, 'info');

  try {
    let rawText = '';

    if (ext === 'txt') {
      rawText = await file.text();

    } else if (ext === 'docx' || ext === 'doc') {
      rawText = await extractDocxText(file);

    } else if (ext === 'pdf') {
      rawText = await extractPdfText(file);

    } else {
      showToast('Unsupported file type. Use PDF, Word (.docx), or plain text (.txt).', 'error');
      return;
    }

    if (!rawText.trim()) {
      showToast('No text could be extracted from the file.', 'error');
      return;
    }

    const ta = document.getElementById(`kps-${type}-edit`);
    if (ta) {
      ta.value = rawText;
      updatePolicyPreview(type);
    }
    showToast('File imported — formatting with AI…', 'info');
    await aiFormatPolicy(type);

  } catch (e) {
    showToast('Failed to read file: ' + e.message, 'error');
  }
}

async function importPolicyUrl(type) {
  const input = document.getElementById(`kps-${type}-url-input`);
  const btn = document.getElementById(`kps-${type}-url-btn`);
  const url = input?.value?.trim();
  if (!url) { showToast('Paste a URL first.', 'info'); return; }

  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Fetching…';

  try {
    const res = await apiPost('kpsc-policy/fetch-url', { url });
    if (!res?.text?.trim()) {
      showToast(res?.error || 'No readable text found at that URL.', 'error');
      return;
    }
    const ta = document.getElementById(`kps-${type}-edit`);
    if (ta) {
      ta.value = res.text;
      updatePolicyPreview(type);
    }
    if (input) input.value = '';
    showToast('URL content imported — formatting with AI…', 'info');
    await aiFormatPolicy(type);
  } catch (e) {
    showToast('Import failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

async function extractDocxText(file) {
  if (!window.mammoth) {
    await loadScript('https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js');
  }
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

window.Kpsc = {
  login,
  logout,
  submitPinChange,
  navigate,
  goBack,
  fabAction,
  toggleSearch,
  onSearchInput,
  closeSearch,
  globalSearch,
  startNewMeeting,
  openMeeting,
  saveMeeting,
  deleteMeeting,
  discardMeetingFromRoom,
  endMeeting,
  processMeeting,
  saveMinutesReview,
  openReviewEditor,
  updateMinutesPreview,
  aiProofreadMinutes,
  krNotesUploadPhoto,
  krNotesToggleVoice,
  addMember,
  removeMember,
  memberFieldChange,
  saveMembers,
  addPartner,
  editPartner,
  closePartnerModal,
  savePartner,
  togglePartnerMonth,
  _confirmMarkMonthPaid,
  _submitQuickPayConfirm,
  setPartnersFilter,
  setPartnersTypeFilter,
  setInboxTab,
  setPartnersYear,
  setPartnersMonth,
  setPartnersPaymentFilter,
  setPartnersSearch,
  deletePartner,
  _confirmDeletePartner,
  openPartnerDetail,
  setPartnerDetailYear,
  openRecordPaymentModal,
  _togglePaymentChip,
  _updatePaymentTotal,
  _selectCardRecorded,
  markPaymentCardRecorded,
  _handleIllustrationUpload,
  saveRecordedPayments,
  deletePartnerPayment,
  deletePartnerPaymentWithPin,
  editPartnerPaymentWithPin,
  openEditPartnerPaymentModal,
  saveEditedPartnerPayment,
  requirePin,
  _submitPinConfirm,
  updateSmsCounter,
  openFinanceModal,
  closeFinanceModal,
  saveFinanceEntry,
  ackEmailIngestAttention,
  updateFinanceCategoryOptions,
  onFinanceCategoryChange,
  scanReceiptPhoto,
  mapReceiptOcrToFormFields,
  setFinanceYear,
  setFinanceMonth,
  setFinanceSearch,
  setFinanceTypeFilter,
  setFinanceCatFilter,
  setFinanceMethodFilter,
  sortFinanceBy,
  exportFinanceCsv,
  printFinanceReport,
  openFinanceReportModal,
  generateFinanceReport,
  _selectAllReportMonths,
  _getSelectedReportMonths,
  _generateLocalReport,
  _generateShareableLink,
  showShareLinkModal,
  rerenderFinanceEntryList,
  deleteFinanceEntry,
  editFinanceEntryWithPin,
  deleteFinanceEntryWithPin,
  runReconciliation,
  copyReminderMessage,
  personalizeReminder,
  runRemindersNow,
  retrySms,
  retryAllFailedSms,
  reconcileDeliveryStatus,
  setSmsLogsFilter,
  setSmsLogsYear,
  setSmsLogsMonth,
  copyText,
  useReminderVariant,
  closePersonalizeModal,
  debouncedSaveReminderTemplate,
  setReportsYear,
  setProgressMonth,
  setProgressFilter,
  setProgressSearch,
  setReportsMonth,
  setReportsFilter,
  setReportsSearch,
  setReportsAssignee,
  setReportsApproval,
  setInsightsViewMode,
  loadKpscPoliciesCard,
  importPolicyFile,
  importPolicyUrl,
  updatePolicyPreview,
  policyToolbar,
  aiFormatPolicy,
  publishPolicyVersion,
  confirmRollbackPolicy,
  doRollbackPolicy,
  showAllPolicyVersions,
  showAmendmentWorkflowModal,
  generateAmendmentDiff,
  aiProofreadAmendment,
  toggleProofreadView,
  showAmendmentApplyConfirm,
  applyAmendmentFinal,
  toggleInsightsDigest,
  toggleInsightEdit,
  saveInsightActionEdit,
  printInsightsReport,
  shareInsightActions,
  updateReportActionStatus,
  // Insights Review (Step 4)
  addIrRow,
  removeIrRow,
  addIrResRow,
  removeIrResRow,
  saveInsightsReview,
  irOpenEditMode,
  irEditInsightItem,
  irRemoveInsightItem,
  promoteInsightProject,
  saveKpscOpsSettings,
  savePartnershipSettings,
  saveRolePermissions,
  resetRolePermissions,
  partnerTypeLabel,
  filterArchive,
  setArchiveQuickFilter,
  openAccountEditor,
  closeAccountEditor,
  saveAccountEditor,
  confirmDeleteKpscAccount,
  executeDeleteKpscAccount,
  saveSettings,
  saveAiModels,
  clearAiKeys,
  saveSmsSettings,
  toggleReminderDayField,
  clearSmsKey,
  saveAdvSmsSettings,
  sendTestSms,
  checkTermiiBalance,
  showRechargeWalletModal,
  saveRechargeBankDetails,
  dismissLowBalanceNotice,
  goToSmsWalletRecharge,
  saveSmsTemplate,
  deleteSmsTemplate,
  aiGenerateNewMonthSms,
  saveSystemSmsTemplates,
  renderSmsTemplatesList,
  scheduleSmsBlast,
  deleteScheduledSms,
  renderScheduledSmsList,
  testDeepseekKey,
  testOpenaiKey,
  refreshApiStatus,
  updateAttGroup,
  recStart,
  recPause,
  recResume,
  recStop,
  recReset,
  assignSpeaker,
  // VF-3 voice fingerprint enrollment
  showVoiceFpEnrollModal,
  closeVoiceFpModal,
  startVoiceFpRecording,
  submitVoiceFpEnrollment,
  removeVoiceFpEnrollment,
  // Projects
  renderProjects,
  setProjectsFilter,
  openProjectModal,
  closeProjectModal,
  saveProject,
  changeProjectStatus,
  deleteProject,
  extractProjectsFromMeetingUI,
  // Meeting - upload notes
  setMeetingTab,
  previewNotesPhoto,
  ocrNotesPhoto,
  // Meeting - upload audio (+ combined mode, + diarization)
  previewAudioFile,
  transcribeAudioFile,
  previewAudioNotesPhoto,
  ocrNotesAndAppend,
  applyDiarizedTranscript,
  applyDiarizedTranscriptRaw,
  // Meeting - live recording notes upload
  previewRecNotesPhoto,
  ocrRecNotesPhoto,
  // Finance - PDF reconciliation
  setReconciliationTab,
  runPdfReconciliation,
  // Minutes PDF + WhatsApp sharing
  printMinutes,
  shareMinutesWhatsApp,
  revokeMinutesPublicLink,
  togglePlainEnglish,
  // B5: Follow-up nudges
  approveFollowup,
  saveFollowupEdit,
  skipFollowup,
  // Action Items page
  setActionItemsFilter,
  setActionItemsYear,
  setActionItemsMonth,
  setActionItemsAssignee,
  setActionItemsMeeting,
  setActionItemsPriority,
  setActionItemsSearch,
  setActionItemsViewMode,
  updateActionItemStatusById,
  toggleActionItemDone,
  deleteActionItemById,
  openActionItemEdit,
  closeActionItemEdit,
  submitActionItemEdit,
  openActionItemCreateForm,
  closeActionItemCreateForm,
  submitActionItemCreate,
  toggleActionItemCheck,
  bulkActionItemsAction,
  exportActionItemsCsv,
  exportActionItemsMd,
  notifyAllPendingActionItems,
  rerenderActionItemsList,
  // Agenda Builder
  renderAgendaBuilder,
  abSetStep,
  abSaveNote,
  abDeleteNote,
  abDragStart,
  abDragOver,
  abDrop,
  abToggleSuggestion,
  abRemoveSelected,
  abAddCustomItem,
  abClearSuggestions,
  abSuggestAgenda,
  abGoToDraft,
  abBuildMessage,
  abUpdateWaPreview,
  abRefineMessage,
  abSaveDraft,
  abCopyMessage,
  abShareWhatsApp,
  abFinalizeAndOpenMeeting,
  // Agenda Builder: Member SMS Blast
  abDraftMemberSms,
  abUpdateSmsCharCount,
  abRefineSmsMessage,
  abCopySmsMessage,
  abSendBulkMemberSms,
  abToggleVoice,
  // Agenda Builder: Additional Features
  abSaveAsTemplate,
  abLoadTemplate,
  abDeleteTemplate,
  abToggleChecklist,
  abResetChecklist,
  abPrintAgenda,
  abCopyHistoryMessage,
  // New additional features
  abToggleRecurring,
  abReuseAsDraft,
  abPrintFromDraft,
  abSetOutcome,
  abSaveOutcomes,
  abAiAnalyseOutcomes,
  aiGrammarCheck,
  onPermReadChange,
  canWrite,
  canDelete,
  // Archive pagination
  loadMoreMeetings,
  // Minutes management
  reGenerateMinutes,
  // New month draft banner
  showNewMonthDraftModal,
  saveNewMonthDraft,
  dismissNewMonthDraft,
  // Cash Collection Tracker v2
  openTransferModal,
  submitCashHandover,
  openSpendModal,
  submitCashExpense,
  openCashDetailsModal,
  _rebuildTransferLots,
  _updateTransferAmount,
  _promptReassign,
};

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('popstate', e => {
  const page = e.state?.page || window.location.hash.replace('#', '') || 'dashboard';
  if (!page || page === S.page) return;

  // Meeting room: re-open the specific meeting if an ID is stored in history state
  if (page === 'meeting') {
    const meetingId = e.state?.meetingId;
    if (meetingId) {
      openMeeting(meetingId);
    } else {
      // Was a new-meeting session — just go back to the archive instead
      navigate('archive', { replace: true });
    }
    return;
  }

  const mapping = PAGE_TO_GROUP[page] || { group: 'home', subTab: null };
  S.page   = page;
  S.group  = mapping.group;
  S.subTab = mapping.subTab;
  document.querySelectorAll('.ka-nav-item').forEach(b => b.classList.toggle('active', b.dataset.group === S.group));
  updateFab();
  renderPage(page);
});
