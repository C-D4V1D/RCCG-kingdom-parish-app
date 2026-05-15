# KPSC Voice Fingerprinting Service

## What it is

A stateless Python FastAPI service that accepts an audio clip and returns a 192-dimensional ECAPA-TDNN speaker embedding (via SpeechBrain). It replaces Microsoft Azure Speaker Recognition (retired 2025-09-30); cosine similarity and member lookup are handled by the Cloudflare Worker, not here.

---

## Setup

GCP prerequisites:

- A Google account with access to a GCP billing account
- `gcloud` CLI installed and authenticated:
  ```bash
  curl https://sdk.cloud.google.com | bash
  exec -l $SHELL
  gcloud auth login
  ```
- A GCP project with billing enabled (the deploy script will create the project if it does not exist and prompt you to link billing)

---

## Deploy

```bash
./deploy.sh kpsc-voice
```

The script will:
1. Verify `gcloud` is installed and you are logged in
2. Create the GCP project if it does not exist
3. Prompt you to link a billing account if needed
4. Enable Cloud Run, Cloud Build, and Artifact Registry APIs
5. Create an Artifact Registry Docker repo
6. Generate a random `VOICE_FP_TOKEN` (saved to `.deploy-secrets`, git-ignored)
7. Build and push the Docker image via Cloud Build
8. Deploy to Cloud Run with min-instances=1 (no cold starts mid-meeting)
9. Print a summary with the service URL and bearer token to set in Cloudflare Pages

---

## Run locally for testing

```bash
pip install -r requirements.txt
VOICE_FP_TOKEN=test uvicorn app.main:app --reload
```

Then test with:

```bash
curl http://localhost:8000/health
```

---

## Tests

```bash
pytest tests/
```

The non-slow tests mock the ECAPA model so no GPU or network access is required. To run the full integration test (real model download):

```bash
RUN_SLOW_TESTS=1 pytest tests/ -m slow
```

---

## API

### `GET /health`

Returns service liveness.

```json
{ "ok": true, "model": "spkrec-ecapa-voxceleb" }
```

### `POST /embed`

Compute a 192-dim speaker embedding from an audio clip.

**Headers:**
- `Authorization: Bearer <VOICE_FP_TOKEN>` (required)

**Body:** `multipart/form-data` with field `audio` — WAV, webm/opus, mp3, or m4a file.

**Limits:**
- Max file size: 5 MB (HTTP 413 if exceeded)
- Audio duration: 1.5 s – 30 s (HTTP 400 outside range)

**Response `200 OK`:**
```json
{
  "embedding": [0.012, -0.034, ...],  // 192 floats
  "duration_s": 3.1234,
  "model": "spkrec-ecapa-voxceleb"
}
```

**Error codes:**
| Code | Reason |
|------|--------|
| 401  | Missing or invalid bearer token |
| 400  | Audio duration out of range |
| 413  | Payload exceeds 5 MB |
| 422  | Audio could not be decoded |

---

## Cost

Approximately **$15/month** baseline with `min-instances=1`. Keeping a warm instance is intentional — eliminating cold starts during meetings (ECAPA model load takes ~10 s on a cold container). With `max-instances=3` the service scales to handle concurrent meeting sessions without noticeable latency.
