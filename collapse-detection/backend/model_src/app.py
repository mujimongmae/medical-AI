import gradio as gr
import torch
import torch.nn as nn
import numpy as np
import cv2
from pathlib import Path
import os
import sys

# --- Imports for MediaPipe ---
try:
    import mediapipe as mp
    mp_pose = mp.solutions.pose
except ImportError as e:
    raise ImportError(f"Failed to import mediapipe: {e}")
except AttributeError as e:
    raise ImportError(f"MediaPipe found but missing attributes (solutions). Likely protobuf version mismatch. Error: {e}")

# --- Configuration ---
STATE_DICT_PATH = "best_multiscale_stgcn_state_dict.pth"
FULL_CKPT_PATH = "best_multiscale_stgcn.pth"  # Your fallback model
MEAN_STD_FILE = "mean_std.npz"

# Model Constants
NUM_JOINTS = 33
CHANNELS = 3
SCALES = [64, 128, 256]
STRIDE = 16
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Detection Hyperparams
FRAME_THRESHOLD = 0.5  # Increased from 0.5 to reduce false positives
MIN_CONSECUTIVE = 3    # Increased from 3 to ensure sustained detection

# --- Model Definitions ---
class ChannelSE(nn.Module):
    def __init__(self, channels, reduction=8):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool2d((1,1)),
            nn.Conv2d(channels, max(channels//reduction,1), 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(max(channels//reduction,1), channels, 1),
            nn.Sigmoid()
        )
    def forward(self, x): return x * self.fc(x)

class TemporalConvBlock(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size=9, stride=1, dilation=1):
        super().__init__()
        pad = (kernel_size-1)//2 * dilation
        self.conv = nn.Conv2d(in_ch, out_ch, kernel_size=(kernel_size,1),
                              padding=(pad,0), stride=(stride,1), dilation=(dilation,1))
        self.bn = nn.BatchNorm2d(out_ch); self.relu = nn.ReLU(inplace=True)
    def forward(self, x): return self.relu(self.bn(self.conv(x)))

class MultiScaleTCNAttn(nn.Module):
    def __init__(self, in_ch=3, base_ch=64, num_classes=2):
        super().__init__()
        self.input_proj = nn.Conv2d(in_ch, base_ch, 1)
        self.branch1 = TemporalConvBlock(base_ch, base_ch, kernel_size=3)
        self.branch2 = TemporalConvBlock(base_ch, base_ch, kernel_size=5)
        self.branch3 = TemporalConvBlock(base_ch, base_ch, kernel_size=9)
        self.fuse = nn.Conv2d(base_ch*3, base_ch, 1)
        self.se = ChannelSE(base_ch)
        self.block1 = TemporalConvBlock(base_ch, base_ch*2, kernel_size=9, stride=2)
        self.block2 = TemporalConvBlock(base_ch*2, base_ch*4, kernel_size=9, stride=2)
        self.pool = nn.AdaptiveAvgPool2d((1,1))
        self.fc = nn.Linear(base_ch*4, num_classes)
    def forward(self, x):
        x = self.input_proj(x)
        b1 = self.branch1(x); b2 = self.branch2(x); b3 = self.branch3(x)
        x = torch.cat([b1,b2,b3], dim=1)
        x = self.fuse(x); x = self.se(x)
        x = self.block1(x); x = self.block2(x)
        x = self.pool(x).view(x.size(0), -1)
        return self.fc(x)

# --- Global Resources ---
model = MultiScaleTCNAttn().to(DEVICE)
MEAN = None
STD = None

def load_resources():
    global MEAN, STD
    
    # Logic to load model: State Dict -> Full Checkpoint -> Fail
    loaded = False
    if os.path.exists(STATE_DICT_PATH):
        try:
            print(f"Loading state-dict from {STATE_DICT_PATH}...")
            state_dict = torch.load(STATE_DICT_PATH, map_location=DEVICE)
            model.load_state_dict(state_dict)
            loaded = True
            print("✅ Loaded state-dict successfully.")
        except Exception as e:
            print(f"❌ Error loading state-dict: {e}")

    if not loaded and os.path.exists(FULL_CKPT_PATH):
        print(f"⚠️ State-dict failed or missing. Attempting fallback to full checkpoint: {FULL_CKPT_PATH}...")
        try:
            # Try loading with weights_only=False first (as per original script logic for full ckpt)
            try:
                ck = torch.load(FULL_CKPT_PATH, map_location=DEVICE, weights_only=False)
            except TypeError:
                ck = torch.load(FULL_CKPT_PATH, map_location=DEVICE)
            
            if isinstance(ck, dict) and "model_state" in ck:
                model.load_state_dict(ck["model_state"])
                loaded = True
                print("✅ Loaded model_state from full checkpoint.")
            elif isinstance(ck, dict):
                # Maybe it is a state dict directly
                model.load_state_dict(ck)
                loaded = True
                print("✅ Loaded checkpoint as state-dict.")
            else:
                print("❌ Checkpoint format not recognized.")
        except Exception as e:
            print(f"❌ Error loading full checkpoint: {e}")

    if not loaded:
        print("❌ CRITICAL: No model could be loaded. Inference will fail.")
    else:
        model.eval()

    # Load Mean/Std
    if os.path.exists(MEAN_STD_FILE):
        try:
            print(f"Loading stats from {MEAN_STD_FILE}...")
            ms = np.load(MEAN_STD_FILE)
            MEAN = ms['mean'][:, None, None].astype(np.float32)
            STD  = ms['std'][:, None, None].astype(np.float32)
            print("✅ Stats loaded successfully.")
        except Exception as e:
            print(f"❌ Error loading stats: {e}")
            MEAN = np.zeros((3,1,1), dtype=np.float32)
            STD = np.ones((3,1,1), dtype=np.float32)
    else:
        print(f"⚠️ Warning: '{MEAN_STD_FILE}' not found. Using default normalization.")
        MEAN = np.zeros((3,1,1), dtype=np.float32)
        STD = np.ones((3,1,1), dtype=np.float32)

load_resources()

# --- Helper Functions ---
def extract_pose_and_fps(mp4_path):
    p = Path(mp4_path)
    cap = cv2.VideoCapture(str(p))
    if not cap.isOpened():
        cap.release()
        raise RuntimeError(f"cv2 cannot open {p}")
    fps = cap.get(cv2.CAP_PROP_FPS) or None
    frames = []
    with mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5) as pose:
        ok, frame = cap.read()
        while ok:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = pose.process(rgb)
            if res and res.pose_landmarks:
                lm = res.pose_landmarks.landmark
                arr = np.array([[l.x, l.y, l.z, l.visibility] for l in lm], dtype=np.float32)
            else:
                arr = np.zeros((33,4), dtype=np.float32)
            frames.append(arr)
            ok, frame = cap.read()
    cap.release()
    if len(frames) == 0: raise RuntimeError(f"No frames read from {p}")
    data = np.stack(frames, axis=0)
    if data.shape[2] >= 4: arr = data[:, :, [0,1,3]]
    elif data.shape[2] >= 3: arr = data[:, :, :3]
    else:
        conf = np.ones((data.shape[0], data.shape[1], 1), dtype=np.float32)
        arr = np.concatenate([data, conf], axis=-1)
    return arr.transpose(2,0,1), int(fps) if (fps is not None and fps>0) else None

def window_probs_to_frame_scores(arr, scales=SCALES, stride=STRIDE, device=DEVICE):
    C,T,V = arr.shape
    frame_acc = np.zeros((T,), dtype=np.float32)
    frame_count = np.zeros((T,), dtype=np.int32)
    global MEAN, STD
    if MEAN is None: MEAN = np.zeros((C,1,1), dtype=np.float32)
    if STD is None: STD = np.ones((C,1,1), dtype=np.float32)
    for s in scales:
        if T < s:
            win = np.concatenate([arr, np.zeros((C, s-T, V), dtype=np.float32)], axis=1)
            normed = (win - MEAN) / STD
            x = torch.from_numpy(normed.astype(np.float32)).unsqueeze(0).to(device)
            with torch.no_grad():
                prob = float(torch.softmax(model(x), dim=1)[0,1].cpu().item())
            frame_acc[:T] += prob
            frame_count[:T] += 1
        else:
            for st in range(0, max(1, T - s + 1), stride):
                win = arr[:, st:st+s, :]
                normed = (win - MEAN) / STD
                x = torch.from_numpy(normed.astype(np.float32)).unsqueeze(0).to(device)
                with torch.no_grad():
                    prob = float(torch.softmax(model(x), dim=1)[0,1].cpu().item())
                frame_acc[st:st+s] += prob
                frame_count[st:st+s] += 1
    mask = frame_count > 0
    frame_scores = np.zeros((T,), dtype=np.float32)
    frame_scores[mask] = frame_acc[mask] / frame_count[mask]
    return frame_scores

def find_consecutive_runs(frame_scores, threshold=FRAME_THRESHOLD, min_run=MIN_CONSECUTIVE):
    above = frame_scores >= threshold
    runs = []
    i = 0
    T = len(above)
    while i < T:
        if above[i]:
            j = i
            while j < T and above[j]:
                j += 1
            length = j - i
            if length >= min_run:
                runs.append((i, j-1, length))
            i = j
        else:
            i += 1
    return runs

def detect_falls(video_path):
    if not video_path:
        return "<h3 style='color:red;'>⚠️ Error: No video uploaded.</h3>"
    
    try:
        arr, fps = extract_pose_and_fps(video_path)
        frame_scores = window_probs_to_frame_scores(arr)
        runs = find_consecutive_runs(frame_scores)
        
        if len(runs) > 0:
            s0, e0, L0 = runs[0]
            avg_score = frame_scores[s0:e0+1].mean()
            
            time_info = ""
            if fps:
                t0, t1 = s0/fps, e0/fps
                time_info = f"<p style='margin: 5px 0;'><strong>Time Interval:</strong> {t0:.2f}s - {t1:.2f}s</p>"
            
            html_output = f"""
            <div style='background-color: #FFEBEE; padding: 20px; border-radius: 12px; border: 2px solid #FFCDD2; text-align: center;'>
                <h1 style='color: #C62828; margin-top: 0; font-size: 2.5em;'>⚠️ FALL DETECTED</h1>
                <div style='text-align: left; background: white; padding: 15px; border-radius: 8px; margin-top: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);'>
                    <p style='margin: 5px 0; font-size: 1.2em;'><strong>Confidence Score:</strong> <span style='color: #D32F2F;'>{avg_score:.3f}</span></p>
                    {time_info}
                    <p style='margin: 5px 0;'><strong>Frames:</strong> {s0} to {e0} ({L0} frames)</p>
                </div>
            </div>
            """
            return html_output
        else:
            top_idx = int(frame_scores.argmax())
            top_score = frame_scores[top_idx]
            
            html_output = f"""
            <div style='background-color: #E8F5E9; padding: 20px; border-radius: 12px; border: 2px solid #C8E6C9; text-align: center;'>
                <h1 style='color: #2E7D32; margin-top: 0; font-size: 2.5em;'>✅ NORMAL ACTIVITY</h1>
                <div style='text-align: left; background: white; padding: 15px; border-radius: 8px; margin-top: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);'>
                    <p style='margin: 5px 0; font-size: 1.1em;'><strong>Status:</strong> No fall patterns detected.</p>
                    <p style='margin: 5px 0; color: #555;'><strong>Peak Probability:</strong> {top_score:.3f} (at frame {top_idx})</p>
                </div>
            </div>
            """
            return html_output
            
    except Exception as e:
        return f"<div style='background-color: #ffebee; padding: 10px; border: 1px solid red; color: red;'><strong>Error processing video:</strong> {str(e)}</div>"

def clear_inputs():
    return None, ""

# --- Gradio Interface ---
with gr.Blocks(title="ST-GCN Fall Detection", theme=gr.themes.Soft()) as iface:
    gr.Markdown(
        """
        # 🏥 Intelligent Fall Detection System
        **ST-GCN (Spatio-Temporal Graph Convolutional Network)**
        
        Upload a video surveillance clip to detect if a fall event has occurred. The system analyzes skeletal pose dynamics over time.
        """
    )
    
    with gr.Row():
        with gr.Column():
            input_video = gr.Video(label="Input Video", sources=["upload"])
            with gr.Row():
                clear_btn = gr.Button("🗑️ Clear", variant="secondary")
                analyze_btn = gr.Button("🔍 Analyze Video", variant="primary")
        
        with gr.Column():
            output_html = gr.HTML(label="Analysis Report")
    
    analyze_btn.click(fn=detect_falls, inputs=input_video, outputs=output_html)
    clear_btn.click(fn=clear_inputs, inputs=None, outputs=[input_video, output_html])

if __name__ == "__main__":
    iface.launch()