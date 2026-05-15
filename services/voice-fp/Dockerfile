# ============================================================
# Stage 1 — builder
# Installs all Python deps and pre-downloads the ECAPA model.
# ============================================================
FROM python:3.11-slim AS builder

# System build dependencies + ffmpeg (needed by torchaudio/librosa for opus)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip

# Install CPU-only torch + torchaudio FIRST from the PyTorch CPU index.
# This prevents pip from pulling the CUDA-enabled wheels (~2 GB extra).
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.5.1 \
    torchaudio==2.5.1

# Install remaining application dependencies.
# torch/torchaudio are already satisfied above; pip will skip reinstalling.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r /tmp/requirements.txt

# Pre-download and cache the ECAPA-TDNN model so the runtime image never
# fetches from Hugging Face on cold-start.
RUN python -c "\
from speechbrain.inference import EncoderClassifier; \
EncoderClassifier.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb', savedir='/opt/model_cache')" \
    && echo "Model cache contents:" \
    && ls -lh /opt/model_cache \
    && test "$(ls -A /opt/model_cache)" || (echo 'ERROR: model cache is empty' && exit 1)

# ============================================================
# Stage 2 — runtime (lean image)
# ============================================================
FROM python:3.11-slim AS runtime

# ffmpeg is required at runtime for librosa/torchaudio to decode webm/opus/mp3
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy pre-built model cache
COPY --from=builder /opt/model_cache /opt/model_cache

# Environment
ENV MODEL_CACHE_DIR=/opt/model_cache \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy application code
WORKDIR /app
COPY app/ ./app/

# Cloud Run injects $PORT at runtime; default 8080 for local docker run.
ENV PORT=8080

# Single worker — Cloud Run handles concurrency via min/max instances.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1"]
