"""
Tests for the KPSC Voice FP FastAPI service.

torch, torchaudio, and speechbrain are stubbed out in conftest.py (loaded
before app.main is imported), so heavy ML dependencies are not required for
the unit test suite.

Integration tests that need a real ECAPA model are marked @pytest.mark.slow
and skip unless RUN_SLOW_TESTS=1 is set.
"""

import io
import os
import wave

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Helpers — generate in-memory WAV bytes
# ---------------------------------------------------------------------------

def _make_wav(duration_s: float, freq_hz: float = 440.0, sample_rate: int = 16_000) -> bytes:
    """Return a minimal PCM WAV byte string (mono, 16-bit)."""
    n_samples = int(duration_s * sample_rate)
    t = np.linspace(0, duration_s, n_samples, endpoint=False)
    samples = (np.sin(2 * np.pi * freq_hz * t) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


def _make_oversized_payload(size_bytes: int = 6 * 1024 * 1024) -> bytes:
    """Return random bytes larger than the 5 MB limit."""
    return os.urandom(size_bytes)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def set_voice_fp_token(monkeypatch):
    """Ensure VOICE_FP_TOKEN is set for all tests."""
    monkeypatch.setenv("VOICE_FP_TOKEN", "test-secret-token")
    # Also patch the module-level variable (already imported at module load)
    import app.main as main_module
    monkeypatch.setattr(main_module, "VOICE_FP_TOKEN", "test-secret-token")


@pytest.fixture()
def client():
    """FastAPI TestClient."""
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# Tests — health / root
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["model"] == "spkrec-ecapa-voxceleb"


class TestRoot:
    def test_root_returns_service_info(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["service"] == "kpsc-voice-fp"
        assert body["version"] == "0.1.0"


# ---------------------------------------------------------------------------
# Tests — authentication
# ---------------------------------------------------------------------------

class TestEmbedAuth:
    def test_no_auth_header_returns_401(self, client):
        wav_bytes = _make_wav(3.0)
        resp = client.post(
            "/embed",
            files={"audio": ("clip.wav", wav_bytes, "audio/wav")},
        )
        assert resp.status_code == 401

    def test_wrong_token_returns_401(self, client):
        wav_bytes = _make_wav(3.0)
        resp = client.post(
            "/embed",
            files={"audio": ("clip.wav", wav_bytes, "audio/wav")},
            headers={"Authorization": "Bearer wrong-token"},
        )
        assert resp.status_code == 401

    def test_malformed_auth_scheme_returns_401(self, client):
        wav_bytes = _make_wav(3.0)
        resp = client.post(
            "/embed",
            files={"audio": ("clip.wav", wav_bytes, "audio/wav")},
            headers={"Authorization": "test-secret-token"},  # missing "Bearer "
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests — validation
# ---------------------------------------------------------------------------

class TestEmbedValidation:
    VALID_HEADERS = {"Authorization": "Bearer test-secret-token"}

    def test_short_clip_returns_400(self, client):
        """0.5 s is below the 1.5 s minimum."""
        wav_bytes = _make_wav(0.5)
        resp = client.post(
            "/embed",
            files={"audio": ("short.wav", wav_bytes, "audio/wav")},
            headers=self.VALID_HEADERS,
        )
        assert resp.status_code == 400
        assert "short" in resp.json()["detail"].lower()

    def test_oversized_payload_returns_413(self, client):
        """6 MB payload exceeds the 5 MB limit."""
        big_bytes = _make_oversized_payload(6 * 1024 * 1024)
        resp = client.post(
            "/embed",
            files={"audio": ("big.wav", big_bytes, "audio/wav")},
            headers=self.VALID_HEADERS,
        )
        assert resp.status_code == 413


# ---------------------------------------------------------------------------
# Tests — successful embedding
# ---------------------------------------------------------------------------

class TestEmbedSuccess:
    VALID_HEADERS = {"Authorization": "Bearer test-secret-token"}

    def test_valid_3s_clip_returns_embedding(self, client):
        """3 s WAV with valid token → 200, embedding of length 192, duration ≈ 3 s."""
        wav_bytes = _make_wav(3.0)
        resp = client.post(
            "/embed",
            files={"audio": ("clip.wav", wav_bytes, "audio/wav")},
            headers=self.VALID_HEADERS,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "embedding" in body
        assert len(body["embedding"]) == 192
        assert abs(body["duration_s"] - 3.0) < 0.2, f"Expected ~3s, got {body['duration_s']}"
        assert body["model"] == "spkrec-ecapa-voxceleb"

    def test_embedding_values_are_floats(self, client):
        wav_bytes = _make_wav(5.0)
        resp = client.post(
            "/embed",
            files={"audio": ("clip.wav", wav_bytes, "audio/wav")},
            headers=self.VALID_HEADERS,
        )
        assert resp.status_code == 200
        embedding = resp.json()["embedding"]
        assert all(isinstance(v, float) for v in embedding)


# ---------------------------------------------------------------------------
# Slow / integration tests (require real ECAPA model + network or cache)
# ---------------------------------------------------------------------------

@pytest.mark.slow
def test_real_model_embedding_shape():
    """
    Loads the actual ECAPA-TDNN model and verifies embedding shape.
    Skipped unless RUN_SLOW_TESTS=1 is set.
    """
    if not os.environ.get("RUN_SLOW_TESTS"):
        pytest.skip("Set RUN_SLOW_TESTS=1 to run real-model integration tests")

    # At this point, real torch/speechbrain must be importable.
    import importlib
    import torch as real_torch
    from speechbrain.inference import EncoderClassifier as RealEC

    model = RealEC.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        run_opts={"device": "cpu"},
    )
    wav_bytes = _make_wav(3.0)
    import torchaudio as real_ta
    waveform, sr = real_ta.load(io.BytesIO(wav_bytes))
    with real_torch.no_grad():
        emb = model.encode_batch(waveform)
    assert emb.squeeze().shape == (192,)
