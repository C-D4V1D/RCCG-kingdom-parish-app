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

The current processor is deterministic and rule-based so it works without AI provider credentials. It is ready to be swapped to provider-backed transcription and LLM post-processing in a later phase.
