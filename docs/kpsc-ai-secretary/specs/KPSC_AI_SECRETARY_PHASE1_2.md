# KPSC AI Secretary — Phase 1 & 2 Specification

> **Purpose:** A mobile-first PWA that acts as the *Secretary* for KPSC meetings: records audio, transcribes in realtime, produces minutes, resolutions, and action items, and becomes **policy-aware** via KPSC bylaw uploads/links.

## 0) KPSC-Specific Governance Assumptions (from KPSC bylaws)
- Committee membership groups: **Men, Women, Youth, Ministers, Pastor**.
- **Quorum rule:** at least one representative from each of **Men, Women, Youth, Ministers** must be present for approvals.
- Voting thresholds:
  - **Standard expenses**: simple majority (51%)
  - **Major capital projects**: two-thirds (⅔)
- Pastor has limited **veto power** only on grounds of **ethics, doctrine, unity/reputation**.
- Welfare privacy rule: KPSC manages **funds**, Welfare committee manages **people** (beneficiary names not required in KPSC records).
- No financial appeal under KPSC scope without prior KPSC approval.

> NOTE: These assumptions are later enforced via policy-aware checks (Phase 2). Phase 1 logs + structures meeting outcomes.

---

## 1) Product Scope

### Phase 1 (MVP)
**Goal:** 1-click meeting capture + minutes.
- Auth (simple)
- Create meeting (title/date/type: routine/emergency/virtual)
- Start / Pause / Stop recording
- Live transcript view (streaming)
- End-of-meeting processing:
  - Summary (short + detailed)
  - Minutes (KPSC format)
  - Resolutions/decisions
  - Action items
- Archive + search (basic keyword)
- Export minutes to PDF/DOCX

### Phase 2
**Goal:** Policy-aware KPSC governance assistant.
- Upload policy document (PDF/DOCX) OR paste URL
- Extract text, chunk, index
- Policy-aware processing:
  - Quorum checks
  - Voting threshold suggestion
  - Flag potential policy violations
  - Classify expenses into KPSC categories
- Natural language search across meeting archive

---

## 2) User Roles (MVP)
- **Admin**: manage members, policies, and meeting templates
- **Secretary**: run meetings, finalize minutes
- **Viewer**: view minutes + exports

---

## 3) Tech Choices (MVP)
- Frontend: Next.js + TypeScript + Tailwind, PWA enabled
- Hosting: Cloudflare Pages
- Backend: Cloudflare Worker
  - WebSocket endpoint for realtime streaming
  - REST endpoints for meeting lifecycle + processing
- Storage: Cloudflare R2 (audio and exports)
- DB: Supabase Postgres
- AI providers:
  - Realtime transcription: OpenAI realtime speech-to-text
  - Post-processing: DeepSeek

---

## 4) Data Model (Supabase)

### meetings
- id (uuid)
- title
- meeting_type (routine|emergency|virtual)
- started_at, ended_at
- created_by
- audio_r2_key (nullable)
- transcript_text (long text)
- transcript_segments (jsonb)
- summary_short
- summary_long
- minutes_markdown
- minutes_pdf_r2_key (nullable)
- minutes_docx_r2_key (nullable)
- created_at

### participants
- id
- meeting_id
- name
- role (chair|pastor|treasurer|secretary|member)
- group (men|women|youth|ministers|other)
- present (bool)

### resolutions
- id
- meeting_id
- text
- category (welfare|rent|repairs|equipment|development|emergency|other)
- required_threshold (simple_majority|two_thirds|unknown)
- approved (bool|nullable)
- vote_summary (text)

### action_items
- id
- meeting_id
- task
- assignee
- due_date (nullable)
- status (pending|completed)

### policies
- id
- title
- source_type (upload|url|text)
- source_url (nullable)
- file_r2_key (nullable)
- extracted_text
- created_at

### policy_chunks
- id
- policy_id
- chunk_index
- chunk_text
- embedding (vector)

---

## 5) UX Screens

### 5.1 Login
- Email + magic link (or password)

### 5.2 Dashboard
- New meeting
- Recent meetings list
- Search bar

### 5.3 Meeting Room
- Start/Pause/Stop
- Live transcript panel
- Attendance toggle list (Men/Women/Youth/Ministers)
- Manual “Current Speaker” selector (Phase 1)

### 5.4 Meeting Review
- Summary tabs
- Minutes editor (final human approval)
- Resolutions list
- Action items list
- Export buttons

### 5.5 Policy Manager (Phase 2)
- Upload PDF/DOCX
- Paste URL
- View current policy version
- Re-index button

---

## 6) API Endpoints (Worker)

### Auth
- handled by Supabase

### Meetings
- POST /api/meetings  (create)
- POST /api/meetings/:id/start
- POST /api/meetings/:id/end
- GET  /api/meetings
- GET  /api/meetings/:id

### Realtime transcript
- WS /ws/meetings/:id/audio
  - client sends audio frames
  - server forwards to OpenAI realtime transcription
  - server streams back transcript segments

### Post-processing
- POST /api/meetings/:id/process
  - calls DeepSeek with transcript
  - returns structured output:
    {summary_short, summary_long, minutes_markdown, resolutions[], action_items[]}

### Exports
- POST /api/meetings/:id/export/pdf
- POST /api/meetings/:id/export/docx

### Policies (Phase 2)
- POST /api/policies/upload
- POST /api/policies/from-url
- POST /api/policies/reindex/:id

---

## 7) AI Prompts (High-level)

### 7.1 Minutes generation prompt
Input:
- transcript
- attendance
- meeting type
Output (JSON):
- summary_short
- summary_long
- minutes_markdown
- resolutions[]
- action_items[]

### 7.2 Policy-aware checks (Phase 2)
Input:
- transcript
- extracted resolutions
- policy chunks retrieved by semantic search
Output:
- flags[] (quorum missing, threshold mismatch, privacy risk, etc.)
- suggested wording improvements

---

## 8) Definition of Done

### Phase 1
- You can run a 2-hour meeting from phone
- Live transcript works
- Minutes generated successfully
- Minutes export works
- Meeting archive works

### Phase 2
- Policy upload or URL ingestion works
- Policy-aware analysis produces useful flags
- Search across meetings and policy works
