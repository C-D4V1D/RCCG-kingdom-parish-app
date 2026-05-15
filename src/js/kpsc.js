// KPSC Meeting Portal — standalone SPA
// Kingdom Parish Stewardship Committee

const API = '/api';
const SESSION_KEY = 'kpsc_session';

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
  acting_chairman:    ['dashboard', 'projects', 'partners', 'finance', 'reminders', 'members', 'archive', 'reports', 'settings'],
  general_secretary:  ['dashboard', 'projects', 'partners', 'reminders', 'members', 'archive', 'reports', 'settings'],
  financial_secretary:['dashboard', 'projects', 'partners', 'finance', 'reminders', 'archive', 'reports'],
  treasurer:          ['dashboard', 'projects', 'partners', 'finance', 'reminders', 'archive', 'reports'],
  committee_viewer:   ['dashboard', 'projects', 'partners', 'reports', 'archive'],
};
const PIN_REGEX = /^\d{4,6}$/;

// ── NAV GROUP / SUB-TAB MAPPING ────────────────────────────────────
// Maps old page names to (group, subTab) pairs for backwards compat.
const PAGE_TO_GROUP = {
  dashboard: { group: 'home',     subTab: null         },
  archive:   { group: 'meetings', subTab: 'archive'    },
  reports:   { group: 'meetings', subTab: 'reports'    },
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
  _meetingTab: 'record',
  _reviewEditMode: false, // true = show inline review editor; false = show reviewed summary
  _isNewMeeting: false,   // true when the room is hosting a fresh, never-saved draft
  kpscMeetingCadence: 'none',
};

// ── AUDIO RECORDER + REALTIME TRANSCRIPTION ───────────────────────
const REC_CHUNK_MS = 5000;
const REC_RETRY_BASE_MS = 1200;
const REC_MAX_RETRIES = 5;

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
  // PCM ring buffer — raw Float32 samples from the AudioWorklet, used to
  // extract per-speaker audio slices for Azure Speaker Recognition.
  pcmChunks: [],        // Array of {offset: number, data: Float32Array}
  pcmSampleOffset: 0,   // Total samples written since Diarizer was constructed
  pcmSampleRate: 0,     // Set from AudioContext.sampleRate on connection
  dgTimeOffset: 0,      // pcmSampleOffset when the current WS connection was opened;
                        // adds to Deepgram's 0-based timestamps to get absolute offsets
  speakerRanges: new Map(), // Map<speakerIdx, {startSample, endSample}[]>
  identifyPending: new Set(), // speaker indices currently being identified by Azure
};

// ── VOICE ENROLLMENT ───────────────────────────────────────────────
// Captures a ~30-second voice sample from a member and enrolls it
// with Azure Speaker Recognition for automatic future identification.
const Enrolling = {
  stream: null,
  audioCtx: null,
  workletNode: null,
  workletUrl: null,
  samples: [],      // Float32Array chunks collected during enrollment
  sampleRate: 0,
  timer: null,
  elapsed: 0,
  memberIdx: -1,
  active: false,
};

// ── AZURE SPEAKER RECOGNITION CONSTANTS ───────────────────────────
const AZURE_IDENTIFY_THRESHOLD_SEC = 5;   // seconds of speech needed before triggering auto-ID
const AZURE_IDENTIFY_MIN_AUDIO_SEC  = 4;  // minimum seconds Azure needs for a reliable match
const AZURE_IDENTIFY_MAX_AUDIO_SEC  = 10; // max seconds of audio to send per identification call
const AZURE_IDENTIFY_MIN_SCORE = 0.5;     // minimum confidence (0–1) to accept auto-assignment
const AZURE_ENROLL_DURATION_SEC = 30;     // seconds of audio to capture for enrollment
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
  // Track newly seen speakers so the identity panel can be updated.
  if (speaker !== null && speaker !== undefined && !Rec.seenSpeakers.has(speaker)) {
    Rec.seenSpeakers.add(speaker);
    recRenderSpeakerMap();
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
  try {
    if (btn) btn.disabled = true;
    // Auto-persist the meeting so End/Generate Minutes have a backing record. No toast on success.
    if (!S.activeMeeting) {
      await autoSaveNow();
      if (!S.activeMeeting) {
        showToast('Could not save the meeting. Check your connection and try again.', 'error');
        if (btn) btn.disabled = false;
        return;
      }
    }
    Rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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
    // Reset per-speaker identification state for the new session.
    Diarizer.speakerRanges   = new Map();
    Diarizer.identifyPending = new Set();

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
  Diarizer.status = 'offline';
  Diarizer.reconnectAttempts = 0;
  Diarizer.speakerRanges   = new Map();
  Diarizer.identifyPending = new Set();
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

window.addEventListener('beforeunload', () => {
  if (Rec.status === 'recording' && Rec.mediaRecorder?.state === 'recording') {
    try { Rec.mediaRecorder.requestData(); } catch (_) { /* noop */ }
  }
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
  diarizerClose(false);
  Diarizer.status = Diarizer.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
  recRenderUI();

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
  await audioCtx.audioWorklet.addModule(workletUrl);

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
  // Sec-WebSocket-Protocol subprotocol ('token', <api-key>). Query
  // parameters like ?token=... are NOT accepted and silently fail.
  console.info('[diarizer] opening WebSocket to Deepgram');
  // Temporary access token from /v1/auth/grant uses the Bearer scheme;
  // browsers can't set the Authorization header on a WebSocket, so the
  // scheme + token ride in the Sec-WebSocket-Protocol subprotocols list.
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${dgParams}`, ['bearer', accessToken]);
  Diarizer.ws = ws;
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    Diarizer.status = 'connected';
    // Don't reset reconnectAttempts here — Deepgram sometimes opens the socket
    // then closes it immediately (auth race, model mismatch). Resetting on open
    // would create an infinite reconnect loop. We reset only after the first
    // real Results message arrives in diarizerHandleMessage().
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
      // Buffer a copy of the raw PCM for Azure speaker identification.
      diarizerBufferPcm(e.data);
    };
    source.connect(workletNode);
    // Worklet must be connected to something in the audio graph to keep processing.
    workletNode.connect(audioCtx.createMediaStreamDestination());
  };

  ws.onmessage = (e) => diarizerHandleMessage(e.data);

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
    if (!Diarizer.manualStop && Rec.status === 'recording') {
      diarizerScheduleReconnect();
    }
  };
}

function diarizerHandleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  // Any well-formed message means the connection is genuinely working — safe to reset retry counter.
  if (Diarizer.reconnectAttempts !== 0) Diarizer.reconnectAttempts = 0;

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
    Diarizer.identifyPending = new Set();
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

// Collect up to AZURE_IDENTIFY_MAX_AUDIO_SEC of audio for a speaker index from the ring buffer.
function diarizerExtractSpeakerAudio(speakerIdx) {
  const ranges = Diarizer.speakerRanges.get(speakerIdx) || [];
  if (!ranges.length || !Diarizer.pcmSampleRate) return null;
  const maxSamples = AZURE_IDENTIFY_MAX_AUDIO_SEC * Diarizer.pcmSampleRate;
  let accumulated = 0;
  const toExtract = [];
  for (let i = ranges.length - 1; i >= 0 && accumulated < maxSamples; i--) {
    toExtract.unshift(ranges[i]);
    accumulated += ranges[i].endSample - ranges[i].startSample;
  }
  const chunks = toExtract.map(r => diarizerExtractPcmRange(r.startSample, r.endSample)).filter(Boolean);
  if (!chunks.length) return null;
  const totalLen = Math.min(chunks.reduce((a, c) => a + c.length, 0), maxSamples);
  const out = new Float32Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    if (pos >= out.length) break;
    const take = Math.min(c.length, out.length - pos);
    out.set(c.subarray(0, take), pos);
    pos += take;
  }
  return out;
}

// Record the time range spoken by a Deepgram speaker index (in absolute PCM samples).
// Triggers Azure identification once AZURE_IDENTIFY_THRESHOLD_SEC of audio is collected.
function diarizerAccumulateSpeakerRange(speakerIdx, startSec, endSec) {
  if (!Diarizer.pcmSampleRate) return;
  const sr          = Diarizer.pcmSampleRate;
  const startSample = Math.floor(startSec * sr) + Diarizer.dgTimeOffset;
  const endSample   = Math.ceil(endSec   * sr) + Diarizer.dgTimeOffset;
  if (!Diarizer.speakerRanges.has(speakerIdx)) Diarizer.speakerRanges.set(speakerIdx, []);
  Diarizer.speakerRanges.get(speakerIdx).push({ startSample, endSample });

  const totalSamples = Diarizer.speakerRanges.get(speakerIdx)
    .reduce((a, r) => a + (r.endSample - r.startSample), 0);
  if (!Diarizer.identifyPending.has(speakerIdx) &&
      totalSamples >= AZURE_IDENTIFY_THRESHOLD_SEC * sr) {
    diarizerTriggerIdentify(speakerIdx).catch(e => console.warn('Auto-identify error:', e));
  }
}

// Return true if a member's attendance checkbox is ticked in the current meeting.
function isMemberPresent(mem) {
  const groupMembers = S.members.filter(m => m.group === mem.group);
  const groupIdx     = groupMembers.indexOf(mem);
  if (groupIdx < 0) return false;
  const el = document.getElementById(`att_present_${mem.group}_${groupIdx}`);
  return el?.checked === true;
}

// Attempt to auto-identify a Deepgram speaker index using Azure Speaker Recognition.
// Silently skips if Azure is not configured or no enrolled members are present.
async function diarizerTriggerIdentify(speakerIdx) {
  if (Rec.speakerMap.has(speakerIdx)) return; // already assigned manually
  const enrolledPresent = S.members.filter(m => m.azureSpeakerProfileId && isMemberPresent(m));
  if (!enrolledPresent.length) return;

  Diarizer.identifyPending.add(speakerIdx);
  try {
    const audio = diarizerExtractSpeakerAudio(speakerIdx);
    // Azure needs at least AZURE_IDENTIFY_MIN_AUDIO_SEC of speech for a reliable match.
    if (!audio || audio.length < AZURE_IDENTIFY_MIN_AUDIO_SEC * Diarizer.pcmSampleRate) return;

    const resampled   = resampleTo16k(audio, Diarizer.pcmSampleRate);
    const wavBuffer   = pcmToWav(resampled, 16000);
    const audioBase64 = arrayBufferToBase64(wavBuffer);
    const profileIds  = enrolledPresent.map(m => m.azureSpeakerProfileId);

    const res = await apiPost('azure-speaker-identify', { profileIds, audioBase64 });
    if (res.error) { console.warn('Speaker identification:', res.error); return; }

    if (res.profileId && res.score >= AZURE_IDENTIFY_MIN_SCORE) {
      if (Rec.speakerMap.has(speakerIdx)) return; // assigned while we waited
      const matched = enrolledPresent.find(m => m.azureSpeakerProfileId === res.profileId);
      if (matched) {
        assignSpeaker(speakerIdx, matched.name);
        showToast(`🎙 Auto-identified: ${matched.name} (${Math.round(res.score * 100)}% match)`, 'success');
      }
    }
  } catch (e) {
    console.warn('diarizerTriggerIdentify error:', e);
  } finally {
    Diarizer.identifyPending.delete(speakerIdx);
  }
}


function kpscSessionHeader() {
  const user = S.user;
  if (!user?.sessionToken) return {};
  return { 'X-KPSC-Session': JSON.stringify({ accountId: user.id, token: user.sessionToken }) };
}

async function apiGet(path) {
  const r = await fetch(`${API}/${path}`, { headers: { ...kpscSessionHeader() } });
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function apiPut(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function apiDelete(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...kpscSessionHeader() },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

function roleLabel(role) {
  const map = {
    acting_chairman: 'Acting Chairman',
    general_secretary: 'General Secretary',
    financial_secretary: 'Financial Secretary',
    treasurer: 'Treasurer',
    committee_viewer: 'Committee Viewer',
  };
  return map[String(role || '').toLowerCase()] || 'Committee Viewer';
}

function canAccess(page) {
  // Group-level navigation names are always accessible (groups are always shown).
  if (['home', 'meetings', 'money', 'more'].includes(page)) return true;
  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const allowed = KPSC_PERMISSIONS[role] || KPSC_PERMISSIONS.committee_viewer;
  return allowed.includes(page);
}

function canManagePartners() {
  return ['acting_chairman', 'general_secretary', 'financial_secretary', 'treasurer'].includes(String(S.user?.role || '').toLowerCase());
}

function canManageFinance() {
  return ['acting_chairman', 'financial_secretary', 'treasurer'].includes(String(S.user?.role || '').toLowerCase());
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
  const allowed = KPSC_PERMISSIONS[role] || KPSC_PERMISSIONS.committee_viewer;
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
// Azure Speaker Recognition requires 8/16/32 kHz WAV input.
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

function enterApp() {
  document.getElementById('kpsc-login-screen').style.display = 'none';
  document.getElementById('kpsc-app').style.display = '';
  document.getElementById('kpsc-user-name').textContent = `${S.user.name} (${roleLabel(S.user.role)})`;
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
  if ((Rec.status === 'recording' || Rec.status === 'paused') && document.getElementById('km-transcript')) {
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
  const enrolledCount = S.members.filter(m => m.azureSpeakerProfileId).length;
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
  };
}

// Returns HTML for the "Open / Resume meeting" primary action card.
function dashCardOpenMeeting(ctx) {
  const draft = [...S.meetings].find(m => m.status === 'draft' || m.status === 'recording');
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
function dashboardCardsForRole(role, ctx) {
  const r = String(role || 'committee_viewer').toLowerCase();

  if (r === 'acting_chairman') {
    return `
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

  // Load all data needed for any role in parallel
  const [meetingsRes, settingsRes, dashboardRes, projectsRes, financeRes, partnersRes, paymentsRes] = await Promise.all([
    apiGet('ai-secretary-meetings'),
    apiGet('settings'),
    apiGet(`kpsc-dashboard?year=${year}&month=${month}`),
    apiGet('kpsc-projects'),
    apiGet(`kpsc-finance?year=${year}&month=${month}`),
    apiGet('kpsc-partners'),
    apiGet(`kpsc-partner-payments?year=${year}`),
  ]);
  if (meetingsRes?.error) throw new Error(meetingsRes.error);
  S.meetings        = Array.isArray(meetingsRes)            ? meetingsRes            : [];
  S.members         = Array.isArray(settingsRes?.kpsc_members) ? settingsRes.kpsc_members : [];
  S.dashboard       = dashboardRes?.totals || null;
  S.projects        = Array.isArray(projectsRes)            ? projectsRes            : [];
  S.financeEntries  = Array.isArray(financeRes)             ? financeRes             : [];
  S.partners        = Array.isArray(partnersRes)            ? partnersRes            : [];
  S.partnerPayments = Array.isArray(paymentsRes)            ? paymentsRes            : [];

  // Load distributed-meeting-ids from settings (stored as JSON string)
  const rawDistributed = Array.isArray(settingsRes?.kpsc_distributed_meeting_ids)
    ? settingsRes.kpsc_distributed_meeting_ids
    : (Array.isArray(S._distributedMeetingIds) ? S._distributedMeetingIds : []);
  S._distributedMeetingIds = rawDistributed;

  const role = String(S.user?.role || 'committee_viewer').toLowerCase();
  const ctx  = buildDashboardContext();

  main.innerHTML = `
    <div class="k-page">
      ${dashboardCardsForRole(role, ctx)}
    </div>`;
}

function canDeleteMeeting(m) {
  const role = String(S.user?.role || '').toLowerCase();
  if (role === 'acting_chairman' || role === 'general_secretary') return true;
  return !!S.user?.name && S.user.name === (m.createdBy || '');
}

function meetingCard(m) {
  const showDelete = canDeleteMeeting(m);
  return `
    <div class="k-meeting-card" onclick="Kpsc.openMeeting('${m.id}')">
      <div class="k-mc-top">
        <div class="k-mc-title">${esc(m.title)}</div>
        <div class="k-mc-badges">
          ${typeBadge(m.meetingType)} ${statusBadge(m.status)}
          ${showDelete ? `<button class="k-mc-del" title="Delete draft" aria-label="Delete draft" onclick="Kpsc.deleteMeetingDraft('${m.id}', event)">🗑</button>` : ''}
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
  S.activeMeeting = null;
  S._isNewMeeting = true;
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
  // Default review-edit mode: show editor if not yet reviewed, summary if reviewed.
  if (m?.status === 'processed') {
    S._reviewEditMode = !m.reviewedAt;
  }
  const id = m?.id || '';
  const status = m?.status || 'draft';
  const isProcessed = status === 'processed';
  const isEnded     = status === 'ended' || isProcessed;
  const canRecord   = !isEnded;
  const phase = isProcessed ? 'review' : status === 'ended' ? 'ended' : status === 'recording' ? 'live' : 'setup';

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
  const attendanceRows = buildAttendanceRows(savedParts, isFresh);

  const detailsSummary = `${esc(prefillTitle)} · ${esc(fmtDate(prefillDate))} · ${esc((MEETING_TYPES.find(t=>t.value===prefillType)||{}).label||'')}`;
  const presentInitial = isFresh ? S.members.length : savedParts.filter(p => p.present).length;
  const attendanceSummary = `${presentInitial} present of ${S.members.length}`;

  main.innerHTML = `
    <div class="k-page k-room" data-phase="${phase}">
      <div id="km-stepper">${stepper(status)}</div>

      <details class="k-collapsible" id="km-details-section" ${phase === 'setup' ? 'open' : ''}>
        <summary class="k-collapsible-hdr">
          <span class="k-collapsible-title">Meeting Details</span>
          <span class="k-collapsible-summary" id="km-details-summary">${detailsSummary}</span>
        </summary>
        <input type="hidden" id="km-status" value="${status}" />
        <div class="k-field-row">
          <div class="k-field">
            <label class="k-label">Title</label>
            <input class="k-input" id="km-title" type="text" value="${esc(prefillTitle)}" ${isProcessed ? 'readonly' : ''} />
          </div>
          <div class="k-field k-field-sm">
            <label class="k-label">Date</label>
            <input class="k-input" id="km-date" type="date" value="${prefillDate}" ${isProcessed ? 'readonly' : ''} />
          </div>
        </div>
        <div class="k-field">
          <label class="k-label">Meeting Type</label>
          <select class="k-input" id="km-type" ${isProcessed ? 'disabled' : ''}>
            ${MEETING_TYPES.map(t => `<option value="${t.value}" ${prefillType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
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
        ${phase === 'setup' ? `<p class="k-quick-hint">Confirm the details above, then tap 🎙 Start Meeting below to begin recording. Everything saves automatically.</p>` : ''}
        <div class="k-tabs" style="margin-bottom:16px">
          <button class="k-tab ${S._meetingTab !== 'upload' ? 'active' : ''}" onclick="Kpsc.setMeetingTab('record')">🎙 Live Recording</button>
          <button class="k-tab ${S._meetingTab === 'upload' ? 'active' : ''}" onclick="Kpsc.setMeetingTab('upload')">📷 Upload Notes</button>
        </div>
        <div id="km-rec-panel" style="${S._meetingTab === 'upload' ? 'display:none' : ''}">
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
        <label class="k-label k-transcript-label" for="km-transcript">Saved Transcript / Notes</label>
        <textarea class="k-input k-textarea" id="km-transcript" placeholder="Type notes here, or start the meeting to append live transcript entries…" ${isProcessed ? 'readonly' : ''}>${esc(m?.transcriptText || '')}</textarea>
        </div>
        <div id="km-upload-panel" style="${S._meetingTab !== 'upload' ? 'display:none' : ''}">
          <div class="k-section">
            <p class="k-hint">Take a photo of your handwritten meeting notes. The AI will transcribe the handwriting and use it to generate meeting minutes.</p>
            <label class="k-label">Upload Photo of Handwritten Notes</label>
            <input id="km-notes-photo" type="file" accept="image/*" capture="environment" class="k-input" style="padding:8px" onchange="Kpsc.previewNotesPhoto(this)" />
            <div id="km-notes-preview" style="margin-top:12px"></div>
          </div>
        </div>
      </section>

      <div class="k-room-actions">
        ${!isProcessed ? `<span id="km-autosave-status" class="k-autosave-status" aria-live="polite"></span>` : ''}
        ${status === 'recording' ? `<button class="kbtn kbtn-amber" onclick="Kpsc.endMeeting(this)">🔒 End Meeting</button>` : ''}
        ${status === 'ended' ? `<button class="kbtn kbtn-primary" onclick="Kpsc.processMeeting(this)">✨ Generate Minutes</button>` : ''}
        ${isProcessed ? `<div class="k-processed-note">✅ Minutes have been generated and finalised.</div>` : ''}
      </div>

      ${isProcessed && m ? renderMinutesPanel(m) : ''}
    </div>`;

  if (canRecord) recRenderUI();
  recRenderTranscript();
  if (!isProcessed) bindAutoSave();
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

function buildAttendanceRows(savedParts, defaultPresent = false) {
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
                ${isPresent ? 'checked' : ''} onchange="Kpsc.updateAttGroup('${g.key}')"/>
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
  const resolutions = m.resolutions || [];
  const actionItems = m.actionItems || [];
  const policyFlags = m.policyFlags || [];
  return `
    <div class="k-review-panel" id="kr-panel">
      <h4 class="k-sub-title" style="margin-top:0">✍️ Review & Correct AI Draft</h4>
      <p class="k-review-hint">AI output is a draft. Confirm approvals, vote wording, owners, deadlines, and the final minutes text before approving.</p>
      <div class="k-form-group">
        <label class="k-label">Short Summary</label>
        <textarea class="k-input k-review-textarea" id="kr-summary-short">${esc(m.summaryShort || '')}</textarea>
      </div>
      <div class="k-form-group">
        <label class="k-label">Detailed Summary</label>
        <textarea class="k-input k-review-textarea" id="kr-summary-long">${esc(m.summaryLong || '')}</textarea>
      </div>
      <div class="k-form-group">
        <label class="k-label">Minutes Markdown</label>
        <textarea class="k-input k-review-minutes" id="kr-minutes">${esc(m.minutesMarkdown || '')}</textarea>
      </div>
      <div class="k-form-group">
        <label class="k-label">Markdown Preview (read-only)</label>
        <div class="k-minutes-body" style="border:1.5px solid #e0e0e0;border-radius:8px;padding:12px;background:#fafafa;font-size:13px">${minutesHtml(m.minutesMarkdown || '')}</div>
      </div>

      <h4 class="k-sub-title">Resolutions</h4>
      <div class="k-review-list" id="kr-resolutions">
        ${resolutions.length ? resolutions.map((r, i) => `
          <div class="k-review-row" data-idx="${i}">
            <label class="k-label">Resolution Text</label>
            <textarea class="k-input" id="kr-res-text-${i}">${esc(r.text || '')}</textarea>
            <div class="k-review-grid">
              <input class="k-input" id="kr-res-type-${i}" value="${esc(r.resolutionType || '')}" placeholder="Type e.g. financial_approval" />
              <input class="k-input" id="kr-res-category-${i}" value="${esc(r.category || '')}" placeholder="Category" />
              <select class="k-input" id="kr-res-approved-${i}">
                <option value="null" ${r.approved === null || r.approved === undefined ? 'selected' : ''}>Needs confirmation</option>
                <option value="true" ${r.approved === true ? 'selected' : ''}>Approved</option>
                <option value="false" ${r.approved === false ? 'selected' : ''}>Rejected</option>
              </select>
              <input class="k-input" id="kr-res-amount-${i}" value="${esc(r.amount || '')}" placeholder="Amount" />
            </div>
            <input class="k-input" id="kr-res-vote-${i}" value="${esc(r.voteSummary || '')}" placeholder="Vote summary" />
          </div>`).join('') : '<div class="k-empty">No resolutions detected. Add them in the minutes text if needed.</div>'}
      </div>

      <h4 class="k-sub-title">Action Items</h4>
      <div class="k-review-list" id="kr-actions">
        ${actionItems.length ? actionItems.map((a, i) => `
          <div class="k-review-row" data-idx="${i}">
            <label class="k-label">Task</label>
            <textarea class="k-input" id="kr-act-task-${i}">${esc(a.task || '')}</textarea>
            <div class="k-review-grid">
              <input class="k-input" id="kr-act-assignee-${i}" value="${esc(a.assignee || '')}" placeholder="Owner" />
              <input class="k-input" id="kr-act-due-${i}" value="${esc(a.dueDate || '')}" placeholder="Deadline" />
              <select class="k-input" id="kr-act-status-${i}">
                ${['pending','in_progress','done','cancelled'].map(st => `<option value="${st}" ${(a.status || 'pending') === st ? 'selected' : ''}>${st.replace('_', ' ')}</option>`).join('')}
              </select>
            </div>
          </div>`).join('') : '<div class="k-empty">No action items detected. Add them in the minutes text if needed.</div>'}
      </div>

      ${policyFlags.length ? `
      <h4 class="k-sub-title">Policy Flags (read-only)</h4>
      <div class="k-flags-list">
        ${policyFlags.map(f => `
          <div class="k-flag k-flag-${f.severity || 'info'}">
            <strong>${esc(f.type)}</strong> — ${esc(f.message)}
          </div>`).join('')}
      </div>` : ''}

      <button class="kbtn kbtn-primary" style="margin-top:8px" onclick="Kpsc.saveMinutesReview(this)">Approve &amp; Save Review</button>
    </div>`;
}

function renderMinutesPanel(m) {
  if (!m?.minutesMarkdown) return '';
  const resolutions = m.resolutions || [];
  const actionItems = m.actionItems || [];
  const policyFlags = m.policyFlags || [];

  return `
    <section class="k-section k-minutes-section">
      <h3 class="k-sec-title">Meeting Minutes</h3>
      ${m.summaryShort ? `<div class="k-summary">${esc(m.summaryShort)}</div>` : ''}
      ${m.summaryLong ? `<details class="k-summary-detail"><summary>Detailed summary</summary><pre>${esc(m.summaryLong)}</pre></details>` : ''}

      ${renderReviewPanel(m)}

      <div class="k-room-actions" style="margin-bottom:12px;margin-top:16px">
        <button class="kbtn kbtn-sm" onclick="Kpsc.printMinutes('${m.id}')">🖨 Print / Save PDF</button>
        ${canManageProjects() && m.status === 'processed' ? `<button class="kbtn kbtn-sm" onclick="Kpsc.extractProjectsFromMeetingUI('${m.id}', this)">🤖 Extract Projects</button>` : ''}
      </div>

      <h4 class="k-sub-title">Minutes Preview</h4>
      <div class="k-minutes-body">${minutesHtml(m.minutesMarkdown)}</div>

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
    const res = await apiPut(`ai-secretary-meetings/${S.activeMeeting.id}`, {
      summaryShort: document.getElementById('kr-summary-short')?.value || '',
      summaryLong: document.getElementById('kr-summary-long')?.value || '',
      minutesMarkdown: document.getElementById('kr-minutes')?.value || '',
      resolutions: readReviewResolutions(),
      actionItems: readReviewActions(),
      policyFlags: S.activeMeeting.policyFlags || [],
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    // Mark as reviewed locally (no DB column — tracked in client state).
    S.activeMeeting = {
      ...res,
      reviewedAt: new Date().toISOString(),
      reviewedBy: S.user?.name || '',
    };
    S._reviewEditMode = false;
    // Re-render only the review panel in-place.
    const panel = document.getElementById('kr-panel');
    if (panel) {
      panel.outerHTML = renderReviewPanel(S.activeMeeting);
    } else {
      renderPage('meeting');
    }
    showToast('Review approved and saved', 'success');
  } catch {
    showToast('Review save failed. Check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function openReviewEditor() {
  S._reviewEditMode = true;
  const panel = document.getElementById('kr-panel');
  if (panel && S.activeMeeting) {
    panel.outerHTML = renderReviewPanel(S.activeMeeting);
  } else if (S.activeMeeting) {
    renderPage('meeting');
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
  meetingId: null, // matches S.activeMeeting?.id when bound; used to detect re-bind
};

function setAutoSaveStatus(text, kind) {
  const el = document.getElementById('km-autosave-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind || '';
}

function scheduleAutoSave() {
  // Skip auto-save for processed meetings (form is readonly anyway).
  if (S.activeMeeting?.status === 'processed') return;
  clearTimeout(Draft.timer);
  setAutoSaveStatus('Unsaved changes…', 'pending');
  Draft.timer = setTimeout(() => { autoSaveNow(); }, AUTOSAVE_DEBOUNCE_MS);
}

async function autoSaveNow() {
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
    if (res?.error) {
      setAutoSaveStatus(`Save failed: ${res.error}`, 'error');
    } else {
      S.activeMeeting = res;
      Draft.meetingId = res.id;
      S._isNewMeeting = false;
      setAutoSaveStatus(`Saved · ${fmtClock(new Date())}`, 'ok');
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

  const fire = () => { scheduleAutoSave(); updateCollapsibleSummaries(); };
  const form = document.getElementById('km-title')?.closest('.k-page');
  if (!form) return;
  for (const sel of ['#km-title', '#km-transcript']) {
    const el = form.querySelector(sel);
    if (el) el.addEventListener('input', fire);
  }
  for (const sel of ['#km-date', '#km-type']) {
    const el = form.querySelector(sel);
    if (el) el.addEventListener('change', fire);
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
async function deleteMeetingDraft(id, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  const m = S.meetings.find(x => x.id === id);
  if (!m) return;
  const role = String(S.user?.role || '').toLowerCase();
  const isChair = role === 'acting_chairman' || role === 'general_secretary';
  const isAuthor = !!S.user?.name && S.user.name === (m.createdBy || '');
  if (!isChair && !isAuthor) {
    showToast('Only the meeting author, Acting Chairman, or General Secretary can delete this draft.', 'error');
    return;
  }
  if (!confirm(`Delete "${m.title || 'this meeting'}"? It will be hidden from the list.`)) return;
  const res = await apiDelete(`ai-secretary-meetings/${id}`, {
    userName: S.user?.name || '',
    userRole: S.user?.role || '',
  });
  if (res?.error) { showToast(res.error, 'error'); return; }
  S.meetings = S.meetings.filter(x => x.id !== id);
  const main = document.getElementById('kpsc-main');
  if (main) await renderDashboard(main);
  showToast('Draft deleted', 'success');
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
  if (!confirm('Mark this meeting as ended? You will not be able to edit attendance or the transcript after this.')) return;

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
    showToast('Minutes generated successfully', 'success');
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

function memberRow(idx, mem) {
  const enrolled    = !!mem.azureSpeakerProfileId;
  const enrollClass = enrolled ? 'kbtn kbtn-sm k-enroll-btn k-enrolled' : 'kbtn kbtn-sm kbtn-ghost k-enroll-btn';
  const enrollTitle = enrolled ? 'Voice enrolled — click to re-enrol' : 'Enrol voice fingerprint for auto-identification';
  const enrollIcon  = enrolled ? '🎙✓' : '🎙';
  return `
    <div class="k-mem-row" id="kmem-row-${idx}">
      <select class="k-input k-input-sm k-mem-group" data-idx="${idx}" onchange="Kpsc.memberFieldChange(${idx},'group',this.value)">
        ${GROUPS.map(g => `<option value="${g.key}" ${mem.group === g.key ? 'selected' : ''}>${g.label}</option>`).join('')}
      </select>
      <input class="k-input k-input-sm k-mem-name" type="text" placeholder="Full name"
        value="${esc(mem.name || '')}" onchange="Kpsc.memberFieldChange(${idx},'name',this.value)" />
      <input class="k-input k-input-sm k-mem-pos" type="text" placeholder="Position (optional)"
        value="${esc(mem.position || '')}" onchange="Kpsc.memberFieldChange(${idx},'position',this.value)" />
      <button class="${enrollClass}" onclick="Kpsc.enrollMemberVoice(${idx})" title="${enrollTitle}">${enrollIcon}</button>
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

// ── VOICE ENROLLMENT UI ───────────────────────────────────────────

function enrollMemberVoice(idx) {
  const member = S.members[idx];
  if (!member || !member.name.trim()) {
    showToast('Please save the member name first.', 'warn');
    return;
  }
  showEnrollModal(idx);
}

function showEnrollModal(idx) {
  const member  = S.members[idx];
  if (!member) return;
  const alreadyEnrolled = !!member.azureSpeakerProfileId;

  document.getElementById('k-enroll-modal')?.remove();

  const modal = document.createElement('div');
  modal.id        = 'k-enroll-modal';
  modal.className = 'k-modal-overlay';
  modal.innerHTML = `
    <div class="k-modal">
      <div class="k-modal-hdr">
        <span class="k-modal-title">🎙 Enrol Voice — ${esc(member.name)}</span>
        <button class="kbtn kbtn-sm kbtn-ghost" onclick="Kpsc.closeEnrollModal()">✕</button>
      </div>
      <div class="k-modal-body">
        ${alreadyEnrolled ? '<p class="k-enroll-warn">⚠ This member already has a voice enrolled. Recording again will replace it.</p>' : ''}
        <p class="k-enroll-instruction">Ask <strong>${esc(member.name)}</strong> to speak naturally for <strong>30 seconds</strong>.</p>
        <p class="k-hint">They can read aloud, count numbers, or talk about anything. At least 20 seconds of clear speech is needed.</p>
        <div id="k-enroll-status"></div>
        <div id="k-enroll-progress" style="display:none">
          <div class="k-enroll-timer" id="k-enroll-timer">0:00 / 0:30</div>
          <div class="k-enroll-bar-bg"><div class="k-enroll-bar" id="k-enroll-bar"></div></div>
        </div>
      </div>
      <div class="k-modal-footer" id="k-enroll-footer">
        <button class="kbtn kbtn-record" id="k-enroll-start-btn" onclick="Kpsc.startEnrollRecording(${idx})">🔴 Start Recording</button>
        <button class="kbtn kbtn-ghost" onclick="Kpsc.closeEnrollModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function closeEnrollModal() {
  enrollCleanupAudio();
  Enrolling.active  = false;
  Enrolling.samples = [];
  document.getElementById('k-enroll-modal')?.remove();
}

function enrollCleanupAudio() {
  clearInterval(Enrolling.timer);
  Enrolling.timer = null;
  if (Enrolling.workletNode) {
    try { Enrolling.workletNode.disconnect(); } catch (_) {}
    Enrolling.workletNode = null;
  }
  if (Enrolling.audioCtx && Enrolling.audioCtx.state !== 'closed') {
    Enrolling.audioCtx.close().catch(() => {});
    Enrolling.audioCtx = null;
  } else {
    Enrolling.audioCtx = null;
  }
  if (Enrolling.workletUrl) {
    URL.revokeObjectURL(Enrolling.workletUrl);
    Enrolling.workletUrl = null;
  }
  if (Enrolling.stream) {
    Enrolling.stream.getTracks().forEach(t => t.stop());
    Enrolling.stream = null;
  }
}

async function startEnrollRecording(idx) {
  const startBtn   = document.getElementById('k-enroll-start-btn');
  const statusEl   = document.getElementById('k-enroll-status');
  const progressEl = document.getElementById('k-enroll-progress');
  const footerEl   = document.getElementById('k-enroll-footer');

  if (startBtn) { startBtn.disabled = true; startBtn.textContent = '🎙 Recording…'; }
  if (footerEl) {
    // Replace Cancel button to abort the recording and clean up resources.
    const cancelBtn = footerEl.querySelector('.kbtn-ghost');
    if (cancelBtn) {
      cancelBtn.textContent = '✕ Abort';
      cancelBtn.onclick = () => { closeEnrollModal(); };
    }
  }

  try {
    Enrolling.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    Enrolling.memberIdx  = idx;
    Enrolling.samples    = [];
    Enrolling.elapsed    = 0;
    Enrolling.active     = true;

    Enrolling.audioCtx   = new AudioContext();
    Enrolling.sampleRate = Enrolling.audioCtx.sampleRate;

    const blob = new Blob([DG_WORKLET_CODE], { type: 'application/javascript' });
    Enrolling.workletUrl = URL.createObjectURL(blob);
    await Enrolling.audioCtx.audioWorklet.addModule(Enrolling.workletUrl);

    const source = Enrolling.audioCtx.createMediaStreamSource(Enrolling.stream);
    Enrolling.workletNode = new AudioWorkletNode(Enrolling.audioCtx, 'pcm-capture-processor');
    Enrolling.workletNode.port.onmessage = (e) => {
      if (Enrolling.active) Enrolling.samples.push(e.data.slice());
    };
    source.connect(Enrolling.workletNode);
    Enrolling.workletNode.connect(Enrolling.audioCtx.createMediaStreamDestination());

    if (progressEl) progressEl.style.display = '';

    Enrolling.timer = setInterval(() => {
      Enrolling.elapsed++;
      const m      = Math.floor(Enrolling.elapsed / 60);
      const s      = Enrolling.elapsed % 60;
      const timerEl = document.getElementById('k-enroll-timer');
      const barEl   = document.getElementById('k-enroll-bar');
      if (timerEl) timerEl.textContent = `${m}:${String(s).padStart(2, '0')} / 0:30`;
      if (barEl)   barEl.style.width   = `${Math.min(100, (Enrolling.elapsed / AZURE_ENROLL_DURATION_SEC) * 100)}%`;
      if (Enrolling.elapsed >= AZURE_ENROLL_DURATION_SEC) {
        clearInterval(Enrolling.timer);
        Enrolling.timer = null;
        finishEnrollRecording();
      }
    }, 1000);

  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<div class="k-enroll-error">❌ Microphone access error: ${esc(e.message)}</div>`;
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '🔴 Start Recording'; }
    enrollCleanupAudio();
  }
}

async function finishEnrollRecording() {
  const statusEl = document.getElementById('k-enroll-status');
  const footerEl = document.getElementById('k-enroll-footer');

  Enrolling.active = false;
  enrollCleanupAudio();

  if (statusEl) statusEl.innerHTML = '<div class="k-enroll-info">⏳ Processing voice data — please wait…</div>';
  if (footerEl) footerEl.innerHTML = '';

  try {
    const idx    = Enrolling.memberIdx;
    const member = S.members[idx];
    if (!member) throw new Error('Member not found.');

    if (!Enrolling.samples.length) throw new Error('No audio was captured.');

    // Merge all captured PCM chunks into one Float32Array.
    const totalLen = Enrolling.samples.reduce((a, c) => a + c.length, 0);
    const merged   = new Float32Array(totalLen);
    let pos = 0;
    for (const chunk of Enrolling.samples) { merged.set(chunk, pos); pos += chunk.length; }
    Enrolling.samples = []; // free memory

    // Resample to 16 kHz and encode as WAV.
    const resampled   = resampleTo16k(merged, Enrolling.sampleRate);
    const wavBuffer   = pcmToWav(resampled, 16000);
    const audioBase64 = arrayBufferToBase64(wavBuffer);

    // Delete the old Azure profile if one exists (best-effort; a failure won't block re-enrolment).
    if (member.azureSpeakerProfileId) {
      await fetch(`${API}/azure-speaker-profiles/${encodeURIComponent(member.azureSpeakerProfileId)}`,
        { method: 'DELETE' }).catch(e => console.warn('Could not delete old Azure profile:', e));
    }

    // Create a new Azure speaker profile.
    const createRes = await apiPost('azure-speaker-profiles', {});
    if (createRes.error) throw new Error(createRes.error);
    const profileId = createRes.profileId;
    if (!profileId) throw new Error('Azure did not return a profile ID.');

    // Enroll the recorded audio.
    const enrollRes = await apiPost(`azure-speaker-profiles/${profileId}/enroll`, { audioBase64 });
    if (enrollRes.error) throw new Error(enrollRes.error);

    // Persist the profile ID on the member (azureSpeakerProfileId survives saveMembers).
    S.members[idx].azureSpeakerProfileId = profileId;
    await apiPost('settings', { kpsc_members: S.members });

    if (statusEl) statusEl.innerHTML =
      `<div class="k-enroll-ok">✅ Voice enrolled for <strong>${esc(member.name)}</strong>! Future meetings will auto-identify this speaker.</div>`;
    if (footerEl) footerEl.innerHTML =
      `<button class="kbtn kbtn-primary" onclick="Kpsc.closeEnrollModal()">Done</button>`;

    // Refresh the member list so the ✓ badge appears.
    const list = document.getElementById('km-members-list');
    if (list) list.innerHTML = renderMembersList();

  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<div class="k-enroll-error">❌ Enrollment failed: ${esc(e.message)}</div>`;
    if (footerEl) footerEl.innerHTML = `<button class="kbtn kbtn-ghost" onclick="Kpsc.closeEnrollModal()">Close</button>`;
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
              ${canManage ? `<button class="kbtn kbtn-sm kbtn-danger" style="flex-shrink:0;align-self:flex-start" onclick="Kpsc.deleteFinanceEntry('${e.id}')">🗑</button>` : ''}
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
  if (!confirm('Delete this finance entry?')) return;
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
                </div>
                <button class="kbtn kbtn-sm" onclick="Kpsc.copyReminderMessage('${esc(p.id)}')">📋 Copy</button>
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

function copyReminderMessage(partnerId) {
  const partner = S.partners.find(p => p.id === partnerId);
  if (!partner) return;
  const template = document.getElementById('krem-message')?.value.trim() || 'Dear {{name}}, this is a reminder for your {{month}} partnership pledge.';
  const message = template
    .replace(/\{\{name\}\}/g, partner.fullName)
    .replace(/\{\{month\}\}/g, monthName(currentMonth()));
  navigator.clipboard.writeText(message).then(() => {
    showToast(`Reminder copied for ${partner.fullName}`, 'success');
  }).catch(() => {
    showToast('Could not copy. Please copy manually.', 'warn');
  });
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
  const responses = await Promise.all(unpaidPartners.map(partner => apiPost('kpsc-reminders', {
    partnerId: partner.id,
    year,
    month,
    channel: partner.reminderPreference || 'sms',
    sentBy: S.user?.name || '',
    message: template.replace(/\{\{name\}\}/g, partner.fullName).replace(/\{\{month\}\}/g, monthName(month)),
  })));
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

let _insightsSearchTimer = null;

function setReportsYear(year) {
  S.reportsYear = Number(year) || currentYear();
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
  const azure = apiStatus?.speakerRecognition || {};
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
          <span class="k-api-label">Voice recognition</span>
          <span>${apiStatusPill(azure)} <code>${esc(azure.keyName || 'AZURE_SPEAKER_KEY')}</code> <small>Region: ${esc(azure.region || 'eastus')}</small></span>
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
                ${String(S.user?.role || '') === 'acting_chairman' ? `<button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.confirmDeleteKpscAccount('${a.id}','${esc(a.name)}')">Delete</button>` : ''}
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
          ${['acting_chairman','general_secretary','financial_secretary','treasurer','committee_viewer'].map(role => `<option value="${role}" ${existing?.role === role ? 'selected' : ''}>${esc(roleLabel(role))}</option>`).join('')}
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
  const deepseekKey = res?.ai_deepseek_key || '';
  const openaiKey   = res?.ai_openai_key   || '';
  const policyUrl   = res?.kpsc_policy_url  || '';
  const policyNotes = res?.kpsc_policy_notes || '';
  const hasDeepseek = !!deepseekKey;
  const hasOpenai   = !!openaiKey;
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
      <div class="k-card">
        <h2 class="k-card-title">AI Provider Keys</h2>
        <p class="k-card-sub">
          API keys are stored securely in the church database and are only used for processing
          meeting minutes. Without a key the portal uses a built-in rule-based engine.
        </p>
        <div class="k-settings-status ${hasDeepseek || hasOpenai ? 'k-status-ai' : 'k-status-rule'}">
          ${hasDeepseek || hasOpenai ? '🤖 AI-powered mode active' : '⚙️ Rule-based mode (no API key set)'}
        </div>

        <div class="k-form-group">
          <label class="k-label">DeepSeek API Key</label>
          <input type="password" id="ks-deepseek-key" class="k-input"
            placeholder="${hasDeepseek ? '••••••••••••••••' : 'sk-...'}"
            autocomplete="off" value="${esc(deepseekKey)}" />
          <p class="k-hint">Used to generate meeting minutes with AI. Get a key at <a href="https://platform.deepseek.com" target="_blank" rel="noopener">platform.deepseek.com</a></p>
        </div>

        <div class="k-form-group">
          <label class="k-label">DeepSeek Model</label>
          <select id="ks-deepseek-model" class="k-input">
            <option value="deepseek-v4-flash" ${(res?.ai_deepseek_model||'deepseek-v4-flash')==='deepseek-v4-flash'?'selected':''}>deepseek-v4-flash — V4 Flash (Fast, Recommended)</option>
            <option value="deepseek-v4-pro" ${(res?.ai_deepseek_model||'')==='deepseek-v4-pro'?'selected':''}>deepseek-v4-pro — V4 Pro (Deep reasoning, 1M context)</option>
            <option value="deepseek-chat" ${(res?.ai_deepseek_model||'')==='deepseek-chat'?'selected':''}>deepseek-chat — V3 (Deprecated · removed 2026-07-24)</option>
            <option value="deepseek-reasoner" ${(res?.ai_deepseek_model||'')==='deepseek-reasoner'?'selected':''}>deepseek-reasoner — R1 (Deprecated · removed 2026-07-24)</option>
          </select>
          <p class="k-hint"><strong>deepseek-v4-flash</strong> is recommended for meeting minutes (fast, cheap, 1M context). Use <strong>deepseek-v4-pro</strong> for complex analysis. Legacy V3/R1 models will be removed by DeepSeek on 2026-07-24 — please migrate.</p>
        </div>

        <div class="k-form-group">
          <label class="k-label">OpenAI API Key</label>
          <input type="password" id="ks-openai-key" class="k-input"
            placeholder="${hasOpenai ? '••••••••••••••••' : 'sk-...'}"
            autocomplete="off" value="${esc(openaiKey)}" />
          <p class="k-hint">Optional alternative AI provider for meeting minutes. Get a key at <a href="https://platform.openai.com" target="_blank" rel="noopener">platform.openai.com</a></p>
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
        <button class="kbtn kbtn-primary" id="ks-save-btn" onclick="Kpsc.saveSettings()">Save Settings</button>
        ${hasDeepseek || hasOpenai ? `<button class="kbtn kbtn-danger-outline" style="margin-left:8px" onclick="Kpsc.clearAiKeys()">Clear Keys</button>` : ''}
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
          <span class="k-env-desc">Powers live interim transcription (OpenAI gpt-4o-transcribe via WebRTC). Get a key at <a href="https://platform.openai.com" target="_blank" rel="noopener">platform.openai.com</a>.</span>
        </div>
        <div class="k-env-row">
          <code class="k-env-key">DEEPGRAM_API_KEY</code>
          <span class="k-env-desc">Powers speaker diarization — identifies who is speaking and labels each transcript turn. Get a key at <a href="https://console.deepgram.com" target="_blank" rel="noopener">console.deepgram.com</a>.</span>
        </div>
        <div class="k-env-row">
          <code class="k-env-key">AZURE_SPEAKER_KEY</code>
          <span class="k-env-desc">Azure Cognitive Services key for persistent voice fingerprinting. Enables one-time voice enrolment per member and automatic speaker identification across meetings. Get a key at <a href="https://portal.azure.com" target="_blank" rel="noopener">portal.azure.com</a> (Speech service → Keys and Endpoint).</span>
        </div>
        <div class="k-env-row">
          <code class="k-env-key">AZURE_SPEAKER_REGION</code>
          <span class="k-env-desc">Azure region for the Speech service (e.g. <code>eastus</code>, <code>westeurope</code>). Defaults to <code>eastus</code> if not set.</span>
        </div>
        <p class="k-hint" style="margin-top:12px">
          Set these in the Cloudflare Pages dashboard → Settings → Environment Variables.
          If either key is absent, that feature degrades gracefully: transcription falls back to
          OpenAI-only (without speaker labels) when Deepgram is absent, and to chunk-based
          upload only when both are absent. Voice fingerprinting is silently skipped when
          AZURE_SPEAKER_KEY is absent.
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

async function saveSettings() {
  const btn = document.getElementById('ks-save-btn');
  const msg = document.getElementById('ks-save-msg');
  const deepseekKey = document.getElementById('ks-deepseek-key')?.value.trim() || '';
  const openaiKey   = document.getElementById('ks-openai-key')?.value.trim()   || '';
  const policyUrl   = document.getElementById('ks-policy-url')?.value.trim()   || '';
  const policyNotes = document.getElementById('ks-policy-notes')?.value.trim() || '';
  const deepseekModel = document.getElementById('ks-deepseek-model')?.value || 'deepseek-v4-flash';

  btn.disabled = true;
  btn.textContent = 'Saving…';
  msg.style.display = 'none';

  const res = await apiPost('settings', {
    ai_deepseek_key: deepseekKey,
    ai_openai_key: openaiKey,
    ai_deepseek_model: deepseekModel,
    kpsc_policy_url: policyUrl,
    kpsc_policy_notes: policyNotes,
  });

  if (res?.error) {
    msg.className = 'k-settings-msg k-msg-error';
    msg.textContent = res.error;
  } else {
    msg.className = 'k-settings-msg k-msg-ok';
    msg.textContent = 'Settings saved.';
    await renderSettings(document.getElementById('kpsc-main'));
    return;
  }

  msg.style.display = 'block';
  btn.disabled = false;
  btn.textContent = 'Save Keys';
}

async function clearAiKeys() {
  if (!confirm('Remove all AI API keys? The portal will fall back to rule-based processing.')) return;
  await apiPost('settings', { ai_deepseek_key: '', ai_openai_key: '' });
  await renderSettings(document.getElementById('kpsc-main'));
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

// ── PROJECTS ─────────────────────────────────────────────────────

function canManageProjects() {
  const role = String(S.user?.role || '').toLowerCase();
  return ['acting_chairman','general_secretary','financial_secretary','treasurer'].includes(role);
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
  const recPanel = document.getElementById('km-rec-panel');
  const uploadPanel = document.getElementById('km-upload-panel');
  if (recPanel) recPanel.style.display = tab === 'upload' ? 'none' : '';
  if (uploadPanel) uploadPanel.style.display = tab !== 'upload' ? 'none' : '';
  document.querySelectorAll('.k-tab').forEach(b => {
    const onclick = b.getAttribute('onclick') || '';
    b.classList.toggle('active', onclick.includes(`'${tab}'`));
  });
}

async function previewNotesPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  const preview = document.getElementById('km-notes-preview');
  if (!preview) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    preview.innerHTML = `
      <img src="${dataUrl}" style="max-width:100%;border-radius:10px;border:1px solid var(--border);margin-bottom:12px" alt="Notes preview" />
      <div class="k-room-actions">
        <button class="kbtn kbtn-primary" onclick="Kpsc.ocrNotesPhoto()">🤖 Extract Text with AI</button>
      </div>
      <div id="km-ocr-status"></div>`;
  };
  reader.readAsDataURL(file);
}

async function ocrNotesPhoto() {
  const input = document.getElementById('km-notes-photo');
  const file = input?.files?.[0];
  if (!file) return;
  const status = document.getElementById('km-ocr-status');
  if (status) status.innerHTML = '<div class="k-loading" style="padding:16px">🤖 Analysing handwriting…</div>';

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const mimeType = file.type || 'image/jpeg';
    const res = await apiPost('kpsc-ocr-notes', { imageBase64: base64, mimeType });

    if (res?.error) {
      if (status) status.innerHTML = `<div class="k-error-box">${esc(res.error)}</div>`;
      return;
    }

    if (!res.transcript) {
      if (status) status.innerHTML = `<div class="k-error-box">${esc(res.error || 'No text could be extracted. Please ensure the image is clear.')}</div>`;
      return;
    }

    const transcriptEl = document.getElementById('km-transcript');
    if (transcriptEl) {
      transcriptEl.value = (transcriptEl.value ? transcriptEl.value + '\n\n' : '') + res.transcript;
      showToast('Handwritten notes transcribed! Review and adjust before processing.', 'success');
    }

    if (status) status.innerHTML = `<div style="background:#d1fae5;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:8px">✓ Text extracted successfully. See the transcript section above.</div>`;

    setMeetingTab('record');
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
    <strong>RCCG Kingdom Parish — Kingdom Parish Stewardship Committee</strong><br>
    Generated: ${new Date().toLocaleDateString('en-NG', { day:'numeric', month:'long', year:'numeric' })}
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
  deleteMeetingDraft,
  endMeeting,
  processMeeting,
  saveMinutesReview,
  openReviewEditor,
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
  debouncedSaveReminderTemplate,
  setReportsYear,
  setReportsMonth,
  setReportsFilter,
  setReportsSearch,
  updateReportActionStatus,
  saveKpscOpsSettings,
  partnerTypeLabel,
  filterArchive,
  setArchiveQuickFilter,
  openAccountEditor,
  closeAccountEditor,
  saveAccountEditor,
  confirmDeleteKpscAccount,
  executeDeleteKpscAccount,
  saveSettings,
  clearAiKeys,
  refreshApiStatus,
  updateAttGroup,
  recStart,
  recPause,
  recResume,
  recStop,
  recReset,
  assignSpeaker,
  enrollMemberVoice,
  showEnrollModal,
  closeEnrollModal,
  startEnrollRecording,
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
  // Finance - PDF reconciliation
  setReconciliationTab,
  runPdfReconciliation,
  // Minutes PDF
  printMinutes,
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
