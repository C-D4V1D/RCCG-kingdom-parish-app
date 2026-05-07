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
Scaffold in progress.
