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
# Tests — ffmpeg fallback path (webm/opus from MediaRecorder)
# ---------------------------------------------------------------------------

class TestEmbedFfmpegFallback:
    """
    When the browser's MediaRecorder uploads webm/opus, the primary
    torchaudio.load call cannot parse the container directly. The decoder
    falls back to piping the bytes through ffmpeg via stdin -> stdout and
    re-loads the resulting WAV. These tests exercise that fallback path.
    """
    VALID_HEADERS = {"Authorization": "Bearer test-secret-token"}

    def test_torchaudio_failure_triggers_ffmpeg_fallback(self, client, monkeypatch):
        """Simulate torchaudio.load raising on the first attempt and ffmpeg
        returning a valid 3s WAV; the endpoint should succeed via the fallback."""
        import app.main as main_module

        # Build a real 3s WAV that the ffmpeg subprocess "returns".
        wav_bytes = _make_wav(3.0)

        # Track how the primary load is called so we can fail it ONCE then
        # let the post-ffmpeg load succeed.
        calls = {"load": 0}
        original_load = main_module.torchaudio.load

        def flaky_load(buf):
            calls["load"] += 1
            if calls["load"] == 1:
                raise RuntimeError("simulated webm/opus decode failure")
            return original_load(buf)

        monkeypatch.setattr(main_module.torchaudio, "load", flaky_load)

        # Mock subprocess.run so we don't actually invoke ffmpeg in unit tests.
        class FakeCompletedProcess:
            stdout = wav_bytes
            stderr = b""
            returncode = 0

        captured_args = {}

        def fake_run(cmd, **kwargs):
            captured_args["cmd"] = cmd
            captured_args["input_len"] = len(kwargs.get("input", b""))
            captured_args["timeout"] = kwargs.get("timeout")
            return FakeCompletedProcess()

        import subprocess
        monkeypatch.setattr(subprocess, "run", fake_run)

        # Use webm content type to mirror what MediaRecorder produces.
        resp = client.post(
            "/embed",
            files={"audio": ("recording.webm", wav_bytes, "audio/webm")},
            headers=self.VALID_HEADERS,
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert len(body["embedding"]) == 192
        # Verify ffmpeg was actually invoked with the expected pipeline shape.
        cmd = captured_args["cmd"]
        assert cmd[0] == "ffmpeg"
        assert "pipe:0" in cmd
        assert "pipe:1" in cmd
        assert "pcm_s16le" in cmd
        assert captured_args["input_len"] == len(wav_bytes)
        assert captured_args["timeout"] == 20

    def test_ffmpeg_failure_returns_422(self, client, monkeypatch):
        """If ffmpeg exits non-zero (truly unrecognised format), the endpoint
        must return HTTP 422 with a friendly message, not 500."""
        import app.main as main_module

        def always_fail_load(buf):
            raise RuntimeError("torchaudio cannot decode this")

        monkeypatch.setattr(main_module.torchaudio, "load", always_fail_load)

        import subprocess

        def fake_run(cmd, **kwargs):
            raise subprocess.CalledProcessError(
                returncode=1,
                cmd=cmd,
                output=b"",
                stderr=b"Invalid data found when processing input",
            )

        monkeypatch.setattr(subprocess, "run", fake_run)

        resp = client.post(
            "/embed",
            files={"audio": ("garbage.bin", b"\x00\x01\x02not_audio", "application/octet-stream")},
            headers=self.VALID_HEADERS,
        )
        assert resp.status_code == 422
        assert "Could not decode" in resp.json()["detail"]

    def test_ffmpeg_missing_binary_returns_500(self, client, monkeypatch):
        """If ffmpeg isn't installed in the runtime image we should surface a
        clear 500 server-misconfigured error rather than a vague decode error."""
        import app.main as main_module

        def always_fail_load(buf):
            raise RuntimeError("torchaudio cannot decode this")

        monkeypatch.setattr(main_module.torchaudio, "load", always_fail_load)

        import subprocess

        def fake_run(cmd, **kwargs):
            raise FileNotFoundError("ffmpeg")

        monkeypatch.setattr(subprocess, "run", fake_run)

        resp = client.post(
            "/embed",
            files={"audio": ("clip.webm", b"abc", "audio/webm")},
            headers=self.VALID_HEADERS,
        )
        assert resp.status_code == 500
        assert "ffmpeg not installed" in resp.json()["detail"]


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
