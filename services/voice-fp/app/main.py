"""
KPSC Voice Fingerprinting Service — FastAPI application.

Stateless ECAPA-TDNN speaker-embedding endpoint.
Model is loaded once at module import time (startup).
"""

import io
import json
import logging
import os
import time
from typing import Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Structured logger (Cloud Run captures stdout as structured logs)
# ---------------------------------------------------------------------------

class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "time": self.formatTime(record, self.datefmt),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


def _setup_logging() -> logging.Logger:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    log = logging.getLogger("voice_fp")
    log.setLevel(logging.INFO)
    log.addHandler(handler)
    log.propagate = False
    return log


logger = _setup_logging()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_BYTES = 5 * 1024 * 1024   # 5 MB
MIN_DURATION_S = 1.5
MAX_DURATION_S = 30.0
TARGET_SR = 16_000
MODEL_NAME = "spkrec-ecapa-voxceleb"
MODEL_SOURCE = f"speechbrain/{MODEL_NAME}"
MODEL_CACHE_DIR = os.environ.get("MODEL_CACHE_DIR", "/tmp/spk")
VOICE_FP_TOKEN: Optional[str] = os.environ.get("VOICE_FP_TOKEN")

# ---------------------------------------------------------------------------
# Model — loaded once at module import.
# Heavy imports (torch, speechbrain) are done here so test suites can stub
# them via conftest.py before this module is imported.
# ---------------------------------------------------------------------------

import torch                                         # noqa: E402
import torchaudio                                    # noqa: E402
import torchaudio.transforms as T                   # noqa: E402
from speechbrain.inference import EncoderClassifier  # noqa: E402

logger.info(f"Loading ECAPA-TDNN model from cache dir: {MODEL_CACHE_DIR}")
_t0 = time.monotonic()

ECAPA_MODEL: EncoderClassifier = EncoderClassifier.from_hparams(
    source=MODEL_SOURCE,
    savedir=MODEL_CACHE_DIR,
    run_opts={"device": "cpu"},
)

logger.info(f"Model loaded in {time.monotonic() - _t0:.2f}s")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="KPSC Voice FP", version="0.1.0", docs_url=None, redoc_url=None)


# ---------------------------------------------------------------------------
# Helper: authentication
# ---------------------------------------------------------------------------

def _check_auth(authorization: Optional[str]) -> None:
    """Raise 401 if the Bearer token is invalid or missing."""
    if not VOICE_FP_TOKEN:
        # If not configured, deny everything — safer than allowing all.
        raise HTTPException(status_code=401, detail="VOICE_FP_TOKEN env var not configured")
    expected = f"Bearer {VOICE_FP_TOKEN}"
    if not authorization or authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized — invalid or missing bearer token")


# ---------------------------------------------------------------------------
# Helper: audio decoding
# ---------------------------------------------------------------------------

def _decode_audio(data: bytes, filename: str) -> tuple:
    """
    Decode audio bytes to a (1, N) mono float32 tensor at TARGET_SR.

    Returns (waveform, duration_seconds).
    Supports WAV, webm/opus, mp3, m4a via torchaudio (ffmpeg backend) with a
    soundfile+librosa fallback for formats torchaudio can't handle directly.
    """
    buf = io.BytesIO(data)

    waveform = None
    sr = None

    # --- primary: torchaudio (uses ffmpeg when available) ---
    try:
        waveform, sr = torchaudio.load(buf)
    except Exception as ta_err:
        logger.warning(f"torchaudio.load failed ({ta_err}); falling back to librosa")
        buf.seek(0)
        try:
            import soundfile as sf  # noqa: F401
            import librosa

            # librosa handles webm/opus via ffmpeg subprocess
            y, sr_lib = librosa.load(buf, sr=None, mono=False)
            if y.ndim == 1:
                y = y[np.newaxis, :]
            waveform = torch.from_numpy(y.astype(np.float32))
            sr = sr_lib
        except Exception as lb_err:
            logger.error(f"librosa fallback also failed: {lb_err}")
            raise HTTPException(status_code=422, detail=f"Could not decode audio: {lb_err}")

    # Convert to mono
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # Resample to TARGET_SR
    if sr != TARGET_SR:
        resampler = T.Resample(orig_freq=sr, new_freq=TARGET_SR)
        waveform = resampler(waveform)

    num_samples = waveform.shape[1]
    duration_s = num_samples / TARGET_SR
    return waveform, duration_s


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
async def root() -> dict:
    return {"service": "kpsc-voice-fp", "version": "0.1.0"}


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "model": MODEL_NAME}


@app.post("/embed")
async def embed(
    request: Request,
    audio: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    t_start = time.monotonic()
    logger.info({"event": "request_received", "filename": audio.filename, "content_type": audio.content_type})

    # --- Authentication ---
    _check_auth(authorization)

    # --- Size check (read all bytes first) ---
    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(audio_bytes)} bytes (max {MAX_BYTES})",
        )

    # --- Decode audio ---
    t_decode_start = time.monotonic()
    waveform, duration_s = _decode_audio(audio_bytes, audio.filename or "upload")
    decode_ms = (time.monotonic() - t_decode_start) * 1000
    logger.info({"event": "decode_done", "duration_s": round(duration_s, 3), "decode_ms": round(decode_ms, 1)})

    # --- Duration validation ---
    if duration_s < MIN_DURATION_S:
        raise HTTPException(
            status_code=400,
            detail=f"Audio too short: {duration_s:.2f}s (min {MIN_DURATION_S}s)",
        )
    if duration_s > MAX_DURATION_S:
        raise HTTPException(
            status_code=400,
            detail=f"Audio too long: {duration_s:.2f}s (max {MAX_DURATION_S}s)",
        )

    # --- Embedding ---
    t_embed_start = time.monotonic()
    with torch.no_grad():
        # SpeechBrain expects (batch, time) — squeeze channel dim
        embedding_tensor = ECAPA_MODEL.encode_batch(waveform)  # → (1, 1, 192)
        embedding = embedding_tensor.squeeze().tolist()          # → list[192]
    embed_ms = (time.monotonic() - t_embed_start) * 1000
    total_ms = (time.monotonic() - t_start) * 1000

    logger.info({
        "event": "embed_done",
        "embed_ms": round(embed_ms, 1),
        "total_ms": round(total_ms, 1),
        "duration_s": round(duration_s, 3),
    })

    return JSONResponse({
        "embedding": embedding,
        "duration_s": round(duration_s, 4),
        "model": MODEL_NAME,
    })


# ---------------------------------------------------------------------------
# Entry point (for local dev only — Cloud Run uses the CMD uvicorn invocation)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8080")), workers=1)
