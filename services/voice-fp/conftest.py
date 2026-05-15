"""
Root conftest for the voice-fp service tests.

We stub out torch, torchaudio, and speechbrain BEFORE any test module imports
app.main, so the heavy ML dependencies are never needed during unit tests.
"""

import sys
import types
import numpy as np

# ---------------------------------------------------------------------------
# Build minimal stub modules
# ---------------------------------------------------------------------------

# --- torch stub ---
torch_stub = types.ModuleType("torch")

class _FakeTensor:
    """Minimal tensor stand-in used by _decode_audio and the model stub."""

    def __init__(self, data, shape=None):
        if hasattr(data, "shape"):
            self._data = data
        else:
            self._data = np.array(data, dtype=np.float32)
        self._shape = shape or self._data.shape

    @property
    def shape(self):
        return self._shape

    def mean(self, dim=0, keepdim=False):
        axis = dim
        result = self._data.mean(axis=axis)
        if keepdim:
            result = np.expand_dims(result, axis=axis)
        return _FakeTensor(result)

    def squeeze(self):
        squeezed = self._data.squeeze()
        return _FakeTensor(squeezed)

    def tolist(self):
        return self._data.tolist()

    def __getitem__(self, idx):
        return _FakeTensor(self._data[idx])


class _FakeNoGrad:
    def __enter__(self): return self
    def __exit__(self, *args): pass


def _fake_from_numpy(arr):
    return _FakeTensor(arr.astype(np.float32))


torch_stub.Tensor = _FakeTensor
torch_stub.no_grad = _FakeNoGrad
torch_stub.from_numpy = _fake_from_numpy
# Provide a minimal tensor constructor used by tests
torch_stub.tensor = lambda data, **kw: _FakeTensor(np.array(data, dtype=np.float32))

sys.modules["torch"] = torch_stub

# --- torchaudio stub ---
torchaudio_stub = types.ModuleType("torchaudio")

def _fake_load(buf):
    """Return a short silence waveform + 16000 SR for any input."""
    # Read up to MAX_BYTES from the buffer to determine approximate size
    data = buf.read()
    # Synthesise a short sine representing the file (good enough for unit tests)
    # The actual wave bytes are from soundfile-written WAV; parse them properly.
    import io, wave as _wave
    try:
        with _wave.open(io.BytesIO(data)) as wf:
            sr = wf.getframerate()
            n_frames = wf.getnframes()
            n_channels = wf.getnchannels()
            raw = wf.readframes(n_frames)
            samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
            if n_channels > 1:
                samples = samples.reshape(-1, n_channels).mean(axis=1)
            waveform = np.expand_dims(samples, 0)  # (1, N)
            return _FakeTensor(waveform, shape=(1, len(samples))), sr
    except Exception:
        # Fallback: treat as 0.1 s silence at 16kHz
        samples = np.zeros(1600, dtype=np.float32)
        return _FakeTensor(samples[np.newaxis, :], shape=(1, 1600)), 16000

torchaudio_stub.load = _fake_load

# torchaudio.transforms stub
transforms_stub = types.ModuleType("torchaudio.transforms")

class _FakeResample:
    def __init__(self, orig_freq, new_freq):
        self._ratio = new_freq / orig_freq

    def __call__(self, waveform):
        # Simple nearest-neighbour resample for tests
        data = waveform._data
        n_out = int(data.shape[-1] * self._ratio)
        indices = (np.arange(n_out) / self._ratio).astype(int)
        indices = np.clip(indices, 0, data.shape[-1] - 1)
        resampled = data[..., indices]
        return _FakeTensor(resampled, shape=resampled.shape)

transforms_stub.Resample = _FakeResample

torchaudio_stub.transforms = transforms_stub
sys.modules["torchaudio"] = torchaudio_stub
sys.modules["torchaudio.transforms"] = transforms_stub

# --- speechbrain stub ---
speechbrain_stub = types.ModuleType("speechbrain")
sb_inference_stub = types.ModuleType("speechbrain.inference")

FIXED_EMBEDDING = [0.1] * 192

class _StubEncoderClassifier:
    @classmethod
    def from_hparams(cls, source, savedir=None, run_opts=None):
        return cls()

    def encode_batch(self, waveform):
        emb = np.array([[FIXED_EMBEDDING]], dtype=np.float32)  # (1, 1, 192)
        return _FakeTensor(emb, shape=(1, 1, 192))

sb_inference_stub.EncoderClassifier = _StubEncoderClassifier
speechbrain_stub.inference = sb_inference_stub
sys.modules["speechbrain"] = speechbrain_stub
sys.modules["speechbrain.inference"] = sb_inference_stub
