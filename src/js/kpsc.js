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
  acting_chairman:    ['dashboard', 'projects', 'partners', 'partner-progress', 'finance', 'reminders', 'members', 'archive', 'reports', 'settings'],
  general_secretary:  ['dashboard', 'projects', 'partners', 'partner-progress', 'reminders', 'members', 'archive', 'reports', 'settings'],
  financial_secretary:['dashboard', 'projects', 'partners', 'partner-progress', 'finance', 'reminders', 'archive', 'reports'],
  treasurer:          ['dashboard', 'projects', 'partners', 'partner-progress', 'finance', 'reminders', 'archive', 'reports'],
  committee_viewer:   ['dashboard', 'projects', 'partners', 'partner-progress', 'reports', 'archive'],
  // IT admin: full read access + account/settings management; no operational write actions.
  it_admin:           ['dashboard', 'archive', 'projects', 'partners', 'partner-progress', 'finance', 'reminders', 'members', 'reports', 'settings'],
};
const PIN_REGEX = /^\d{4,6}$/;

// ── NAV GROUP / SUB-TAB MAPPING ────────────────────────────────────
// Maps old page names to (group, subTab) pairs for backwards compat.
const PAGE_TO_GROUP = {
  dashboard: { group: 'home',     subTab: null         },
  archive:   { group: 'meetings', subTab: 'archive'    },
  reports:   { group: 'meetings', subTab: 'reports'    },
  'partner-progress': { group: 'money', subTab: 'partner-progress' },
  projects:  { group: 'meetings', subTab: 'projects'   },
  finance:   { group: 'money',    subTab: 'finance'    },
  partners:  { group: 'money',    subTab: 'partners'   },
  reminders: { group: 'money',    subTab: 'reminders'  },
  members:   { group: 'more',     subTab: 'members'    },
  settings:  { group: 'more',     subTab: 'settings'   },
  // Group-level pseudo-pages (rendered inline by their own renderer)
  more:         { group: 'more',     subTab: null },
  // Sub-pages (reachable from within a group; nav highlight stays on group)
  meeting:      { group: 'meetings', subTab: null },
  partnerDetail:{ group: 'money',    subTab: null },
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
  dashboard: null,
  projects: [],
  projectsFilter: 'all',
  followups: [],
  archiveSearch: '',
  archiveQuickFilter: 'all',
  partnersYear: new Date().getUTCFullYear(),
  partnersFilter: 'active',
  financeYear: new Date().getUTCFullYear(),
  financeMonth: new Date().getUTCMonth() + 1,
  reportsYear: new Date().getUTCFullYear(),
  reportsMonth: 0,
  reportsFilter: 'all',
  reportsSearch: '',
  _authRecoveryInProgress: false,
  _meetingTab: 'record',
  _reviewEditMode: false, // true = show inline review editor; false = show reviewed summary
  _isNewMeeting: false,   // true when the room is hosting a fresh, never-saved draft
  kpscMeetingCadence: 'none',
  rolePermissions: null, // loaded from DB; null means use KPSC_PERMISSIONS defaults
};

// ── AUDIO RECORDER + REALTIME TRANSCRIPTION ───────────────────────
const REC_CHUNK_MS = 5000;
const REC_RETRY_BASE_MS = 1200;
const REC_MAX_RETRIES = 5;
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
  const rows = [...Rec.transcriptEntries, ...partials];
  list.innerHTML = rows.length ? rows.map(entry => {
    const hasSpeaker = entry.speaker !== null && entry.speaker !== undefined;
    const displayName = hasSpeaker ? speakerDisplayName(entry.speaker) : '';
    const speakerHtml = hasSpeaker
      ? `<span class="lt-speaker lt-spk-${entry.speaker % 6}">${esc(displayName)}</span>`
      : '';
    return `
    <div class="lt-entry${entry.partial ? ' lt-entry-partial' : ''}${hasSpeaker ? ' lt-entry-diarized' : ''}">
      <span class="lt-time">${esc(entry.timestamp)}</span>
      ${speakerHtml}
      <span class="lt-text">${esc(entry.text)}</span>
    </div>`;
  }).join('') : '<div class="lt-empty">Live transcript will appear here as people speak.</div>';
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
  Diarizer.status = 'offline';
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
  recFlushUploads(false);
}

async function recFlushUploads(useKeepalive) {
  if (Rec.uploadBusy) return;
  Rec.uploadBusy = true;
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
        setTimeout(() => recFlushUploads(false), 2500);
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
function diarizerBufferPcm(samples) {
  Diarizer.pcmChunks.push({ offset: Diarizer.pcmSampleOffset, data: samples.slice() });
  Diarizer.pcmSampleOffset += samples.length;
  // Remove chunks older than 60 seconds.
  const minOffset = Diarizer.pcmSampleOffset - (PCM_BUFFER_DURATION_SEC * (Diarizer.pcmSampleRate || DEFAULT_PCM_SAMPLE_RATE));
  while (Diarizer.pcmChunks.length &&
         Diarizer.pcmChunks[0].offset + Diarizer.pcmChunks[0].data.length <= minOffset) {
    Diarizer.pcmChunks.shift();
  }
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
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      const level = line.match(/^(#+)/)[1].length;
      out.push(`<h${level}>${esc(line.replace(/^#+\s*/, ''))}</h${level}>`);
    } else if (/^[-*]\s/.test(line)) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${esc(line.replace(/^[-*]\s*/, ''))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push(`<p>${esc(line)}</p>`);
    } else if (line === '') {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push('');
    } else {
      if (inUl) { out.push('</ul>'); inUl = false; }
      out.push(`<p>${esc(line)}</p>`);
    }
  }
  if (inUl) out.push('</ul>');
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
  if ((Rec.status === 'recording' || Rec.status === 'paused' || Rec.status === 'stopped') && document.getElementById('km-transcript')) {
    autoSaveNow();
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
    // Only chairman and gen_sec can start a new meeting from home
    if (role === 'acting_chairman' || role === 'general_secretary') {
      label = '+ New Meeting';
    }
  } else if (group === 'meetings') {
    if (subTab === 'archive' || subTab === null) {
      if (role === 'acting_chairman' || role === 'general_secretary') label = '+ New Meeting';
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
      if (fab) sendBulkReminders(fab);
    }
  }
}

// ── SUB-TAB STRIPS ─────────────────────────────────────────────────

function meetingsSubTabStrip() {
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const cur = S.subTab || 'archive';
  const tabs = [
    { key: 'archive',  label: 'Archive' },
    { key: 'reports',  label: 'Insights' },
    { key: 'projects', label: 'Projects' },
  ];
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
    } else if (page === 'finance') {
      await renderFinance(main);
      prependSubTabs(main, moneySubTabStrip());
    } else if (page === 'partners') {
      await renderPartners(main);
      prependSubTabs(main, moneySubTabStrip());
    } else if (page === 'reminders') {
      await renderReminders(main);
      prependSubTabs(main, moneySubTabStrip());
    } else if (page === 'meeting') {
      await renderMeetingRoom(main);
    } else if (page === 'members') {
      await renderMembers(main);
      prependSubTabs(main, moreSubTabStrip());
    } else if (page === 'settings') {
      await renderSettings(main);
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
        <button class="ka-more-item ka-more-item-danger" onclick="Kpsc.logout()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>Sign Out</span>
        </button>
      </div>
    </div>`;
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

  // Unpaid partners this month
  const activePartners = S.partners.filter(p => p.status === 'active');
  const unpaidThisMonth = activePartners.filter(p => !partnerMonthlyPaid(p.id, month, year));

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

function dashboardCardsForRole(role, ctx) {
  const r = String(role || 'committee_viewer').toLowerCase();

  if (r === 'acting_chairman') {
    return `
      ${dashCardPreBrief(ctx)}
      ${dashCardFollowups(ctx)}
      ${dashCardOpenMeeting(ctx)}
      <div class="k-section-hdr" style="margin-top:20px"><h2>At a Glance</h2></div>
      <div class="k-meeting-list">
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
      <div class="k-section-hdr" style="margin-top:4px"><h2>Finance At a Glance</h2></div>
      <div class="k-meeting-list">
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

  // committee_viewer (default)
  return `
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

  // Load all data needed for any role in parallel
  const loadPromises = [
    apiGet('ai-secretary-meetings'),
    apiGet('settings'),
    apiGet(`kpsc-dashboard?year=${year}&month=${month}`),
    apiGet('kpsc-projects'),
    apiGet(`kpsc-finance?year=${year}&month=${month}`),
    apiGet('kpsc-partners'),
    apiGet(`kpsc-partner-payments?year=${year}`),
  ];
  // B5: only load followups for chairman/secretary
  if (isChairOrSecretary) loadPromises.push(apiGet('kpsc-followups?status=pending'));

  const [meetingsRes, settingsRes, dashboardRes, projectsRes, financeRes, partnersRes, paymentsRes, followupsRes] =
    await Promise.all(loadPromises);

  if (meetingsRes?.error) throw new Error(meetingsRes.error);
  S.meetings        = Array.isArray(meetingsRes)            ? meetingsRes            : [];
  S.members         = Array.isArray(settingsRes?.kpsc_members) ? settingsRes.kpsc_members : [];
  S.dashboard       = dashboardRes?.totals || null;
  S.projects        = Array.isArray(projectsRes)            ? projectsRes            : [];
  S.financeEntries  = Array.isArray(financeRes)             ? financeRes             : [];
  S.partners        = Array.isArray(partnersRes)            ? partnersRes            : [];
  S.partnerPayments = Array.isArray(paymentsRes)            ? paymentsRes            : [];
  S.followups       = Array.isArray(followupsRes)           ? followupsRes           : [];

  // Load distributed-meeting-ids from settings (stored as JSON string)
  const rawDistributed = Array.isArray(settingsRes?.kpsc_distributed_meeting_ids)
    ? settingsRes.kpsc_distributed_meeting_ids
    : (Array.isArray(S._distributedMeetingIds) ? S._distributedMeetingIds : []);
  S._distributedMeetingIds = rawDistributed;

  const ctx  = buildDashboardContext();

  main.innerHTML = `
    <div class="k-page">
      ${dashboardCardsForRole(role, ctx)}
    </div>`;
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
  document.getElementById('kpsc-back-btn').style.display = '';
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
  document.getElementById('kpsc-back-btn').style.display = '';
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
          <label class="k-label">Scheduled For <span class="k-label-hint">(optional — enables pre-meeting brief)</span></label>
          <input class="k-input" id="km-scheduled-for" type="datetime-local" value="${esc(m?.scheduledFor ? m.scheduledFor.slice(0, 16) : '')}" ${!isEditable ? 'readonly' : ''} />
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
            <p class="k-hint">Upload a pre-recorded audio file. The AI will transcribe it and add the text to the transcript. Supported formats: mp3, mp4, m4a, wav, webm, ogg (max 25 MB).</p>
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
        ${(status === 'draft' || status === 'recording') && (m ? canDeleteMeeting(m) : S._isNewMeeting) ? `<button class="kbtn kbtn-ghost kbtn-sm" style="color:var(--danger,#dc2626)" onclick="Kpsc.discardMeetingFromRoom()">🗑 Discard</button>` : ''}
        ${(status === 'recording' || (status === 'draft' && m)) ? `<button id="km-end-meeting-btn" class="kbtn kbtn-amber" onclick="Kpsc.endMeeting(this)">🔒 End Meeting</button>` : ''}
        ${status === 'ended' ? `<button class="kbtn kbtn-primary" onclick="Kpsc.processMeeting(this)">✨ Generate Minutes</button>` : ''}
        ${isProcessed ? `<div class="k-processed-note">✅ Minutes have been generated and finalised.</div>` : ''}
      </div>

      ${isProcessed && m ? renderMinutesPanel(m) : ''}
    </div>`;

  setMeetingTab(S._meetingTab || 'record');
  if (canRecord) recRenderUI();
  recRenderTranscript();
  if (isEditable) bindAutoSave();
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
      return { group: g.key, label: g.label, present: !!(el?.checked), name: mem.name };
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
        <p class="k-review-hint" style="margin-top:4px">AI will integrate these notes into the minutes when you click <strong>AI Proofread</strong> below. Notes are not saved — used once and cleared.</p>
      </div>
      <div style="margin-bottom:14px">
        <button class="kbtn kbtn-ai" onclick="Kpsc.aiProofreadMinutes(this)">🤖 AI Proofread &amp; Apply Notes</button>
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

function renderMinutesPanel(m) {
  if (!m?.minutesMarkdown) return '';
  const resolutions = m.resolutions || [];
  const actionItems = m.actionItems || [];
  const policyFlags = m.policyFlags || [];
  const reviewed = !!m.reviewedAt;
  const reviewGuard = reviewed ? '' : 'disabled title="Approve and save the review before this action is available."';
  const publicUrl = m.publicShareToken ? `${window.location.origin}/kpsc/minutes/?token=${encodeURIComponent(m.publicShareToken)}` : '';

  return `
    <section class="k-section k-minutes-section">
      <h3 class="k-sec-title">Meeting Minutes</h3>
      ${m.summaryShort ? `<div class="k-summary">${esc(m.summaryShort)}</div>` : ''}
      ${m.summaryLong ? `<details class="k-summary-detail"><summary>Detailed summary</summary><pre>${esc(m.summaryLong)}</pre></details>` : ''}

      ${renderReviewPanel(m)}

      <div class="k-room-actions" style="margin-bottom:12px;margin-top:16px">
        <button class="kbtn kbtn-sm" onclick="Kpsc.printMinutes('${m.id}')" aria-disabled="${reviewed ? 'false' : 'true'}" ${reviewGuard}>🖨 Print / Save PDF</button>
        <button class="kbtn kbtn-sm" onclick="Kpsc.shareMinutesWhatsApp('${m.id}')" aria-disabled="${reviewed ? 'false' : 'true'}" ${reviewGuard}>📲 Share via WhatsApp</button>
        ${m.publicShareToken ? `<button class="kbtn kbtn-sm" onclick="Kpsc.revokeMinutesPublicLink('${m.id}')">🔒 Revoke Public Link</button>` : ''}
        <button class="kbtn kbtn-sm" id="btn-plain-english-${m.id}" onclick="Kpsc.togglePlainEnglish('${m.id}')" data-plain-english="false">📖 Read in plain English</button>
      </div>
      ${reviewed ? '' : '<p class="k-hint" style="margin-top:-6px;margin-bottom:12px">Approve and save the review first before printing or sharing minutes.</p>'}
      ${m.publicShareToken ? `<div class="k-hint" style="margin-top:-4px;margin-bottom:12px">Public minutes link is active: <a href="${esc(publicUrl)}" target="_blank" rel="noopener noreferrer">${esc(publicUrl)}</a></div>` : ''}

      <h4 class="k-sub-title">Minutes Preview</h4>
      <div class="k-minutes-body" id="minutes-body-${m.id}">${minutesHtml(m.minutesMarkdown)}</div>
      <div class="k-plain-english-indicator" id="pe-indicator-${m.id}" style="display:none;font-size:0.9em;color:#666;margin-top:8px;padding:8px;background:#f5f5f5;border-radius:4px;">📖 Showing plain English version</div>

      ${resolutions.length ? `
        <h4 class="k-sub-title">Decision & Resolution Register (${resolutions.length})</h4>
        <div class="k-res-list">${resolutions.map(r => {
          const status = resolutionStatus(r);
          return `
          <div class="k-res-item">
            <span class="kbadge ${status.cls}">${status.label}</span>
            ${r.resolutionType ? `<span class="kbadge badge-gray">${esc(String(r.resolutionType).replace(/_/g, ' '))}</span>` : ''}
            ${r.category ? `<span class="kbadge badge-type">${esc(r.category)}</span>` : ''}
            ${r.amount ? `<span class="kbadge badge-green">${esc(formatResolutionAmount(r.amount))}</span>` : ''}
            <div>${esc(r.text)}</div>
            ${r.voteSummary ? `<small>${esc(r.voteSummary)}</small>` : ''}
          </div>`;
        }).join('')}
        </div>` : ''}

      ${actionItems.length ? `
        <h4 class="k-sub-title">Action Items (${actionItems.length})</h4>
        <div class="k-action-list">${actionItems.map(a => `
          <div class="k-action-item">
            <div class="k-action-task">${esc(a.task)}</div>
            <div class="k-action-meta">
              ${a.assignee ? `<span>👤 ${esc(a.assignee)}</span>` : '<span>👤 Unassigned</span>'}
              ${a.dueDate  ? `<span>📅 ${esc(a.dueDate)}</span>` : '<span>📅 No deadline stated</span>'}
              <span class="kbadge badge-gray">${a.status || 'pending'}</span>
            </div>
          </div>`).join('')}
        </div>` : ''}

      ${policyFlags.length ? `
        <h4 class="k-sub-title">Policy Flags</h4>
        <div class="k-flags-list">${policyFlags.map(f => `
          <div class="k-flag k-flag-${f.severity || 'info'}">
            <strong>${esc(f.type)}</strong> — ${esc(f.message)}
          </div>`).join('')}
        </div>` : ''}
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
    const reviewedAt = new Date().toISOString();
    const res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
      summaryShort: document.getElementById('kr-summary-short')?.value || '',
      summaryLong: document.getElementById('kr-summary-long')?.value || '',
      minutesMarkdown: document.getElementById('kr-minutes')?.value || '',
      resolutions: S.activeMeeting.resolutions || [],
      actionItems: S.activeMeeting.actionItems || [],
      policyFlags: S.activeMeeting.policyFlags || [],
      reviewedAt,
      reviewedBy: S.user?.name || '',
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    S.activeMeeting = { ...res };
    S._reviewEditMode = false;
    persistMeetingUiState();
    // Re-render only the review panel in-place.
    const panel = document.getElementById('kr-panel');
    if (panel) {
      panel.outerHTML = renderReviewPanel(S.activeMeeting);
    } else {
      renderPage('meeting');
    }
    showToast('Review approved and saved', 'success');

    // Show action item WhatsApp notification links if any action items exist.
    const actions = S.activeMeeting.actionItems || [];
    if (actions.length) renderActionNotifications(actions, S.activeMeeting);
  } catch {
    showToast('Review save failed. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
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

  try {
    let res;
    if (S.activeMeeting) {
      res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
        title, meetingDate: date, meetingType: type, status, transcriptText: trans, participants, scheduledFor,
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
        createdBy: S.user?.name || '', scheduledFor,
      });
    }
    if (res?.error) {
      setAutoSaveStatus(`Save failed: ${res.error}`, 'error');
    } else {
      const wasNew = !Draft.meetingId;
      S.activeMeeting = res;
      Draft.meetingId = res.id;
      Draft.pendingId = null; // ID is now committed; subsequent saves will use PUT
      S._isNewMeeting = false;
      persistMeetingUiState();
      setAutoSaveStatus(`Saved · ${fmtClock(new Date())}`, 'ok');
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
  S.meetings = S.meetings.filter(x => x.id !== id);
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

  // Preserve draft→recording transitions from the Start Meeting control, including new meetings.
  const status = rawStatus;
  const participants = readAttendance();

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    let res;
    if (S.activeMeeting) {
      res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
        title, meetingDate: date, meetingType: type, status, transcriptText: trans, participants,
      });
    } else {
      res = await apiPost('ai-secretary-meetings', {
        title, meetingDate: date, meetingType: type, status, transcriptText: trans, participants,
        createdBy: S.user?.name || '',
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
    const res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
      status: 'ended',
      endedAt: new Date().toISOString(),
      transcriptText: trans,
      participants,
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    S.activeMeeting = res;
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
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating minutes…';

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
  S.members.push({ group: 'men', name: '', position: '' });
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
    if (groupEl) S.members[idx].group    = groupEl.value;
    if (nameEl)  S.members[idx].name     = nameEl.value.trim();
    if (posEl)   S.members[idx].position = posEl.value.trim();
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
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title">🎙 Voice Enrollment — ${esc(member.name)}</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closeVoiceFpModal()">✕</button>
      </div>
      <div class="k-modal-body">
        <p class="k-enroll-instruction">Voice enrollment stores a mathematical representation of <strong>${esc(member.name)}</strong>'s voice (192 numbers) that lets KPSC identify them in meetings. The raw recording is not kept. You can delete this data at any time. By proceeding you confirm <strong>${esc(member.name)}</strong> has consented to this enrollment.</p>
        ${alreadyEnrolled ? `<div class="k-enroll-warn">⚠ Already enrolled (${esc(new Date(member.voice_enrolled_at).toLocaleDateString())}${member.voice_sample_count ? ` · ${member.voice_sample_count} sample(s)` : ''}). Recording again will replace the existing data.</div>` : ''}
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
        <button class="kbtn kbtn-record" id="k-vfp-record-btn" onclick="Kpsc.startVoiceFpRecording()">🔴 Record 5 seconds</button>
        <button class="kbtn kbtn-primary" id="k-vfp-submit-btn" onclick="Kpsc.submitVoiceFpEnrollment()" disabled>Submit</button>
        ${alreadyEnrolled ? `<button class="kbtn kbtn-danger-outline" onclick="Kpsc.removeVoiceFpEnrollment(${idx})">🗑 Remove voice data</button>` : ''}
        <button class="kbtn kbtn-ghost" onclick="Kpsc.closeVoiceFpModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
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
    S.members[idx].voice_enrolled_at  = enrollData.enrolledAt;
    S.members[idx].voice_sample_count = enrollData.sampleCount;
    S.members[idx].voice_member_id    = vid;
    await apiPost('settings', { kpsc_members: S.members });

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

function catLabel(c) {
  return String(c || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

function partnerPaymentsByPartner(partnerId, year = currentYear()) {
  return S.partnerPayments.filter(p => p.partnerId === partnerId && Number(p.year) === Number(year) && p.paid);
}

function partnerMonthlyPaid(partnerId, month, year = currentYear()) {
  return S.partnerPayments.some(p =>
    p.partnerId === partnerId && Number(p.year) === Number(year) && Number(p.month) === Number(month) && p.paid && p.paymentType === 'monthly_pledge'
  );
}

async function renderPartners(main) {
  await loadPartnerData(S.partnersYear);
  const canManage = canManagePartners();
  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>Partnership Management</h2>
        ${canManage ? `<button class="kbtn kbtn-primary" onclick="Kpsc.addPartner()">+ Add Partner</button>` : ''}
      </div>
      <p class="k-page-hint">Track God's Kingdom Partners and Covenant Partners, monthly pledges, and payment progress.</p>
      <div class="k-partners-controls">
        <div class="k-tabs">
          <button class="k-tab ${S.partnersFilter === 'active' ? 'active' : ''}" onclick="Kpsc.setPartnersFilter('active')">Active</button>
          <button class="k-tab ${S.partnersFilter === 'all' ? 'active' : ''}" onclick="Kpsc.setPartnersFilter('all')">All</button>
          <button class="k-tab ${S.partnersFilter === 'inactive' ? 'active' : ''}" onclick="Kpsc.setPartnersFilter('inactive')">Inactive</button>
        </div>
        <select class="k-input k-input-sm k-year-select" onchange="Kpsc.setPartnersYear(this.value)">
          ${[currentYear(), currentYear()-1, currentYear()-2].map(y => `<option value="${y}" ${S.partnersYear === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>
      <div id="kpsc-partners-list">${renderPartnersList(canManage)}</div>
    </div>`;
}

function renderPartnersList(canManage) {
  const year = S.partnersYear;
  let partners = S.partners;
  if (S.partnersFilter === 'active') partners = partners.filter(p => p.status === 'active');
  else if (S.partnersFilter === 'inactive') partners = partners.filter(p => p.status === 'inactive');
  if (!partners.length) return `<div class="k-empty">No ${S.partnersFilter === 'all' ? '' : S.partnersFilter + ' '}partners found.</div>`;
  return `<div class="k-meeting-list">${partners.map(partner => {
    const paidMonths = partnerPaymentsByPartner(partner.id, year).filter(p => p.paymentType === 'monthly_pledge').length;
    const currentPaid = partnerMonthlyPaid(partner.id, currentMonth(), year);
    const pct = Math.round((paidMonths / 12) * 100);
    return `
      <div class="k-meeting-card">
        <div class="k-mc-top">
          <div style="flex:1">
            <div class="k-mc-title">${esc(partner.fullName)}</div>
            <div class="k-mc-meta" style="margin-top:4px">
              <span class="kbadge badge-type">${esc(partnerTypeLabel(partner.partnershipType))}</span>
              <span class="kbadge ${partner.status === 'active' ? 'badge-green' : 'badge-gray'}">${partner.status === 'active' ? 'Active' : 'Inactive'}</span>
              <span class="kbadge ${currentPaid ? 'badge-green' : 'badge-amber'}">${currentPaid ? '✓ Paid this month' : 'Unpaid this month'}</span>
            </div>
            <div class="k-progress-row">
              <div class="k-progress-bar-bg"><div class="k-progress-bar" style="width:${pct}%"></div></div>
              <span class="k-progress-label">${paidMonths}/12 months paid (${year})</span>
            </div>
          </div>
        </div>
        <div class="k-room-actions" style="flex-wrap:wrap">
          <button class="kbtn kbtn-sm" onclick="Kpsc.openPartnerDetail('${partner.id}')">📅 View History</button>
          ${canManage ? `<button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.editPartner('${partner.id}')">Edit</button>` : ''}
          ${canManage ? `<button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.deletePartner('${partner.id}')">Delete</button>` : ''}
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

function showPartnerModal(partner = null) {
  document.getElementById('kpsc-partner-modal')?.remove();
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
        <label class="k-label">Phone</label>
        <input id="kp-phone" class="k-input" value="${esc(partner?.phone || '')}" />
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
  const payload = {
    fullName: document.getElementById('kp-full-name')?.value.trim() || '',
    phone: document.getElementById('kp-phone')?.value.trim() || '',
    partnershipType: document.getElementById('kp-type')?.value || 'gods_kingdom_partner',
    monthlyPledge: Number(document.getElementById('kp-pledge')?.value || 0),
    status: document.getElementById('kp-status')?.value || 'active',
    startDate: document.getElementById('kp-start-date')?.value || '',
    reminderPreference: document.getElementById('kp-reminder-pref')?.value || 'sms',
    notes: document.getElementById('kp-notes')?.value.trim() || '',
    createdBy: S.user?.name || '',
  };
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

async function togglePartnerMonth(partnerId, month, year, paid) {
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
    });
    if (res?.error) { showToast(res.error, 'error'); return; }
  }
  await loadPartnerData(year);
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
  document.querySelectorAll('.k-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.k-tab').forEach(b => {
    if (b.textContent.toLowerCase().startsWith(filter === 'all' ? 'all' : filter === 'active' ? 'active' : 'inactive')) b.classList.add('active');
  });
}

async function setPartnersYear(year) {
  S.partnersYear = Number(year) || currentYear();
  await loadPartnerData(S.partnersYear);
  const list = document.getElementById('kpsc-partners-list');
  if (list) list.innerHTML = renderPartnersList(canManagePartners());
}

async function deletePartner(id) {
  if (!confirm('Delete this partner and all their payment records?')) return;
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
    const isPaid = partnerMonthlyPaid(partner.id, m, year);
    const isFuture = year > nowYear || (year === nowYear && m > nowMonth);
    const cls = isFuture ? 'k-pgrid-cell k-pgrid-future' : isPaid ? 'k-pgrid-cell k-pgrid-paid' : 'k-pgrid-cell k-pgrid-unpaid';
    const icon = isFuture ? '·' : isPaid ? '✓' : '✗';
    const clickable = canManage && !isFuture;
    return `<div class="${cls}${clickable ? ' k-pgrid-clickable' : ''}" title="${monthName(m)}" ${clickable ? `onclick="Kpsc.togglePartnerMonth('${partner.id}', ${m}, ${year}, ${!isPaid})"` : ''}>
      <span class="k-pgrid-month">${monthName(m).slice(0,3)}</span>
      <span class="k-pgrid-icon">${icon}</span>
    </div>`;
  }).join('');

  const paidCount = months.filter(m => partnerMonthlyPaid(partner.id, m, year)).length;
  const yearOptions = [nowYear, nowYear-1, nowYear-2].map(y => `<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('');

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
        ${canManageFinance() ? `<div class="k-about-row"><span class="k-about-label">Monthly Pledge</span><span>₦${Number(partner.monthlyPledge||0).toLocaleString('en-NG')}</span></div>` : ''}
      </div>
      <div class="k-section">
        <h3 class="k-sec-title">${year} Payment Calendar</h3>
        ${canManage ? `<p class="k-hint" style="margin-bottom:12px">Tap a month to toggle paid/unpaid. Future months are read-only.</p>` : ''}
        <div class="k-payment-grid">${gridCells}</div>
      </div>
      ${partner.notes ? `<div class="k-section"><h3 class="k-sec-title">Notes (private)</h3><p style="font-size:14px;color:var(--text2);line-height:1.65">${esc(partner.notes)}</p></div>` : ''}
      <div style="margin-top:12px">
        <button class="kbtn" onclick="Kpsc.navigate('partners')">← Back to Partners</button>
      </div>
    </div>`;
}

async function setPartnerDetailYear(year) {
  S._partnerDetailYear = Number(year) || currentYear();
  await loadPartnerData(S._partnerDetailYear);
  renderPartnerDetail(document.getElementById('kpsc-main'));
}

async function renderFinance(main) {
  const year = S.financeYear;
  const month = S.financeMonth;
  const [financeRes, partnersRes] = await Promise.all([
    apiGet(`kpsc-finance?year=${year}${month ? `&month=${month}` : ''}`),
    apiGet('kpsc-partners'),
  ]);
  if (financeRes?.error) throw new Error(financeRes.error);
  if (partnersRes?.error) throw new Error(partnersRes.error);
  S.financeEntries = Array.isArray(financeRes) ? financeRes : [];
  S.partners = Array.isArray(partnersRes) ? partnersRes : [];
  const canManage = canManageFinance();
  const canDelete = canDeleteFinanceEntries();
  const incomeTotal = S.financeEntries.filter(e => e.entryType === 'income').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const expenseTotal = S.financeEntries.filter(e => e.entryType === 'expense').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const net = incomeTotal - expenseTotal;
  const nowYear = currentYear();
  const yearOpts = [nowYear, nowYear-1, nowYear-2].map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('');
  const monthOpts = [0,1,2,3,4,5,6,7,8,9,10,11,12].map(m=>
    `<option value="${m}" ${month===m?'selected':''}>${m===0?'All Months':monthName(m)}</option>`
  ).join('');
  main.innerHTML = `
    <div class="k-page">
      <div class="k-dash-stats">
        <div class="k-stat"><div class="k-stat-val">₦${incomeTotal.toLocaleString('en-NG')}</div><div class="k-stat-lbl">Income</div></div>
        <div class="k-stat"><div class="k-stat-val">₦${expenseTotal.toLocaleString('en-NG')}</div><div class="k-stat-lbl">Expense</div></div>
        <div class="k-stat ${net >= 0 ? '' : 'k-stat-highlight'}"><div class="k-stat-val" style="color:${net>=0?'var(--green)':'var(--red)'}">₦${Math.abs(net).toLocaleString('en-NG')}</div><div class="k-stat-lbl">${net >= 0 ? 'Net Surplus' : 'Net Deficit'}</div></div>
      </div>
      <div class="k-section-hdr">
        <h2>Finance Entries</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="k-input k-input-sm" style="width:auto" onchange="Kpsc.setFinanceYear(this.value)">${yearOpts}</select>
          <select class="k-input k-input-sm" style="width:auto" onchange="Kpsc.setFinanceMonth(this.value)">${monthOpts}</select>
          ${canManage ? `<button class="kbtn kbtn-primary kbtn-sm" onclick="Kpsc.openFinanceModal()">+ New Entry</button>` : ''}
        </div>
      </div>
      <div class="k-meeting-list">
        ${S.financeEntries.length ? S.financeEntries.map(e => `
          <div class="k-meeting-card">
            <div class="k-mc-top">
              <div style="flex:1">
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
              ${canDelete ? `<button class="kbtn kbtn-sm kbtn-danger" style="flex-shrink:0;align-self:flex-start" onclick="Kpsc.deleteFinanceEntry('${e.id}')">🗑</button>` : ''}
            </div>
          </div>`).join('') : '<div class="k-empty">No entries for the selected period.</div>'}
      </div>
      ${canManage ? `
      <div class="k-section" style="margin-top:16px">
        <h3 class="k-sec-title">Bank Reconciliation</h3>
        <p class="k-hint">Upload your bank statement PDF for AI-assisted reconciliation, or paste the data manually as JSON.</p>
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
      </div>` : ''}
    </div>`;
}

async function openFinanceModal(entryToEdit = null) {
  document.getElementById('kpsc-finance-modal')?.remove();
  const settingsRes = await apiGet('settings');
  const incomeCategories = Array.isArray(settingsRes?.kpsc_income_categories) ? settingsRes.kpsc_income_categories : ['partnership_payment','one_time_donation','wealth_development_offering','other_income'];
  const expenseCategories = Array.isArray(settingsRes?.kpsc_expense_categories) ? settingsRes.kpsc_expense_categories : ['projects','welfare','rent','church_support','committee_operations'];

  const incomeOpts = incomeCategories.map(c=>`<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('');
  const expenseOpts = expenseCategories.map(c=>`<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'kpsc-finance-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr"><span class="k-modal-title">New Finance Entry</span><button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closeFinanceModal()">✕</button></div>
      <div class="k-modal-body">
        <div class="kf-scan-block">
          <input type="file" id="kf-receipt-file" accept="image/*" capture="environment" style="display:none" onchange="Kpsc.scanReceiptPhoto(this)" />
          <button class="kbtn kbtn-sm kbtn-ghost" onclick="document.getElementById('kf-receipt-file').click()">📷 Scan Receipt</button>
          <span id="kf-scan-status" class="k-hint" style="margin-left:8px"></span>
          <div id="kf-receipt-preview"></div>
        </div>
        <label class="k-label">Date</label>
        <input id="kf-date" type="date" class="k-input" value="${today()}" />
        <label class="k-label">Entry Type</label>
        <select id="kf-type" class="k-input" onchange="Kpsc.updateFinanceCategoryOptions()">
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <label class="k-label">Category</label>
        <select id="kf-category" class="k-input">
          ${incomeOpts}
        </select>
        <label class="k-label">Amount (₦)</label>
        <input id="kf-amount" type="number" min="0" class="k-input" placeholder="0" />
        <label class="k-label">Payment Method</label>
        <select id="kf-method" class="k-input">
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="pos">POS</option>
          <option value="cheque">Cheque</option>
          <option value="other">Other</option>
        </select>
        <label class="k-label">Reference</label>
        <input id="kf-ref" class="k-input" placeholder="e.g. receipt number, transaction ID" />
        <label class="k-label">Narration</label>
        <textarea id="kf-note" class="k-input k-textarea" style="min-height:70px" placeholder="Brief description of this transaction…"></textarea>
      </div>
      <div class="k-modal-footer"><button class="kbtn kbtn-primary" onclick="Kpsc.saveFinanceEntry(this)">Save Entry</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal._incomeOpts = incomeOpts;
  modal._expenseOpts = expenseOpts;
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
}

async function saveFinanceEntry(btn) {
  btn.disabled = true;
  const res = await apiPost('kpsc-finance', {
    date: document.getElementById('kf-date')?.value || '',
    entryType: document.getElementById('kf-type')?.value || '',
    category: document.getElementById('kf-category')?.value.trim() || '',
    amount: Number(document.getElementById('kf-amount')?.value || 0),
    paymentMethod: document.getElementById('kf-method')?.value.trim() || '',
    reference: document.getElementById('kf-ref')?.value.trim() || '',
    narration: document.getElementById('kf-note')?.value.trim() || '',
    recordedBy: S.user?.name || '',
  });
  if (res?.error) {
    showToast(res.error, 'error');
    btn.disabled = false;
    return;
  }
  closeFinanceModal();
  await renderFinance(document.getElementById('kpsc-main'));
  showToast('Finance entry saved', 'success');
}

async function setFinanceYear(year) {
  S.financeYear = Number(year) || currentYear();
  await renderFinance(document.getElementById('kpsc-main'));
}

async function setFinanceMonth(month) {
  S.financeMonth = Number(month) || 0;
  await renderFinance(document.getElementById('kpsc-main'));
}

async function deleteFinanceEntry(id) {
  if (!canDeleteFinanceEntries()) {
    showToast('Only the Acting Chairman or IT Administrator may delete finance entries.', 'error');
    return;
  }
  if (!confirm('Delete this finance entry? This is reserved for audited correction cases only.')) return;
  const res = await apiDelete(`kpsc-finance/${id}`);
  if (res?.error) { showToast(res.error, 'error'); return; }
  await renderFinance(document.getElementById('kpsc-main'));
  showToast('Entry deleted.', 'success');
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
  const defaultTemplate = String(settingsRes?.kpsc_reminder_template || '').trim()
    || 'Dear {{name}}, this is a reminder for your {{month}} partnership pledge.';
  S.reminders = Array.isArray(remindersRes) ? remindersRes : [];
  main.innerHTML = `
    <div class="k-page">
      <div class="k-section">
        <h3 class="k-sec-title">Partner Reminder Workflow — ${monthName(month)} ${year}</h3>
        <p class="k-hint">${unpaid.length} unpaid active partner(s) for ${monthName(month)} ${year}.</p>
        <label class="k-label">Reminder Message Template</label>
        <textarea id="krem-message" class="k-input k-textarea" placeholder="Reminder message" oninput="Kpsc.debouncedSaveReminderTemplate(this)">${esc(defaultTemplate)}</textarea>
        <p class="k-hint">Use <code>{{name}}</code> for partner name and <code>{{month}}</code> for month name.</p>
        <div class="k-room-actions" style="margin-top:10px">
          <button class="kbtn kbtn-primary" onclick="Kpsc.sendBulkReminders(this)">Send Bulk Reminders (${unpaid.length})</button>
        </div>
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

      <div class="k-section-hdr"><h2>Reminder History</h2></div>
      <div class="k-meeting-list">
        ${S.reminders.length ? S.reminders.map(r => `
          <div class="k-meeting-card" style="cursor:default">
            <div class="k-mc-top">
              <div class="k-mc-title">${esc(r.partnerName || 'Partner')}</div>
              <span class="kbadge badge-blue">${esc(r.channel || 'sms')}</span>
            </div>
            <div class="k-mc-meta"><span>${esc(fmtDateTime(r.createdAt))}</span><span class="kbadge badge-green">${esc(r.status || 'sent')}</span>${r.sentBy ? `<span>by ${esc(r.sentBy)}</span>` : ''}</div>
            <div class="k-page-hint" style="margin-top:6px;font-size:13px">${esc(r.message)}</div>
          </div>`).join('') : '<div class="k-empty">No reminders sent this month.</div>'}
      </div>
    </div>`;
}

// Per-partner personalized message overrides: Map<partnerId, resolvedMessageString>
const _personalizedMessages = new Map();

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
      .replace(/\{\{month\}\}/g, monthName(currentMonth()));
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

  const variantCards = variants.map((v, i) => {
    const resolved = v.replace(/\{\{name\}\}/g, partner.fullName).replace(/\{\{month\}\}/g, monthName(month));
    return `
      <div class="k-remind-variant-card">
        <div class="k-remind-variant-text">${esc(resolved)}</div>
        <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.useReminderVariant('${esc(partner.id)}', ${i})">Use this</button>
      </div>`;
  }).join('');

  const fallbackResolved = fallbackTemplate
    .replace(/\{\{name\}\}/g, partner.fullName)
    .replace(/\{\{month\}\}/g, monthName(month));

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
  modal._variants = variants.map(v => v.replace(/\{\{name\}\}/g, partner.fullName).replace(/\{\{month\}\}/g, monthName(month)));
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

async function sendBulkReminders(btn) {
  await loadPartnerData(currentYear());
  const month = currentMonth();
  const year = currentYear();
  const unpaidPartners = S.partners.filter(p => p.status === 'active' && !partnerMonthlyPaid(p.id, month, year));
  if (!unpaidPartners.length) {
    showToast('No unpaid active partners for this month.', 'info');
    return;
  }
  const template = document.getElementById('krem-message')?.value.trim() || '';
  if (!template) {
    showToast('Reminder message is required.', 'warn');
    return;
  }
  btn.disabled = true;
  const responses = await Promise.all(unpaidPartners.map(partner => {
    // Use personalized message if the secretary approved one, else fall back to template
    const message = _personalizedMessages.has(partner.id)
      ? _personalizedMessages.get(partner.id)
      : template.replace(/\{\{name\}\}/g, partner.fullName).replace(/\{\{month\}\}/g, monthName(month));
    return apiPost('kpsc-reminders', {
      partnerId: partner.id,
      year,
      month,
      channel: partner.reminderPreference || 'sms',
      sentBy: S.user?.name || '',
      message,
    });
  }));
  btn.disabled = false;
  const failed = responses.filter(r => r?.error);
  if (failed.length) {
    const failedNames = unpaidPartners
      .filter((_, i) => responses[i]?.error)
      .map(p => p.fullName)
      .join(', ');
    showToast(`${failed.length} reminder(s) failed: ${failedNames}`, 'warn');
  } else {
    showToast(`Reminders sent to ${responses.length} partner(s).`, 'success');
  }
  await renderReminders(document.getElementById('kpsc-main'));
}

let _reminderTemplateSaveTimer = null;
function debouncedSaveReminderTemplate(textarea) {
  clearTimeout(_reminderTemplateSaveTimer);
  _reminderTemplateSaveTimer = setTimeout(async () => {
    const template = textarea.value.trim();
    const res = await apiPost('settings', { kpsc_reminder_template: template });
    if (res?.error) {
      showToast('Could not save template: ' + res.error, 'error');
    } else {
      showToast('Template saved.', 'success');
    }
  }, 500);
}

function reportsCategoryOptions() {
  return [
    { key: 'all',          label: 'All items'           },
    { key: 'resolutions',  label: 'Resolutions'         },
    { key: 'financial',    label: 'Financial approvals' },
    { key: 'amendments',   label: 'Amendments'          },
    { key: 'rejections',   label: 'Rejections'          },
    { key: 'motions',      label: 'Motions / proposals' },
    { key: 'action_items', label: 'Action items'        },
  ];
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
  const text = String(item?.text || '');
  // Priority is intentional: financial > amendment > rejection > motion/proposal > generic resolution.
  if (type === 'financial_approval' || String(item?.category || '').toLowerCase() === 'financial' || item?.amount) return 'financial';
  if (type === 'amendment' || /\bamend(?:ment|ed)?\b/i.test(text)) return 'amendments';
  if (type === 'rejection' || item?.approved === false || /\breject(?:ed|ion)?\b/i.test(text)) return 'rejections';
  // Fix: use non-capturing group so \b anchors all three alternatives.
  if (type === 'motion' || /\b(?:motion|proposal|proposed)\b/i.test(text)) return 'motions';
  return 'resolutions';
}

function buildMeetingInsights(meetings) {
  const entries = [];
  for (const m of (meetings || [])) {
    const meetingDate = String(m.meetingDate || '').trim();
    const createdAt = String(m.createdAt || '').trim();
    for (const [idx, r] of (m.resolutions || []).entries()) {
      if (!r?.text) continue;
      entries.push({
        id: `${m.id}:${r.id || `res-${idx + 1}`}`,
        kind: 'resolution',
        category: classifyResolutionInsight(r),
        meetingId: m.id,
        meetingTitle: m.title || 'KPSC Meeting',
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
        meetingDate,
        createdAt,
        actionId: normalizeActionId(a, idx),
        text: String(a.task || '').trim(),
        assignee: String(a.assignee || 'Unassigned').trim() || 'Unassigned',
        dueDate: String(a.dueDate || '').trim(),
        status: String(a.status || 'pending').trim() || 'pending',
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
  return entries.filter(entry => {
    const stamp = entry.meetingDate || entry.createdAt;
    if (year && !String(stamp).startsWith(String(year))) return false;
    if (month && Number(String(stamp).slice(5, 7)) !== month) return false;
    if (category !== 'all' && entry.category !== category) return false;
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

function renderMeetingInsightCard(entry) {
  // Meeting IDs are crypto.randomUUID() values ([0-9a-f-] only) — safe for direct
  // use in onclick, consistent with meetingCard() and openMeeting() elsewhere.
  const safeMid = String(entry.meetingId || '');
  const viewLink = `<div class="k-insight-view-link" onclick="Kpsc.openMeeting('${safeMid}')">View full minutes →</div>`;

  if (entry.kind === 'action_item') {
    const canEdit = canEditInsightsActionStatus();
    const meetingIdSafe = encodeURIComponent(String(entry.meetingId || ''));
    const actionIdSafe = encodeURIComponent(String(entry.actionId || ''));
    const dueDateHtml = insightsDueDateLabel(entry.dueDate, entry.status);
    return `
      <div class="k-meeting-card" style="cursor:default">
        <div class="k-mc-top">
          <div style="flex:1">
            <div class="k-mc-title">${esc(entry.text)}</div>
            <div class="k-mc-meta">
              <span>${esc(fmtDate(entry.meetingDate) || entry.meetingDate || 'No date')}</span>
              <span>${esc(entry.meetingTitle)}</span>
            </div>
          </div>
          <div class="k-mc-badges"><span class="kbadge badge-type">Action item</span></div>
        </div>
        <div class="k-action-meta">
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
        </div>
        ${viewLink}
      </div>`;
  }

  const statusBadge = entry.approval === 'approved'
    ? '<span class="kbadge badge-green">✓ Approved</span>'
    : entry.approval === 'rejected'
      ? '<span class="kbadge badge-red">✗ Rejected</span>'
      : '<span class="kbadge badge-amber">Needs confirmation</span>';
  return `
    <div class="k-meeting-card" style="cursor:default">
      <div class="k-mc-top">
        <div style="flex:1">
          <div class="k-mc-title">${esc(entry.text)}</div>
          <div class="k-mc-meta">
            <span>${esc(fmtDate(entry.meetingDate) || entry.meetingDate || 'No date')}</span>
            <span>${esc(entry.meetingTitle)}</span>
          </div>
        </div>
        <div class="k-mc-badges">
          ${statusBadge}
          <span class="kbadge badge-type">${esc(String(entry.resolutionType || 'decision').replace(/_/g, ' '))}</span>
          ${entry.amount ? `<span class="kbadge badge-green">${esc(formatResolutionAmount(entry.amount))}</span>` : ''}
        </div>
      </div>
      ${entry.motionBy || entry.secondedBy || entry.voteSummary ? `
        <div class="k-action-meta">
          ${entry.motionBy ? `<span>🗣 Moved: ${esc(entry.motionBy)}</span>` : ''}
          ${entry.secondedBy ? `<span>Seconded: ${esc(entry.secondedBy)}</span>` : ''}
          ${entry.voteSummary ? `<span>${esc(entry.voteSummary)}</span>` : ''}
        </div>` : ''}
      ${viewLink}
    </div>`;
}

// Re-renders chips + count + list from cached S.meetings — no API call.
function rerenderInsightsList() {
  const allEntries = buildMeetingInsights(S.meetings);
  // Counts respect year + month + search but ignore the category chip (standard faceted behaviour).
  const baseFiltered = filterMeetingInsights(allEntries, 'all');
  const filtered = filterMeetingInsights(allEntries);
  const categories = reportsCategoryOptions();
  const counts = categories.reduce((acc, c) => ({
    ...acc,
    [c.key]: c.key === 'all' ? baseFiltered.length : baseFiltered.filter(item => item.category === c.key).length,
  }), {});

  const chipsEl = document.getElementById('k-insights-chips');
  if (chipsEl) {
    chipsEl.innerHTML = categories.map(c =>
      `<button class="k-filter ${S.reportsFilter === c.key ? 'active' : ''}" onclick="Kpsc.setReportsFilter('${c.key}')">${c.label} (${counts[c.key] || 0})</button>`
    ).join('');
  }

  const total = baseFiltered.length;
  const countEl = document.getElementById('k-insights-count');
  if (countEl) {
    countEl.textContent = filtered.length === total
      ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`
      : `${filtered.length} of ${total} item${total !== 1 ? 's' : ''}`;
  }

  const listEl = document.getElementById('k-insights-list');
  if (listEl) {
    listEl.innerHTML = filtered.length
      ? filtered.map(renderMeetingInsightCard).join('')
      : buildInsightsEmptyState(allEntries, S.meetings);
  }
}

async function renderReports(main) {
  const res = await apiGet('ai-secretary-meetings');
  S.meetings = res.meetings || res || [];
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
  const counts = categories.reduce((acc, c) => ({
    ...acc,
    [c.key]: c.key === 'all' ? baseFiltered.length : baseFiltered.filter(item => item.category === c.key).length,
  }), {});

  // Summary stats drawn from ALL entries (not just the current filtered view).
  const todayStr = today();
  const pendingActions  = allEntries.filter(e => e.kind === 'action_item' && e.status === 'pending').length;
  const overdueActions  = allEntries.filter(e => e.kind === 'action_item' && e.dueDate && e.dueDate < todayStr && e.status !== 'done' && e.status !== 'cancelled').length;
  const financialCount  = allEntries.filter(e => e.category === 'financial').length;
  const resolutionCount = allEntries.filter(e => e.kind === 'resolution').length;

  const statBar = allEntries.length ? `
    <div class="k-insight-stats">
      <div class="k-insight-stat">
        <span class="k-insight-stat-val">${resolutionCount}</span>
        <span class="k-insight-stat-lbl">Resolutions</span>
      </div>
      <div class="k-insight-stat">
        <span class="k-insight-stat-val">${financialCount}</span>
        <span class="k-insight-stat-lbl">Financial</span>
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
    </div>` : '';

  const total = baseFiltered.length;
  const countText = filtered.length === total
    ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`
    : `${filtered.length} of ${total} item${total !== 1 ? 's' : ''}`;

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>AI Meeting Insights</h2>
      </div>
      <p class="k-page-hint">AI automatically extracts resolutions, amendments, motions, financial approvals, rejections, and action items from each processed meeting — newest first.</p>
      ${statBar}
      <div class="k-insight-filters">
        <select class="k-input k-input-sm" onchange="Kpsc.setReportsYear(this.value)">${yearOpts}</select>
        <select class="k-input k-input-sm" onchange="Kpsc.setReportsMonth(this.value)">${monthOpts}</select>
        <input class="k-input k-input-sm" type="search" placeholder="Search text, proposer, assignee…" value="${esc(S.reportsSearch)}" oninput="Kpsc.setReportsSearch(this.value)" />
      </div>
      <div class="k-quick-filters" id="k-insights-chips">
        ${categories.map(c =>
          `<button class="k-filter ${S.reportsFilter === c.key ? 'active' : ''}" onclick="Kpsc.setReportsFilter('${c.key}')">${c.label} (${counts[c.key] || 0})</button>`
        ).join('')}
      </div>
      <div class="k-insight-count-row"><span id="k-insights-count">${countText}</span></div>
      <div class="k-meeting-list" id="k-insights-list">${filtered.length ? filtered.map(renderMeetingInsightCard).join('') : buildInsightsEmptyState(allEntries, S.meetings)}</div>
    </div>`;
}

async function renderPartnerProgress(main) {
  const year = S.reportsYear;
  await loadPartnerData(year);
  const month = currentMonth();
  const nowYear = currentYear();
  const yearOpts = [nowYear, nowYear-1, nowYear-2].map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}</option>`).join('');

  const activePartners = S.partners.filter(p => p.status === 'active');
  const allPaidThisMonth = activePartners.filter(p => partnerMonthlyPaid(p.id, month, year)).length;
  const allUnpaidThisMonth = activePartners.length - allPaidThisMonth;
  const expectedMonthlyIncome = activePartners.reduce((sum, p) => sum + Number(p.monthlyPledge || 0), 0);
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];

  const progressRows = activePartners.map(partner => {
    const monthsPaid = partnerPaymentsByPartner(partner.id, year).filter(p => p.paymentType === 'monthly_pledge').length;
    const pct = Math.round((monthsPaid / 12) * 100);
    const dotRow = months.map(m => {
      const isPaid = partnerMonthlyPaid(partner.id, m, year);
      const isFuture = year > nowYear || (year === nowYear && m > month);
      return `<span class="k-dot-cell ${isPaid ? 'k-dot-paid' : isFuture ? 'k-dot-future' : 'k-dot-unpaid'}" title="${monthName(m)}: ${isPaid ? 'Paid' : isFuture ? 'Future' : 'Unpaid'}"></span>`;
    }).join('');
    return `
      <div class="k-meeting-card" style="cursor:default">
        <div class="k-mc-top">
          <div style="flex:1">
            <div class="k-mc-title">${esc(partner.fullName)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
              <span class="kbadge badge-type">${esc(partnerTypeLabel(partner.partnershipType))}</span>
              <span class="kbadge ${partnerMonthlyPaid(partner.id, month, year) ? 'badge-green' : 'badge-amber'}">${partnerMonthlyPaid(partner.id, month, year) ? '✓ Current' : 'Unpaid'}</span>
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

  main.innerHTML = `
    <div class="k-page">
      <div class="k-section-hdr">
        <h2>Partner Progress Report</h2>
        <select class="k-input k-input-sm" style="width:auto" onchange="Kpsc.setReportsYear(this.value)">${yearOpts}</select>
      </div>
      <p class="k-page-hint">Progress view — pledge amounts are private and not shown here.</p>
      <div class="k-dash-stats">
        <div class="k-stat"><div class="k-stat-val">${activePartners.length}</div><div class="k-stat-lbl">Active Partners</div></div>
        <div class="k-stat"><div class="k-stat-val">${allPaidThisMonth}</div><div class="k-stat-lbl">Paid This Month</div></div>
        <div class="k-stat k-stat-highlight"><div class="k-stat-val">${allUnpaidThisMonth}</div><div class="k-stat-lbl">Unpaid This Month</div></div>
        <div class="k-stat"><div class="k-stat-val">₦${expectedMonthlyIncome.toLocaleString('en-NG')}</div><div class="k-stat-lbl">Expected Monthly Income</div></div>
      </div>
      <div class="k-dot-legend">
        <span><span class="k-dot-cell k-dot-paid"></span> Paid</span>
        <span><span class="k-dot-cell k-dot-unpaid"></span> Unpaid</span>
        <span><span class="k-dot-cell k-dot-future"></span> Future</span>
      </div>
      <div class="k-meeting-list">${progressRows || '<div class="k-empty">No active partners available.</div>'}</div>
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
  const res = await apiGet('ai-secretary-meetings');
  S.meetings = res.meetings || res || [];
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
    </div>`;
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
  // Hydrate role permissions from DB so canAccess() reflects any saved customisations
  const savedPerms = res?.kpsc_role_permissions;
  if (savedPerms && typeof savedPerms === 'object' && !Array.isArray(savedPerms)) {
    S.rolePermissions = savedPerms;
  }
  const deepseekKey = res?.ai_deepseek_key || '';
  const openaiKey   = res?.ai_openai_key   || '';
  const policyUrl   = res?.kpsc_policy_url  || '';
  const policyNotes = res?.kpsc_policy_notes || '';
  const hasDeepseek = !!deepseekKey;
  const hasOpenai   = !!openaiKey;
  const transcriptionModel = res?.ai_transcription_model || 'gpt-4o-transcribe';
  const ocrModel           = res?.ai_ocr_model           || 'gpt-5-mini';
  const deepseekModel      = res?.ai_deepseek_model      || 'deepseek-v4-flash';
  const reminderTemplate = res?.kpsc_reminder_template || 'Dear {{name}}, this is a reminder for your {{month}} partnership pledge. God bless you.';
  const incomeCategories = Array.isArray(res?.kpsc_income_categories) ? res.kpsc_income_categories.join('\n') : '';
  const expenseCategories = Array.isArray(res?.kpsc_expense_categories) ? res.kpsc_expense_categories.join('\n') : '';
  const meetingCadence = res?.kpsc_meeting_cadence || 'none';
  S.kpscMeetingCadence = meetingCadence;
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
            <option value="gpt-4o-transcribe" ${transcriptionModel === 'gpt-4o-transcribe' ? 'selected' : ''}>gpt-4o-transcribe — GPT-4o (Best quality, Recommended)</option>
            <option value="whisper-1" ${transcriptionModel === 'whisper-1' ? 'selected' : ''}>whisper-1 — Whisper v2 (Legacy · lower cost)</option>
          </select>
          <p class="k-hint">Used when you upload an audio file for transcription. <strong>gpt-4o-transcribe</strong> produces higher accuracy transcripts especially for accented speech and multi-speaker audio. <strong>whisper-1</strong> costs less per minute and is a good fallback.</p>
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
            autocomplete="off" value="${esc(deepseekKey)}" />
          <div class="k-key-test-row">
            <button class="kbtn kbtn-sm k-key-test-btn" onclick="Kpsc.testDeepseekKey(this)">Test connection</button>
            <span class="k-key-status" id="ks-deepseek-status"></span>
          </div>
          <p class="k-hint">Used to generate meeting minutes with AI. Get a key at <a href="https://platform.deepseek.com" target="_blank" rel="noopener">platform.deepseek.com</a></p>
        </div>

        <div class="k-form-group">
          <label class="k-label">OpenAI API Key</label>
          <input type="password" id="ks-openai-key" class="k-input"
            placeholder="${hasOpenai ? '••••••••••••••••' : 'sk-...'}"
            autocomplete="off" value="${esc(openaiKey)}" />
          <div class="k-key-test-row">
            <button class="kbtn kbtn-sm k-key-test-btn" onclick="Kpsc.testOpenaiKey(this)">Test connection</button>
            <span class="k-key-status" id="ks-openai-status"></span>
          </div>
          <p class="k-hint">Required for audio transcription, notes OCR, and receipt scanning. Get a key at <a href="https://platform.openai.com" target="_blank" rel="noopener">platform.openai.com</a></p>
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
          <label class="k-label">SMS/WhatsApp Reminder Template</label>
          <textarea id="ks-reminder-template" class="k-input k-textarea" style="min-height:80px">${esc(reminderTemplate)}</textarea>
          <p class="k-hint">Use <code>{{name}}</code> for partner name and <code>{{month}}</code> for month name.</p>
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
        <h2 class="k-card-title">About KPSC Portal</h2>
        <p class="k-card-sub">Kingdom Parish Stewardship Committee Meeting Portal</p>
        <div class="k-about-row"><span class="k-about-label">Church</span><span>Redeemed Christian Church of God</span></div>
        <div class="k-about-row"><span class="k-about-label">Parish</span><span>Kingdom Parish, Aguleri</span></div>
        <div class="k-about-row"><span class="k-about-label">Version</span><span>Phase 1</span></div>
      </div>
    </div>`;
}

async function saveAiModels() {
  const msg = document.getElementById('ks-ai-models-save-msg');
  const deepseekModel      = document.getElementById('ks-deepseek-model')?.value      || 'deepseek-v4-flash';
  const transcriptionModel = document.getElementById('ks-transcription-model')?.value || 'gpt-4o-transcribe';
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

  btn.disabled = true;
  btn.textContent = 'Saving…';
  msg.style.display = 'none';

  const res = await apiPost('settings', {
    ai_deepseek_key: deepseekKey,
    ai_openai_key: openaiKey,
    kpsc_policy_url: policyUrl,
    kpsc_policy_notes: policyNotes,
  });

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
  const template = document.getElementById('ks-reminder-template')?.value.trim() || '';
  const incomeText = document.getElementById('ks-income-cats')?.value || '';
  const expenseText = document.getElementById('ks-expense-cats')?.value || '';
  const cadence = document.getElementById('ks-meeting-cadence')?.value || 'none';
  const incomeCategories = incomeText.split(/[\n,]/).map(s=>s.trim().toLowerCase().replace(/\s+/g,'_')).filter(Boolean);
  const expenseCategories = expenseText.split(/[\n,]/).map(s=>s.trim().toLowerCase().replace(/\s+/g,'_')).filter(Boolean);
  const res = await apiPost('settings', {
    kpsc_reminder_template: template,
    kpsc_income_categories: incomeCategories,
    kpsc_expense_categories: expenseCategories,
    kpsc_meeting_cadence: cadence,
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
  { key: 'archive',          label: 'Archive' },
  { key: 'projects',         label: 'Projects' },
  { key: 'partners',         label: 'Partners' },
  { key: 'partner-progress', label: 'Progress' },
  { key: 'finance',          label: 'Finance' },
  { key: 'reminders',        label: 'Reminders' },
  { key: 'reports',          label: 'Reports' },
  { key: 'members',          label: 'Members' },
  { key: 'settings',         label: 'Settings' },
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
  return `
    <div class="k-card" style="margin-bottom:16px">
      <h2 class="k-card-title">Role Permissions</h2>
      <p class="k-card-sub">Control which sections each role can access. Greyed checkboxes are always enforced and cannot be changed.</p>
      <div style="overflow-x:auto">
        <table class="k-perm-table">
          <thead>
            <tr>
              <th class="k-perm-role-col">Role</th>
              ${PERM_PAGES.map(p => `<th class="k-perm-page-col">${p.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${PERM_ROLES.map(role => {
              const allowed = Array.isArray(perms[role.key]) ? perms[role.key] : (KPSC_PERMISSIONS[role.key] || []);
              return `<tr>
                <td class="k-perm-role-name">${role.label}</td>
                ${PERM_PAGES.map(page => {
                  const forced  = isPermForced(role.key, page.key);
                  const checked = forced || allowed.includes(page.key);
                  return `<td class="k-perm-check-cell">
                    <input type="checkbox" id="kp-${role.key}-${page.key}"
                      ${checked ? 'checked' : ''}
                      ${forced  ? 'disabled title="Always enabled"' : ''}
                    />
                  </td>`;
                }).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div id="ks-perms-save-msg" class="k-settings-msg" style="display:none"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="kbtn kbtn-primary" onclick="Kpsc.saveRolePermissions()">Save Role Permissions</button>
        <button class="kbtn" onclick="Kpsc.resetRolePermissions()">Reset to Defaults</button>
      </div>
    </div>`;
}

async function saveRolePermissions() {
  const perms = {};
  for (const role of PERM_ROLES) {
    perms[role.key] = PERM_PAGES
      .filter(page => isPermForced(role.key, page.key) || document.getElementById(`kp-${role.key}-${page.key}`)?.checked)
      .map(page => page.key);
  }
  const msg = document.getElementById('ks-perms-save-msg');
  const res = await apiPost('settings', { kpsc_role_permissions: perms });
  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
  } else {
    S.rolePermissions = perms;
    msg.className = 'k-settings-msg k-msg-ok';
    msg.textContent = 'Role permissions saved.';
  }
  msg.style.display = 'block';
  setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
}

async function resetRolePermissions() {
  if (!confirm('Reset all role permissions to defaults? This will undo any customisations.')) return;
  const msg = document.getElementById('ks-perms-save-msg');
  const res = await apiPost('settings', { kpsc_role_permissions: KPSC_PERMISSIONS });
  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
    msg.style.display = 'block';
    setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000);
  } else {
    S.rolePermissions = null; // null triggers fallback to KPSC_PERMISSIONS in effectiveRolePermissions()
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
      <div class="k-meeting-card">
        <div class="k-mc-top">
          <div style="flex:1">
            <div class="k-mc-title">${esc(p.title)}</div>
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
          <div class="k-room-actions" style="flex-wrap:wrap">
            <button class="kbtn kbtn-sm kbtn-primary" onclick="Kpsc.openProjectModal('${p.id}')">Edit</button>
            <select class="k-input k-input-sm" style="width:auto;padding:4px 8px" onchange="Kpsc.changeProjectStatus('${p.id}', this.value)">
              ${PROJECT_STATUSES.map(s => `<option value="${s.value}" ${p.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.deleteProject('${p.id}')">Delete</button>
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
    const transcriptEl = document.getElementById('km-transcript');
    if (transcriptEl) {
      transcriptEl.value = (transcriptEl.value ? transcriptEl.value + '\n\n' : '') + ocr.transcript;
      showToast('Handwritten notes transcribed! Review and adjust before processing.', 'success');
    }
    const note = ocr.errors.length ? ` (${ocr.errors.length} photo${ocr.errors.length === 1 ? '' : 's'} skipped due to OCR errors.)` : '';
    if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Extracted text from ${ocr.successCount} of ${ocr.totalCount} photo${ocr.totalCount === 1 ? '' : 's'}${note} Review the transcript, then click <strong>End Meeting</strong> below to proceed.</div>`;
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
  if (!file) { preview.innerHTML = ''; return; }
  const mb = (file.size / 1024 / 1024).toFixed(1);
  preview.innerHTML = `
    <div style="background:var(--surface,#f8fafc);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:10px">
      🎵 <strong>${esc(file.name)}</strong> &nbsp;·&nbsp; ${mb} MB
    </div>
    <div class="k-room-actions">
      <button class="kbtn kbtn-primary" onclick="Kpsc.transcribeAudioFile()">🤖 Transcribe with AI</button>
    </div>`;
  if (status) status.innerHTML = '';
}

async function transcribeAudioFile() {
  const audioInput = document.getElementById('km-audio-file');
  const audioFile  = audioInput?.files?.[0];
  const status     = document.getElementById('km-audio-status');
  if (!audioFile) { showToast('Please select an audio file first.', 'error'); return; }

  const useDiarize = document.getElementById('km-audio-diarize')?.checked;

  if (status) status.innerHTML = '<div class="k-loading" style="padding:16px">🤖 Transcribing audio…</div>';

  // Clear any previous speaker map.
  const speakerMapEl = document.getElementById('km-speaker-map');
  if (speakerMapEl) speakerMapEl.innerHTML = '';

  // ── Diarization path ──────────────────────────────────────────
  if (useDiarize) {
    try {
      const diarizedTranscript = await transcribeAudioWithDiarization_UI(audioFile, status);
      if (diarizedTranscript !== null) {
        // Plain transcript returned (no utterances) — treat same as regular.
        const transcriptEl = document.getElementById('km-transcript');
        if (transcriptEl) {
          transcriptEl.value = (transcriptEl.value ? transcriptEl.value + '\n\n' : '') + diarizedTranscript;
        }
        if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Audio transcribed. Review the transcript, then click <strong>End Meeting</strong> below to proceed.</div>`;
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

  try {
    // Build audio formData for multipart POST (no Content-Type header — browser sets boundary)
    const audioForm = new FormData();
    audioForm.append('audio', audioFile, audioFile.name);
    audioForm.append('mimeType', audioFile.type || 'audio/webm');

    // Kick off audio transcription (and optional OCR) in parallel
    const audioPromise = fetch(`${API}/kpsc-transcribe-audio`, {
      method: 'POST',
      headers: { ...kpscSessionHeader() },
      body: audioForm,
    }).then(r => r.json());

    const ocrPromise = notesFiles.length ? ocrNotesImages(notesFiles) : Promise.resolve(null);

    const [audioRes, ocrRes] = await Promise.all([audioPromise, ocrPromise]);

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

    const ocrText = String(ocrRes?.transcript || '').trim();
    const ocrFailed = notesFiles.length > 0 && !ocrText;
    const combined = ocrText
      ? `${audioText}${NOTES_SEPARATOR}${ocrText}`
      : audioText;

    const transcriptEl = document.getElementById('km-transcript');
    if (transcriptEl) {
      transcriptEl.value = (transcriptEl.value ? transcriptEl.value + '\n\n' : '') + combined;
    }

    let successMsg = ocrText
      ? `✓ Audio transcribed and handwritten notes combined successfully (${ocrRes.successCount}/${ocrRes.totalCount} photo${ocrRes.totalCount === 1 ? '' : 's'}).`
      : '✓ Audio transcribed successfully.';
    if (ocrFailed) {
      const reason = ocrRes?.errors?.[0] || 'could not extract text from any notes photo';
      successMsg += ` (Note: handwritten notes were skipped — ${esc(reason)}.)`;
    } else if (ocrRes?.errors?.length) {
      successMsg += ` (${ocrRes.errors.length} photo${ocrRes.errors.length === 1 ? '' : 's'} skipped due to OCR errors.)`;
    }
    if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">${successMsg} Review the transcript, then click <strong>End Meeting</strong> below to proceed.</div>`;
    showToast(ocrText ? 'Audio and notes combined! Review before processing.' : 'Audio transcribed! Review before processing.', 'success');
  } catch (e) {
    if (status) status.innerHTML = `<div class="k-error-box">Error: ${esc(e.message)}</div>`;
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
  preview.innerHTML = `<div style="display:grid;${cols}gap:10px">${thumbs}</div>`;
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

    const transcriptEl = document.getElementById('km-transcript');
    if (transcriptEl) {
      transcriptEl.value = (transcriptEl.value ? transcriptEl.value + '\n\n' : '') + ocr.transcript;
      showToast('Handwritten notes appended to transcript!', 'success');
    }
    const note = ocr.errors.length ? ` (${ocr.errors.length} photo${ocr.errors.length === 1 ? '' : 's'} skipped due to OCR errors.)` : '';
    if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Extracted text from ${ocr.successCount} of ${ocr.totalCount} photo${ocr.totalCount === 1 ? '' : 's'}${note} and appended to the transcript above.</div>`;
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
    // Escape HTML entities first to prevent XSS before applying markdown transforms
    const escaped = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return escaped
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>[\n]?)+/g, '<ul>$&</ul>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
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
  if (status) status.innerHTML = '<div class="k-loading" style="padding:16px">🎙️ Transcribing with speaker diarization…</div>';

  const form = new FormData();
  form.append('audio', audioFile, audioFile.name);
  form.append('mimeType', audioFile.type || 'audio/webm');

  const res = await fetch(`${API}/kpsc-transcribe-audio-diarize`, {
    method: 'POST',
    headers: { ...kpscSessionHeader() },
    body: form,
  }).then(r => r.json());

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
  const transcript = buildDiarizedTranscript(nameMap);
  const el = document.getElementById('km-transcript');
  if (el) el.value = (el.value ? el.value + '\n\n' : '') + transcript;
  const speakerMapEl = document.getElementById('km-speaker-map');
  if (speakerMapEl) speakerMapEl.innerHTML = '';
  const status = document.getElementById('km-audio-status');
  if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Speaker-labelled transcript added. Review the transcript, then click <strong>End Meeting</strong> below to proceed.</div>`;
  showToast('Diarized transcript applied!', 'success');
  _diarizedUtterances = [];
}

function applyDiarizedTranscriptRaw() {
  const transcript = buildDiarizedTranscript({});
  const el = document.getElementById('km-transcript');
  if (el) el.value = (el.value ? el.value + '\n\n' : '') + transcript;
  const speakerMapEl = document.getElementById('km-speaker-map');
  if (speakerMapEl) speakerMapEl.innerHTML = '';
  const status = document.getElementById('km-audio-status');
  if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Transcript added with speaker labels. Review the transcript, then click <strong>End Meeting</strong> below to proceed.</div>`;
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
  setPartnersFilter,
  setPartnersYear,
  deletePartner,
  openPartnerDetail,
  setPartnerDetailYear,
  openFinanceModal,
  closeFinanceModal,
  saveFinanceEntry,
  updateFinanceCategoryOptions,
  scanReceiptPhoto,
  mapReceiptOcrToFormFields,
  setFinanceYear,
  setFinanceMonth,
  deleteFinanceEntry,
  runReconciliation,
  sendBulkReminders,
  copyReminderMessage,
  personalizeReminder,
  useReminderVariant,
  closePersonalizeModal,
  debouncedSaveReminderTemplate,
  setReportsYear,
  setReportsMonth,
  setReportsFilter,
  setReportsSearch,
  updateReportActionStatus,
  saveKpscOpsSettings,
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
};

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('popstate', e => {
  const page = e.state?.page || window.location.hash.replace('#', '') || 'dashboard';
  if (page && page !== S.page) {
    const mapping = PAGE_TO_GROUP[page] || { group: 'home', subTab: null };
    S.page   = page;
    S.group  = mapping.group;
    S.subTab = mapping.subTab;
    document.querySelectorAll('.ka-nav-item').forEach(b => b.classList.toggle('active', b.dataset.group === S.group));
    updateFab();
    renderPage(page);
  }
});
