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
