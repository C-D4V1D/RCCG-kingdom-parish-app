# KPSC AI Secretary (PWA)

This folder will contain the **KPSC AI Secretary** Progressive Web App.

## Goal (Phase 1)
- Mobile-first PWA you can install on your phone
- Start/Stop meeting
- Live transcript (streaming)
- Generate:
  - Summary
  - Minutes
  - Resolutions
  - Action items

## Goal (Phase 2)
- Upload/Link policy documents (e.g. KPSC bylaws)
- Policy-aware meeting processing
- Search past meetings by topic/resolution

## Architecture (planned)
- Frontend: Next.js (PWA)
- Backend: Cloudflare Worker (WebSocket for audio + REST for processing)
- Storage: Cloudflare R2 (audio, exports)
- DB: Supabase (meetings, transcripts, resolutions, actions, policies)
- AI:
  - Realtime transcription: OpenAI speech-to-text (realtime)
  - Post-processing: DeepSeek (summaries/minutes)

## Status
Integrated Phase 1 draft is now available inside the main finance portal under **KPSC → AI Secretary**.

Current capabilities:
- Create and save KPSC meeting drafts
- Track Men/Women/Youth/Ministers attendance for quorum review
- Paste or type live transcript notes
- End meetings and generate draft summaries, minutes, resolutions, action items, and governance flags
- Archive recent AI Secretary meetings through Cloudflare D1-backed API routes

The current processor uses a deterministic governance-first strategy so it works without AI provider credentials, while still allowing provider-backed post-processing when a key is configured. Provider output is treated as draft content only: the backend sanitizes the response, falls back to deterministic extraction when fields are missing or malformed, and always re-applies mandatory policy checks for quorum, missing transcript notes, unfinished meetings, major-project thresholds, welfare/privacy language, and transcript prompt-injection attempts. This prevents an LLM from suppressing governance flags even if the transcript or model response says everything is approved.

## Live audio + realtime transcription

The integrated KPSC meeting room now supports live meeting capture:

- **Start Meeting / Pause / Resume / Stop** controls in the meeting room.
- Continuous microphone streaming to OpenAI gpt-4o-transcribe through a browser WebRTC session.
- Timestamped transcript entries with auto-scroll, plus automatic appending into the saved transcript notes.
- MediaRecorder chunking every 5 seconds so the browser never builds a full in-memory recording.
- Chunk uploads to `/api/ai-secretary-meetings/audio-chunk`; bind an R2 bucket as `KPSC_AUDIO_BUCKET` (or `AUDIO_BUCKET`) to persist chunks.
- Reconnect and retry behavior for realtime transcription and chunk uploads.

Required production secret:

- `OPENAI_API_KEY` — used only by the Cloudflare Pages Function to mint short-lived Realtime client secrets.

## Dummy setup guide: Picovoice Eagle (voice fingerprinting)

1. **Get your AccessKey**
   - Create/sign in to Picovoice Console: `https://console.picovoice.ai`
   - Copy your Eagle AccessKey.

2. **Add the Eagle model file**
   - Download `eagle_params.pv` from the Picovoice Eagle package/release.
   - Place it in your app public path as:
     - `/models/eagle_params.pv`
   - Use a same-site absolute path (default used by this project is `/models/eagle_params.pv`).

3. **Configure KPSC settings UI**
   - Open **KPSC Portal → Settings**.
   - Set:
     - **Picovoice Eagle AccessKey**
     - **Picovoice Eagle Model Path** (e.g. `/models/eagle_params.pv`)
   - Save settings.

4. **Enroll members**
   - Go to **Members**.
   - Click the 🎙 button beside a member.
   - Record ~30 seconds of clear speech.

5. **Test auto-identification**
   - Start a meeting and record conversation with attendance marked.
   - Confirm speaker tags start auto-mapping to enrolled members.

### Quick troubleshooting

- **“AccessKey is missing”** → Fill Picovoice Eagle AccessKey in KPSC Settings and save.
- **Model load fails** → Verify model path is public and correct.
- **No auto-match** → Re-enroll with clearer voice sample and reduce noise.
