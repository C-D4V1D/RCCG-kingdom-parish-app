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

// ── STATE ──────────────────────────────────────────────────────────
const S = {
  user: null,
  page: 'dashboard',
  meetings: [],
  activeMeeting: null,
  members: [],
  archiveSearch: '',
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
    el.innerHTML = `
      <div class="rec-card">
        <div class="rec-main">
          <button class="kbtn kbtn-record" onclick="Kpsc.recStart(this)">🎙 Start Meeting</button>
          <span class="rec-hint">${uploadMeta}</span>
        </div>
      </div>`;
  } else if (Rec.status === 'recording') {
    el.innerHTML = `
      <div class="rec-card rec-card-live">
        <div class="rec-main">
          <span class="rec-dot rec-dot-live"></span>
          <span class="rec-timer" id="kpsc-rec-timer">${recFmt()}</span>
          <button class="kbtn kbtn-sm" onclick="Kpsc.recPause()">⏸ Pause</button>
          <button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.recStop()">⏹ Stop</button>
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
          <button class="kbtn kbtn-sm kbtn-danger" onclick="Kpsc.recStop()">⏹ Stop</button>
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
        <div class="rec-meta">Recording ended. Full audio was never kept in browser memory; only short chunks were uploaded.</div>
      </div>`;
  }
  const transcriptPanel = document.getElementById('kpsc-live-transcript');
  if (transcriptPanel) transcriptPanel.toggleAttribute('data-recording', liveDisabled === '');
}

// Return the display name for a Deepgram speaker index.
// Uses the speakerMap if a member has been assigned, otherwise falls back to "Speaker N".
function speakerDisplayName(idx) {
  if (idx == null) return '';
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
    const hasSpeaker = entry.speaker != null;
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
  if (speaker != null && !Rec.seenSpeakers.has(speaker)) {
    Rec.seenSpeakers.add(speaker);
    recRenderSpeakerMap();
  }
  const entry = { itemId, timestamp: recTimestamp(), text: clean, speaker: speaker ?? null };
  Rec.transcriptEntries.push(entry);
  const textarea = document.getElementById('km-transcript');
  if (textarea) {
    const speakerTag = speaker != null ? ` [${speakerDisplayName(speaker)}]` : '';
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
    const speakerTag = entry.speaker != null ? ` [${speakerDisplayName(entry.speaker)}]` : '';
    return `[${entry.timestamp}]${speakerTag} ${entry.text}`;
  });
  textarea.value = lines.join('\n');
  textarea.scrollTop = textarea.scrollHeight;
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


async function recStart(btn) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast('This browser does not support live audio recording.', 'error');
    return;
  }
  try {
    if (btn) btn.disabled = true;
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
      Diarizer.status = 'error';
      recRenderUI();
      showToast(e.message || 'Speaker diarization is offline; transcription may still be running.', 'warn');
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

  const tokenRes = await apiPost('deepgram-transcription-token', {});
  if (tokenRes.error) throw new Error(tokenRes.error);
  const apiKey = tokenRes.key;
  if (!apiKey) throw new Error('Deepgram API key was not returned by the server.');

  // Build AudioContext and AudioWorklet pipeline for raw PCM streaming.
  const audioCtx = new AudioContext();
  Diarizer.audioCtx = audioCtx;

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
    token: apiKey,
    model: 'nova-3',
    diarize: 'true',
    punctuate: 'true',
    interim_results: 'true',
    smart_format: 'true',
    encoding: 'linear16',
    sample_rate: String(Math.round(sampleRate)),
    channels: '1',
    language: 'en',
  });
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${dgParams}`);
  Diarizer.ws = ws;
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    Diarizer.status = 'connected';
    Diarizer.reconnectAttempts = 0;
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
    if (!Diarizer.manualStop && Rec.status === 'recording') {
      diarizerScheduleReconnect();
    } else {
      Diarizer.status = 'offline';
      recRenderUI();
    }
  };

  ws.onerror = () => {
    if (!Diarizer.manualStop && Rec.status === 'recording') {
      diarizerScheduleReconnect();
    }
  };
}

function diarizerHandleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

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
      const hasSpeakers = words.length > 0 && words[0].speaker != null;
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
    recRenderUI();
    showToast('Speaker diarization disconnected. Transcription may still be active.', 'warn');
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
  const minOffset = Diarizer.pcmSampleOffset - (60 * (Diarizer.pcmSampleRate || DEFAULT_PCM_SAMPLE_RATE));
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


async function apiGet(path) {
  const r = await fetch(`${API}/${path}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function apiPut(path, body) {
  const r = await fetch(`${API}/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
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

function today() {
  return new Date().toISOString().slice(0, 10);
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
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary  = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    // Spread each chunk into String.fromCharCode to avoid exceeding call-stack limits.
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}


async function login(btn) {
  const name = document.getElementById('kpsc-name-input')?.value.trim() || '';
  const pin  = document.getElementById('kpsc-pin-input')?.value.trim() || '';
  const errEl = document.getElementById('kpsc-login-error');

  if (!name || !pin) {
    errEl.textContent = 'Please enter your name and PIN.';
    errEl.style.display = 'block';
    return;
  }
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  errEl.style.display = 'none';

  try {
    const res = await apiPost('kpsc-login', { name, pin });
    if (res.error) {
      errEl.textContent = res.error === 'Invalid credentials'
        ? 'Name or PIN is incorrect. Please try again.'
        : res.error;
      errEl.style.display = 'block';
    } else {
      S.user = res;
      saveSession(res);
      enterApp();
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
  clearSession();
  S.user = null;
  S.page = 'dashboard';
  S.activeMeeting = null;
  document.getElementById('kpsc-app').style.display = 'none';
  document.getElementById('kpsc-login-screen').style.display = '';
  document.getElementById('kpsc-name-input').value = '';
  document.getElementById('kpsc-pin-input').value = '';
}

function enterApp() {
  document.getElementById('kpsc-login-screen').style.display = 'none';
  document.getElementById('kpsc-app').style.display = '';
  document.getElementById('kpsc-user-name').textContent = S.user.name;
  navigate('dashboard');
}

// ── NAVIGATION ────────────────────────────────────────────────────
function navigate(page) {
  recStop();
  Rec.status = 'idle';
  S.page = page;
  S.activeMeeting = null;
  document.querySelectorAll('.ka-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  document.getElementById('kpsc-back-btn').style.display = 'none';
  const titles = { dashboard: 'Dashboard', members: 'KPSC Members', archive: 'Meeting Archive', settings: 'Settings' };
  document.getElementById('kpsc-page-title').textContent = titles[page] || 'KPSC';
  renderPage(page);
}

async function renderPage(page) {
  const main = document.getElementById('kpsc-main');
  main.innerHTML = '<div class="k-loading">Loading…</div>';
  try {
    if (page === 'dashboard') await renderDashboard(main);
    else if (page === 'meeting') await renderMeetingRoom(main);
    else if (page === 'members') await renderMembers(main);
    else if (page === 'archive') await renderArchive(main);
    else if (page === 'settings') await renderSettings(main);
  } catch (e) {
    main.innerHTML = `<div class="k-page"><div class="k-error-box">
      <strong>Could not load page</strong><br>${esc(e.message || String(e))}
      <br><br>If this is the first time using the portal, ask the IT Administrator to run the database setup (Admin → Setup in the Finance Portal).
    </div></div>`;
  }
}

function goBack() {
  navigate(S.page === 'meeting' ? 'dashboard' : 'dashboard');
}

// ── DASHBOARD ─────────────────────────────────────────────────────
async function renderDashboard(main) {
  const [meetingsRes, settingsRes] = await Promise.all([
    apiGet('ai-secretary-meetings'),
    apiGet('settings'),
  ]);
  if (meetingsRes?.error) throw new Error(meetingsRes.error);
  S.meetings = Array.isArray(meetingsRes) ? meetingsRes : [];
  S.members  = Array.isArray(settingsRes?.kpsc_members) ? settingsRes.kpsc_members : [];

  const recent  = [...S.meetings].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 10);
  const total   = S.meetings.length;
  const thisMonth = today().slice(0, 7);
  const monthCount = S.meetings.filter(m => (m.meetingDate || '').startsWith(thisMonth)).length;
  const pending = S.meetings.filter(m => m.status === 'ended').length;

  main.innerHTML = `
    <div class="k-page">
      <div class="k-dash-stats">
        <div class="k-stat"><div class="k-stat-val">${total}</div><div class="k-stat-lbl">Total Meetings</div></div>
        <div class="k-stat"><div class="k-stat-val">${monthCount}</div><div class="k-stat-lbl">This Month</div></div>
        <div class="k-stat k-stat-highlight"><div class="k-stat-val">${pending}</div><div class="k-stat-lbl">Awaiting Minutes</div></div>
      </div>

      <div class="k-section-hdr">
        <h2>Recent Meetings</h2>
        <button class="kbtn kbtn-primary" onclick="Kpsc.startNewMeeting()">+ New Meeting</button>
      </div>

      ${recent.length === 0
        ? `<div class="k-empty">No meetings yet. Start your first meeting above.</div>`
        : `<div class="k-meeting-list">${recent.map(m => meetingCard(m)).join('')}</div>`}
    </div>`;
}

function meetingCard(m) {
  return `
    <div class="k-meeting-card" onclick="Kpsc.openMeeting('${m.id}')">
      <div class="k-mc-top">
        <div class="k-mc-title">${esc(m.title)}</div>
        <div class="k-mc-badges">${typeBadge(m.meetingType)} ${statusBadge(m.status)}</div>
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
  S.page = 'meeting';
  Rec.status = 'idle';
  document.querySelectorAll('.ka-nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('kpsc-back-btn').style.display = '';
  document.getElementById('kpsc-page-title').textContent = 'New Meeting';
  renderPage('meeting');
}

async function openMeeting(id) {
  const res = await apiGet(`ai-secretary-meetings/${id}`);
  if (res.error) { showToast(res.error, 'error'); return; }
  S.activeMeeting = res;
  S.page = 'meeting';
  Rec.status = 'idle';
  document.querySelectorAll('.ka-nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('kpsc-back-btn').style.display = '';
  document.getElementById('kpsc-page-title').textContent = 'Meeting Room';
  renderPage('meeting');
}

// ── MEETING ROOM ──────────────────────────────────────────────────
async function renderMeetingRoom(main) {
  if (!S.members.length) {
    const settingsRes = await apiGet('settings');
    S.members = settingsRes.kpsc_members || [];
  }

  const m  = S.activeMeeting;
  const id = m?.id || '';
  const status = m?.status || 'draft';
  const isProcessed = status === 'processed';
  const isEnded     = status === 'ended' || isProcessed;
  const canRecord   = !isEnded;

  // Build attendance rows from roster, merged with saved participants
  const savedParts = m?.participants || [];
  const attendanceRows = buildAttendanceRows(savedParts);

  main.innerHTML = `
    <div class="k-page k-room">
      <div id="km-stepper">${stepper(status)}</div>

      <section class="k-section">
        <h3 class="k-sec-title">Meeting Details</h3>
        <input type="hidden" id="km-status" value="${status}" />
        <div class="k-field-row">
          <div class="k-field">
            <label class="k-label">Title</label>
            <input class="k-input" id="km-title" type="text" value="${esc(m?.title || 'KPSC Meeting')}" ${isProcessed ? 'readonly' : ''} />
          </div>
          <div class="k-field k-field-sm">
            <label class="k-label">Date</label>
            <input class="k-input" id="km-date" type="date" value="${m?.meetingDate || today()}" ${isProcessed ? 'readonly' : ''} />
          </div>
        </div>
        <div class="k-field">
          <label class="k-label">Meeting Type</label>
          <select class="k-input" id="km-type" ${isProcessed ? 'disabled' : ''}>
            ${MEETING_TYPES.map(t => `<option value="${t.value}" ${(m?.meetingType || 'routine') === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
      </section>

      <section class="k-section">
        <h3 class="k-sec-title">Attendance</h3>
        <div id="km-attendance" class="k-attendance">
          ${attendanceRows}
        </div>
      </section>

      <section class="k-section">
        <h3 class="k-sec-title">Live Audio & Realtime Transcript</h3>
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
      </section>

      <div class="k-room-actions">
        ${!isProcessed ? `<button class="kbtn" onclick="Kpsc.saveMeeting(this)">💾 Save</button>` : ''}
        ${status === 'recording' ? `<button class="kbtn kbtn-amber" onclick="Kpsc.endMeeting(this)">🔒 End Meeting</button>` : ''}
        ${status === 'ended' ? `<button class="kbtn kbtn-primary" onclick="Kpsc.processMeeting(this)">✨ Generate Minutes</button>` : ''}
        ${isProcessed ? `<div class="k-processed-note">✅ Minutes have been generated and finalised.</div>` : ''}
      </div>

      ${isProcessed && m ? renderMinutesPanel(m) : ''}
    </div>`;

  if (canRecord) recRenderUI();
  recRenderTranscript();
}

function buildAttendanceRows(savedParts) {
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
          const isPresent = saved ? !!saved.present : false;
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

function renderMinutesPanel(m) {
  if (!m?.minutesMarkdown) return '';
  const resolutions = m.resolutions || [];
  const actionItems = m.actionItems || [];
  const policyFlags = m.policyFlags || [];

  return `
    <section class="k-section k-minutes-section">
      <h3 class="k-sec-title">Meeting Minutes</h3>
      ${m.summaryShort ? `<div class="k-summary">${esc(m.summaryShort)}</div>` : ''}
      <div class="k-minutes-body">${minutesHtml(m.minutesMarkdown)}</div>

      ${resolutions.length ? `
        <h4 class="k-sub-title">Resolutions (${resolutions.length})</h4>
        <div class="k-res-list">${resolutions.map(r => `
          <div class="k-res-item">
            <span class="kbadge ${r.approved ? 'badge-green' : 'badge-amber'}">${r.approved ? 'Approved' : 'Deferred'}</span>
            ${esc(r.text)}
          </div>`).join('')}
        </div>` : ''}

      ${actionItems.length ? `
        <h4 class="k-sub-title">Action Items (${actionItems.length})</h4>
        <div class="k-action-list">${actionItems.map(a => `
          <div class="k-action-item">
            <div class="k-action-task">${esc(a.task)}</div>
            <div class="k-action-meta">
              ${a.assignee ? `<span>👤 ${esc(a.assignee)}</span>` : ''}
              ${a.dueDate  ? `<span>📅 ${fmtDate(a.dueDate)}</span>` : ''}
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

// ── MEETING ACTIONS ───────────────────────────────────────────────
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

    // Delete the old Azure profile if one exists (best-effort).
    if (member.azureSpeakerProfileId) {
      await fetch(`${API}/azure-speaker-profiles/${encodeURIComponent(member.azureSpeakerProfileId)}`,
        { method: 'DELETE' }).catch(() => {});
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


async function renderArchive(main) {
  const res = await apiGet('ai-secretary-meetings');
  S.meetings = res.meetings || res || [];
  main.innerHTML = `
    <div class="k-page">
      <div class="k-search-bar">
        <input class="k-input" type="search" id="k-archive-search" placeholder="Search by title or date…"
          value="${esc(S.archiveSearch)}" oninput="Kpsc.filterArchive(this.value)" />
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
  const filtered = lq
    ? meetings.filter(m =>
        (m.title || '').toLowerCase().includes(lq) ||
        (m.meetingDate || '').includes(lq))
    : meetings;
  const sorted = [...filtered].sort((a, b) => (b.meetingDate || '').localeCompare(a.meetingDate || ''));
  if (sorted.length === 0) return `<div class="k-empty">No meetings found.</div>`;
  return `<div class="k-meeting-list">${sorted.map(m => meetingCard(m)).join('')}</div>`;
}

// ── SETTINGS ──────────────────────────────────────────────────────
async function renderSettings(main) {
  const res = await apiGet('settings');
  const deepseekKey = res?.ai_deepseek_key || '';
  const openaiKey   = res?.ai_openai_key   || '';
  const hasDeepseek = !!deepseekKey;
  const hasOpenai   = !!openaiKey;

  main.innerHTML = `
    <div class="k-page">
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
          <label class="k-label">OpenAI API Key</label>
          <input type="password" id="ks-openai-key" class="k-input"
            placeholder="${hasOpenai ? '••••••••••••••••' : 'sk-...'}"
            autocomplete="off" value="${esc(openaiKey)}" />
          <p class="k-hint">Optional alternative AI provider for meeting minutes. Get a key at <a href="https://platform.openai.com" target="_blank" rel="noopener">platform.openai.com</a></p>
        </div>

        <div id="ks-save-msg" class="k-settings-msg" style="display:none"></div>
        <button class="kbtn kbtn-primary" id="ks-save-btn" onclick="Kpsc.saveSettings()">Save Keys</button>
        ${hasDeepseek || hasOpenai ? `<button class="kbtn kbtn-danger-outline" style="margin-left:8px" onclick="Kpsc.clearAiKeys()">Clear Keys</button>` : ''}
      </div>

      <div class="k-card" style="margin-top:16px">
        <h2 class="k-card-title">Live Transcription &amp; Diarization</h2>
        <p class="k-card-sub">
          Real-time transcription and speaker diarization require API keys configured as
          <strong>Cloudflare Pages environment variables</strong> by the IT Administrator —
          they are not stored in this settings page.
        </p>
        <div class="k-env-row">
          <code class="k-env-key">OPENAI_API_KEY</code>
          <span class="k-env-desc">Powers live interim transcription (OpenAI Realtime Whisper via WebRTC). Get a key at <a href="https://platform.openai.com" target="_blank" rel="noopener">platform.openai.com</a>.</span>
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

  btn.disabled = true;
  btn.textContent = 'Saving…';
  msg.style.display = 'none';

  const res = await apiPost('settings', { ai_deepseek_key: deepseekKey, ai_openai_key: openaiKey });

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

// ── BOOT ──────────────────────────────────────────────────────────
function init() {
  const session = loadSession();
  if (session?.id) {
    S.user = session;
    enterApp();
  }
}

// ── PUBLIC API ────────────────────────────────────────────────────
window.Kpsc = {
  login,
  logout,
  navigate,
  goBack,
  startNewMeeting,
  openMeeting,
  saveMeeting,
  endMeeting,
  processMeeting,
  addMember,
  removeMember,
  memberFieldChange,
  saveMembers,
  filterArchive,
  saveSettings,
  clearAiKeys,
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
};

document.addEventListener('DOMContentLoaded', init);
