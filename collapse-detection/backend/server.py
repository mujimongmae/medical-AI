"""Local fall-detection backend — wraps the arisu04/Medical_Fall_Detection
MultiScaleTCNAttn model (PyTorch) behind a tiny FastAPI endpoint.

Why a local Python backend (not the browser): the model ships as a PyTorch
.pth, which the browser can't run. Rather than convert to ONNX, we run it in
Python right here on the demo machine — the frontend (localhost:3000) POSTs a
window of MediaPipe-33 keypoints and gets back a fall probability. No cloud.

The frontend already extracts MediaPipe Pose landmarks, so this backend needs
NEITHER mediapipe NOR cv2 — only torch + numpy. The model + preprocessing below
are copied verbatim from the source app.py so inference matches the Space.
"""

from __future__ import annotations

import os

import numpy as np
import torch
import torch.nn as nn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- Paths (weights live in the cloned Space under model_src/) ----------------
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "model_src")
STATE_DICT_PATH = os.path.join(SRC, "best_multiscale_stgcn_state_dict.pth")
FULL_CKPT_PATH = os.path.join(SRC, "best_multiscale_stgcn (1).pth")
MEAN_STD_FILE = os.path.join(SRC, "mean_std.npz")

# Model constants (from the source app.py).
NUM_JOINTS = 33
CHANNELS = 3
SCALES = [64, 128, 256]
STRIDE = 16
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Detection hyperparams (frame-run thresholds mirror the Space).
FRAME_THRESHOLD = 0.5
MIN_CONSECUTIVE = 3


# --- Model (verbatim from the source app.py) ---------------------------------
class ChannelSE(nn.Module):
    def __init__(self, channels, reduction=8):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Conv2d(channels, max(channels // reduction, 1), 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(max(channels // reduction, 1), channels, 1),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return x * self.fc(x)


class TemporalConvBlock(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size=9, stride=1, dilation=1):
        super().__init__()
        pad = (kernel_size - 1) // 2 * dilation
        self.conv = nn.Conv2d(
            in_ch, out_ch, kernel_size=(kernel_size, 1),
            padding=(pad, 0), stride=(stride, 1), dilation=(dilation, 1),
        )
        self.bn = nn.BatchNorm2d(out_ch)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.relu(self.bn(self.conv(x)))


class MultiScaleTCNAttn(nn.Module):
    def __init__(self, in_ch=3, base_ch=64, num_classes=2):
        super().__init__()
        self.input_proj = nn.Conv2d(in_ch, base_ch, 1)
        self.branch1 = TemporalConvBlock(base_ch, base_ch, kernel_size=3)
        self.branch2 = TemporalConvBlock(base_ch, base_ch, kernel_size=5)
        self.branch3 = TemporalConvBlock(base_ch, base_ch, kernel_size=9)
        self.fuse = nn.Conv2d(base_ch * 3, base_ch, 1)
        self.se = ChannelSE(base_ch)
        self.block1 = TemporalConvBlock(base_ch, base_ch * 2, kernel_size=9, stride=2)
        self.block2 = TemporalConvBlock(base_ch * 2, base_ch * 4, kernel_size=9, stride=2)
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc = nn.Linear(base_ch * 4, num_classes)

    def forward(self, x):
        x = self.input_proj(x)
        b1 = self.branch1(x)
        b2 = self.branch2(x)
        b3 = self.branch3(x)
        x = torch.cat([b1, b2, b3], dim=1)
        x = self.fuse(x)
        x = self.se(x)
        x = self.block1(x)
        x = self.block2(x)
        x = self.pool(x).view(x.size(0), -1)
        return self.fc(x)


# --- Load model + normalization stats ----------------------------------------
model = MultiScaleTCNAttn().to(DEVICE)
MEAN: np.ndarray | None = None
STD: np.ndarray | None = None
MODEL_READY = False


def load_resources() -> None:
    global MEAN, STD, MODEL_READY
    loaded = False
    if os.path.exists(STATE_DICT_PATH):
        try:
            model.load_state_dict(torch.load(STATE_DICT_PATH, map_location=DEVICE))
            loaded = True
            print("✅ Loaded state-dict.")
        except Exception as e:  # noqa: BLE001
            print(f"❌ state-dict load failed: {e}")
    if not loaded and os.path.exists(FULL_CKPT_PATH):
        try:
            try:
                ck = torch.load(FULL_CKPT_PATH, map_location=DEVICE, weights_only=False)
            except TypeError:
                ck = torch.load(FULL_CKPT_PATH, map_location=DEVICE)
            state = ck["model_state"] if isinstance(ck, dict) and "model_state" in ck else ck
            model.load_state_dict(state)
            loaded = True
            print("✅ Loaded full checkpoint.")
        except Exception as e:  # noqa: BLE001
            print(f"❌ full checkpoint load failed: {e}")
    if loaded:
        model.eval()
        MODEL_READY = True
    else:
        print("❌ No weights loaded — /fall will return an error flag.")

    if os.path.exists(MEAN_STD_FILE):
        ms = np.load(MEAN_STD_FILE)
        MEAN = ms["mean"][:, None, None].astype(np.float32)
        STD = ms["std"][:, None, None].astype(np.float32)
        print("✅ Loaded mean/std.")
    else:
        MEAN = np.zeros((CHANNELS, 1, 1), dtype=np.float32)
        STD = np.ones((CHANNELS, 1, 1), dtype=np.float32)


load_resources()


# --- Inference (multiscale sliding windows, verbatim logic) -------------------
def window_probs_to_frame_scores(arr: np.ndarray) -> np.ndarray:
    """arr: (C=3, T, V=33) → per-frame fall probability (T,)."""
    C, T, V = arr.shape
    frame_acc = np.zeros((T,), dtype=np.float32)
    frame_count = np.zeros((T,), dtype=np.int32)
    mean = MEAN if MEAN is not None else np.zeros((C, 1, 1), np.float32)
    std = STD if STD is not None else np.ones((C, 1, 1), np.float32)
    for s in SCALES:
        if T < s:
            win = np.concatenate([arr, np.zeros((C, s - T, V), np.float32)], axis=1)
            normed = (win - mean) / std
            x = torch.from_numpy(normed.astype(np.float32)).unsqueeze(0).to(DEVICE)
            with torch.no_grad():
                prob = float(torch.softmax(model(x), dim=1)[0, 1].cpu().item())
            frame_acc[:T] += prob
            frame_count[:T] += 1
        else:
            for st in range(0, max(1, T - s + 1), STRIDE):
                win = arr[:, st:st + s, :]
                normed = (win - mean) / std
                x = torch.from_numpy(normed.astype(np.float32)).unsqueeze(0).to(DEVICE)
                with torch.no_grad():
                    prob = float(torch.softmax(model(x), dim=1)[0, 1].cpu().item())
                frame_acc[st:st + s] += prob
                frame_count[st:st + s] += 1
    mask = frame_count > 0
    scores = np.zeros((T,), dtype=np.float32)
    scores[mask] = frame_acc[mask] / frame_count[mask]
    return scores


def to_chan_time_joint(frames: list[list[list[float]]]) -> np.ndarray:
    """Frontend sends frames[t] = 33 landmarks × [x,y,z,visibility] (or [x,y,vis]).
    Select (x, y, visibility) to match the training format, return (3, T, 33)."""
    data = np.asarray(frames, dtype=np.float32)  # (T, 33, ch)
    if data.ndim != 3 or data.shape[1] != NUM_JOINTS:
        raise ValueError(f"expected (T,33,ch), got {data.shape}")
    if data.shape[2] >= 4:
        arr = data[:, :, [0, 1, 3]]  # x, y, visibility
    elif data.shape[2] == 3:
        arr = data
    else:
        conf = np.ones((data.shape[0], data.shape[1], 1), np.float32)
        arr = np.concatenate([data, conf], axis=-1)
    return arr.transpose(2, 0, 1)  # (3, T, 33)


# --- API ---------------------------------------------------------------------
app = FastAPI(title="Fall Detection Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class FallRequest(BaseModel):
    frames: list[list[list[float]]]  # (T, 33, 3|4)


class FallResponse(BaseModel):
    ready: bool
    fallProbability: float          # peak per-frame fall prob over the window
    sustained: bool                 # a run of ≥MIN_CONSECUTIVE frames over threshold
    framesAnalyzed: int
    reason: str


@app.get("/health")
def health() -> dict:
    return {"ready": MODEL_READY, "device": str(DEVICE)}


@app.post("/fall", response_model=FallResponse)
def fall(req: FallRequest) -> FallResponse:
    if not MODEL_READY:
        return FallResponse(ready=False, fallProbability=0.0, sustained=False,
                            framesAnalyzed=0, reason="모델 미로드")
    try:
        arr = to_chan_time_joint(req.frames)
    except Exception as e:  # noqa: BLE001
        return FallResponse(ready=True, fallProbability=0.0, sustained=False,
                            framesAnalyzed=0, reason=f"입력 오류: {e}")
    scores = window_probs_to_frame_scores(arr)
    peak = float(scores.max()) if scores.size else 0.0
    # sustained run over threshold?
    above = scores >= FRAME_THRESHOLD
    run = best = 0
    for a in above:
        run = run + 1 if a else 0
        best = max(best, run)
    sustained = best >= MIN_CONSECUTIVE
    return FallResponse(
        ready=True, fallProbability=peak, sustained=bool(sustained),
        framesAnalyzed=int(arr.shape[1]),
        reason=f"peak={peak:.3f}, maxRun={best}",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
