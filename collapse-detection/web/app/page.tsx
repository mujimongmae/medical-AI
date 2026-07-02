"use client";

// OWNER: Integrate part. Homecam window.
//
// Pipeline: useCamera (prefers the iPhone Continuity Camera) → rAF detect loop
// (MoveNet + COCO-SSD) → collapse state machine (zone-aware) → DetectionOverlay,
// and emit an EmergencyEvent over the event-bus when a CANDIDATE is confirmed.
//
// Open this window on the "home" side and /receiver in a second tab/device to
// see the full alert flow. Camera only works over a secure context (localhost).

import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { loadDetectors, type Detectors } from "@/lib/detectors";
import {
  createCollapseStateMachine,
  type CollapseStateMachine,
  type CollapseDebug,
} from "@/lib/collapse-state-machine";
import { emitEmergencyEvent } from "@/lib/event-bus";
import { confirmCollapse } from "@/lib/confirm-client";
import { scoreFall, checkFallBackend } from "@/lib/fall-client";
import DetectionOverlay from "@/components/DetectionOverlay";
import {
  THRESHOLDS,
  type CollapseState,
  type DetectionFrame,
  type EmergencyEvent,
  type Posture,
  type Zone,
} from "@/lib/types";

/** Live-tunable detection thresholds (mirrors state-machine TunableThresholds). */
interface Tuning {
  dropDescent: number;
  aspectHorizontalMin: number;
  torsoHorizontalDeg: number;
  immobileSeconds: number;
  /** ST-GCN fall-action probability required to CONFIRM the alarm (page-level). */
  fallActionProb: number;
}

/** Default ST-GCN decision threshold. Empirically: still ~0.28 vs fall ~0.51.
 *  Kept modest because arisu04 is unproven — the final decision ORs it with the
 *  (more reliable) Claude check, so a low ST-GCN score alone can't veto a fall. */
const DEFAULT_FALL_ACTION_PROB = 0.3;

const DEFAULT_TUNING: Tuning = {
  dropDescent: THRESHOLDS.DROP_DESCENT_NORMALIZED,
  aspectHorizontalMin: THRESHOLDS.ASPECT_RATIO_HORIZONTAL_MIN,
  torsoHorizontalDeg: THRESHOLDS.TORSO_HORIZONTAL_DEG,
  immobileSeconds: THRESHOLDS.IMMOBILE_SECONDS,
  fallActionProb: DEFAULT_FALL_ACTION_PROB,
};

/**
 * Combined fall verdict surfaced to the HUD. The final decision ORs the two
 * models (safety-biased; the app-side cancel gate is the backstop): a fall is
 * confirmed if EITHER the ST-GCN OR Claude says fall — so the unproven ST-GCN
 * can't veto a real fall that Claude catches.
 */
interface FallVerdict {
  isFall: boolean; // final combined decision
  threshold: number;
  stgcnRan: boolean;
  stgcnProb: number;
  stgcnFall: boolean;
  claudeRan: boolean;
  claudeFall: boolean;
  /** No model ran → decided on geometry alone (false-positive-biased). */
  undecided: boolean;
}

const CAMERA_ID = "homecam-1";

type DetectorStatus = "idle" | "loading" | "ready" | "error";

const STATE_LABEL: Record<CollapseState, string> = {
  NORMAL: "정상 감시 중",
  SUSPECTED: "쓰러짐 의심",
  DOWN: "쓰러진 자세 감지",
  IMMOBILE_CONFIRM: "무동작 확인 중",
  VERIFYING: "AI 낙상 판정 중",
  CANDIDATE_EMITTED: "응급 신호 전송됨",
};

export default function HomeCamPage() {
  const { videoRef, devices, activeDeviceId, selectDevice, requestCamera, status, error } =
    useCamera();

  const [frame, setFrame] = useState<DetectionFrame | null>(null);
  const [displayState, setDisplayState] = useState<CollapseState>("NORMAL");
  const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [detectorStatus, setDetectorStatus] = useState<DetectorStatus>("idle");
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<EmergencyEvent | null>(null);
  // True while the Claude 2nd-stage confirmation is in flight (between CANDIDATE
  // and the actual emit). Drives the "AI 확인 중…" indicator.
  const [confirming, setConfirming] = useState(false);
  // Whether the local ST-GCN fall backend (localhost:8000) is reachable.
  const [fallBackendUp, setFallBackendUp] = useState(false);
  // Live diagnostic snapshot from the state machine (drives the debug HUD).
  const [debug, setDebug] = useState<CollapseDebug | null>(null);
  // Last ST-GCN fall-action verdict (shown in the HUD under the heuristic).
  const [lastVerdict, setLastVerdict] = useState<FallVerdict | null>(null);
  // Test-video mode: run detection on an uploaded clip instead of the live cam.
  const [videoMode, setVideoMode] = useState<"camera" | "file">("camera");
  const [fileName, setFileName] = useState<string | null>(null);
  const [videoLoop, setVideoLoop] = useState(false);
  const fileUrlRef = useRef<string | null>(null);
  // Live-tunable detection thresholds (sliders). Read every frame via a ref so
  // a change takes effect instantly without recreating the state machine.
  const [tuning, setTuning] = useState<Tuning>(DEFAULT_TUNING);
  const tuningRef = useRef<Tuning>(tuning);
  tuningRef.current = tuning;
  const getThresholds = useCallback(() => tuningRef.current, []);

  // Refs read by the rAF loop / machine so we avoid stale closures.
  const detectorsRef = useRef<Detectors | null>(null);
  const machineRef = useRef<CollapseStateMachine | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const keyframeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Rolling buffer of recent frames' keypoints (normalized 0..1 x,y,visibility)
  // for the local ST-GCN fall model. Filled in the rAF loop; read on trigger.
  const poseBufferRef = useRef<number[][][]>([]);
  // Snapshot of the keypoint window captured at the DOWN moment (fall just
  // completed) — this is what the ST-GCN scores, so the ballistic descent is the
  // freshest motion rather than being diluted by the post-fall immobility wait.
  const fallWindowRef = useRef<number[][][]>([]);

  // -- Poll the local ST-GCN fall backend so the UI shows its status. --
  useEffect(() => {
    let alive = true;
    const ping = () =>
      void checkFallBackend().then((up) => alive && setFallBackendUp(up));
    ping();
    const id = setInterval(ping, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // -- Load detectors once (singleton is safe under StrictMode double-mount). --
  useEffect(() => {
    let cancelled = false;
    setDetectorStatus("loading");
    loadDetectors()
      .then((d) => {
        if (cancelled) return;
        detectorsRef.current = d;
        setDetectorStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetectorError(
          (err as { message?: string })?.message ??
            "AI 모델을 불러오지 못했습니다.",
        );
        setDetectorStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // -- Capture a keyframe (downscaled JPEG data URL) from the live video. --
  const captureKeyframe = useCallback((): string | undefined => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return undefined;
    let canvas = keyframeCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      keyframeCanvasRef.current = canvas;
    }
    const maxW = 320;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      return undefined; // e.g. tainted canvas — non-fatal for the demo
    }
  }, [videoRef]);

  // -- Collect a short burst of keyframes for the 2nd-stage Claude check. --
  // Grabs `count` frames spaced `intervalMs` apart so the VLM sees motion (or
  // the lack of it). Skips empty captures; safe to return fewer than `count`.
  const collectKeyframes = useCallback(
    async (count = 4, intervalMs = 200): Promise<string[]> => {
      const frames: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const kf = captureKeyframe();
        if (kf) frames.push(kf);
        if (i < count - 1) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
      return frames;
    },
    [captureKeyframe],
  );

  // -- (Re)create the state machine whenever the zones change. --
  useEffect(() => {
    machineRef.current = createCollapseStateMachine({
      cameraId: CAMERA_ID,
      zones: [],
      captureKeyframe,
      getThresholds,
      // Fall just completed → snapshot the recent keypoint window NOW so the
      // ST-GCN sees the ballistic descent as the freshest motion (not diluted
      // by the 3s immobility wait that precedes emission). The current frame is
      // already pushed to the buffer before update() runs, so it's included.
      onDown: () => {
        fallWindowRef.current = poseBufferRef.current.slice(-160);
      },
      // CANDIDATE → collect keyframes → Claude 2nd-stage confirm → emit enriched.
      // The emit is deferred until confirmation resolves (1~3s). Confirmation
      // never throws (skipped fallback), so the event is always emitted.
      onCandidate: (event) => {
        setConfirming(true);
        // Heuristic confirmed a DOWN state and handed off. The machine is now
        // halted in VERIFYING — NO alarm yet. We run Layer 2 (ST-GCN) to decide
        // whether an actual fall ACTION occurred, then confirm() or reset().
        console.info(
          "[collapse] 🟠 쓰러진 상태 감지 → ST-GCN 판정 시작 (verify)",
          event.eventId,
          event.signals,
        );
        // Window snapshotted at the DOWN moment (descent-centered).
        const poseWindow = fallWindowRef.current.length
          ? fallWindowRef.current
          : poseBufferRef.current.slice(-160);
        const threshold = tuningRef.current.fallActionProb;
        void (async () => {
          let enriched: EmergencyEvent = event;
          let verdict: FallVerdict = {
            isFall: true,
            threshold,
            stgcnRan: false,
            stgcnProb: 0,
            stgcnFall: false,
            claudeRan: false,
            claudeFall: false,
            undecided: true,
          };
          try {
            // Layer 2 (ST-GCN) + Layer 3 (Claude) run in parallel.
            const [confirmation, fallModel] = await Promise.all([
              collectKeyframes(4, 200).then((burst) =>
                confirmCollapse(
                  event.keyframeDataUrl
                    ? [event.keyframeDataUrl, ...burst]
                    : burst,
                  event.signals,
                ),
              ),
              scoreFall(poseWindow),
            ]);
            enriched = { ...event, confirmation, fallModel };

            const stgcnRan = fallModel.source === "local-stgcn";
            const stgcnFall =
              stgcnRan &&
              (fallModel.probability >= threshold ||
                (fallModel.sustained && fallModel.probability >= threshold - 0.1));
            const claudeRan = confirmation.source === "claude";
            const claudeFall = claudeRan && confirmation.fallen;
            const anyRan = stgcnRan || claudeRan;
            // DECISION: fall if EITHER model agrees. Neither ran → geometry only.
            const isFall = anyRan ? stgcnFall || claudeFall : true;
            verdict = {
              isFall,
              threshold,
              stgcnRan,
              stgcnProb: fallModel.probability,
              stgcnFall,
              claudeRan,
              claudeFall,
              undecided: !anyRan,
            };
          } catch (err) {
            console.warn("[collapse] 판정 단계 실패 — 기하 기반으로 발행", err);
            verdict = { ...verdict, isFall: true, undecided: true };
          } finally {
            setLastVerdict(verdict);
            if (verdict.isFall) {
              // Confirmed fall → promote to alarm + emit to the receiver/app.
              machineRef.current?.confirm();
              emitEmergencyEvent(enriched);
              setLastEvent(enriched);
              setDisplayState("CANDIDATE_EMITTED");
              console.info("[collapse] 🚨 낙상 확정 → 발행", enriched.eventId, {
                stgcn: verdict.stgcnRan
                  ? `${verdict.stgcnProb.toFixed(2)}${verdict.stgcnFall ? "✓" : "✗"}`
                  : "none",
                claude: verdict.claudeRan
                  ? verdict.claudeFall
                    ? "fall✓"
                    : "no✗"
                  : "none",
              });
            } else {
              // Down state but NEITHER model says fall → suppress + recover.
              machineRef.current?.reset();
              setDisplayState("NORMAL");
              console.info("[collapse] ⏹️ 낙상 행위 아님 → 억제/복귀", {
                stgcn: verdict.stgcnRan
                  ? verdict.stgcnProb.toFixed(2)
                  : "none",
                claude: verdict.claudeRan ? "no" : "none",
                threshold,
              });
            }
            setConfirming(false);
          }
        })();
      },
    });
    setDisplayState("NORMAL");
  }, [captureKeyframe, collectKeyframes, getThresholds]);

  // -- rAF detection loop (async body reschedules only after detect resolves). --
  useEffect(() => {
    if (detectorStatus !== "ready") return;
    activeRef.current = true;

    const tick = async () => {
      if (!activeRef.current) return;
      const video = videoRef.current;
      const det = detectorsRef.current;
      if (det && video && video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          const f = await det.detect(video, performance.now());
          if (!activeRef.current) return;
          setFrame(f);
          // Buffer normalized keypoints (0..1 x,y,visibility) for the ST-GCN
          // model. keypoints[i] is landmark i (BlazePose index order).
          if (f.pose && f.width > 0 && f.height > 0) {
            const norm = f.pose.keypoints.map((k) => [
              k.x / f.width,
              k.y / f.height,
              k.score,
            ]);
            const buf = poseBufferRef.current;
            buf.push(norm);
            if (buf.length > 300) buf.splice(0, buf.length - 300);
          }
          const m = machineRef.current;
          if (m) {
            m.update(f);
            setDisplayState(m.getState());
            setDebug(m.getDebug());
          }
        } catch {
          // Skip this frame on a transient inference error; keep looping.
        }
      }
      if (activeRef.current) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      activeRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [detectorStatus, videoRef]);

  // -- Video metadata → intrinsic dimensions (drives overlay + coord mapping). --
  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video && video.videoWidth > 0) {
      setVideoDims({ w: video.videoWidth, h: video.videoHeight });
    }
  }, [videoRef]);

  const resetDetection = useCallback(() => {
    machineRef.current?.reset();
    setDisplayState("NORMAL");
    setLastEvent(null);
    setLastVerdict(null);
  }, []);

  // Clear all detection state (machine + rolling buffers + UI) for a fresh run.
  const clearDetectionState = useCallback(() => {
    machineRef.current?.reset();
    poseBufferRef.current = [];
    fallWindowRef.current = [];
    setDisplayState("NORMAL");
    setLastEvent(null);
    setLastVerdict(null);
  }, []);

  // -- Load a local video file and run the SAME detection pipeline on it. --
  const loadVideoFile = useCallback(
    (file: File) => {
      const video = videoRef.current;
      if (!video) return;
      // Release the live camera so the device/light turns off.
      const s = video.srcObject as MediaStream | null;
      if (s) s.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      video.src = url;
      video.loop = videoLoop;
      video.muted = true;
      video.playsInline = true;
      video.playbackRate = 1;
      video.currentTime = 0;
      void video.play().catch(() => {});
      setVideoMode("file");
      setFileName(file.name);
      clearDetectionState();
    },
    [videoRef, videoLoop, clearDetectionState],
  );

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) loadVideoFile(f);
      e.target.value = ""; // allow re-selecting the same file
    },
    [loadVideoFile],
  );

  const replayVideoFile = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    clearDetectionState();
    video.currentTime = 0;
    void video.play().catch(() => {});
  }, [videoRef, clearDetectionState]);

  const toggleLoop = useCallback(
    (v: boolean) => {
      setVideoLoop(v);
      if (videoRef.current) videoRef.current.loop = v;
    },
    [videoRef],
  );

  const backToCamera = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }
    setVideoMode("camera");
    setFileName(null);
    clearDetectionState();
    requestCamera();
  }, [videoRef, requestCamera, clearDetectionState]);

  // Revoke the object URL on unmount.
  useEffect(
    () => () => {
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    },
    [],
  );

  // Manual test: emit a synthetic candidate to verify the receiver/app path
  // end-to-end without a real fall (also a reliable fallback for the live demo).
  const sendTestAlert = useCallback(() => {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    const event: EmergencyEvent = {
      eventId: c?.randomUUID ? c.randomUUID() : `test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      cameraId: CAMERA_ID,
      status: "candidate",
      severity: "critical",
      personBbox: [0, 0, 0, 0],
      signals: {
        transition: "abrupt",
        zone: "floor",
        immobileSeconds: 3,
        posture: "horizontal",
      },
      keyframeDataUrl: captureKeyframe(),
    };
    emitEmergencyEvent(event);
    setLastEvent(event);
  }, [captureKeyframe]);

  const isAlarm =
    displayState === "DOWN" ||
    displayState === "IMMOBILE_CONFIRM" ||
    displayState === "CANDIDATE_EMITTED";

  const aspect =
    videoDims.w > 0 && videoDims.h > 0
      ? `${videoDims.w} / ${videoDims.h}`
      : "16 / 9";

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">홈캠 쓰러짐 감지</h1>
        <p className="text-sm text-neutral-400">
          카메라에 잡힌 사람이 급격히 쓰러진 뒤 움직임이 없으면 응급 신호를
          보냅니다.{" "}
          <a
            href="/receiver"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-4 hover:text-neutral-200"
          >
            수신 화면 열기 ↗
          </a>
        </p>
      </header>

      {/* Status pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusPill
          label={
            videoMode === "file"
              ? "입력: 영상 파일"
              : `카메라: ${cameraStatusLabel(status)}`
          }
          tone={
            videoMode === "file"
              ? "ok"
              : status === "streaming"
                ? "ok"
                : status === "error"
                  ? "bad"
                  : "warn"
          }
        />
        <StatusPill
          label={`AI 모델: ${detectorStatusLabel(detectorStatus)}`}
          tone={
            detectorStatus === "ready"
              ? "ok"
              : detectorStatus === "error"
                ? "bad"
                : "warn"
          }
        />
        <StatusPill
          label={`낙상모델: ${fallBackendUp ? "연결됨" : "미연결"}`}
          tone={fallBackendUp ? "ok" : "warn"}
        />
        <StatusPill
          label={`상태: ${STATE_LABEL[displayState]}`}
          tone={isAlarm ? "bad" : displayState === "SUSPECTED" ? "warn" : "ok"}
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={requestCamera}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
        >
          📷 카메라 다시 요청
        </button>
        <button
          type="button"
          onClick={sendTestAlert}
          className="rounded-md border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200 hover:bg-amber-900/40"
        >
          🔔 테스트 알림 보내기
        </button>
      </div>

      {/* 테스트 영상으로 판별 (실제 낙상 클립을 라이브 카메라 대신 입력) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-2.5 text-sm">
        <span className="text-neutral-400">🎞️ 테스트 영상</span>
        <label className="cursor-pointer rounded-md border border-sky-700 bg-sky-950/40 px-3 py-1.5 text-sky-200 hover:bg-sky-900/40">
          영상 파일 선택
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={onPickFile}
          />
        </label>
        {videoMode === "file" && (
          <>
            <span className="max-w-[220px] truncate text-neutral-400">
              {fileName}
            </span>
            <button
              type="button"
              onClick={replayVideoFile}
              className="rounded-md border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800"
            >
              ▶ 다시 재생
            </button>
            <label className="flex items-center gap-1.5 text-neutral-400">
              <input
                type="checkbox"
                checked={videoLoop}
                onChange={(e) => toggleLoop(e.target.checked)}
              />
              반복
            </label>
            <button
              type="button"
              onClick={backToCamera}
              className="rounded-md border border-neutral-700 px-3 py-1.5 hover:bg-neutral-800"
            >
              📷 카메라로
            </button>
          </>
        )}
      </div>

      {(error || detectorError) && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
          {error && <p>카메라: {error}</p>}
          {detectorError && <p>AI 모델: {detectorError}</p>}
        </div>
      )}

      {/* Camera picker */}
      {devices.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">카메라 선택 (iPhone 연속성 카메라 권장)</span>
          <select
            className="rounded-md border border-neutral-700 bg-neutral-900 p-2"
            value={activeDeviceId ?? ""}
            onChange={(e) => selectDevice(e.target.value)}
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Video + overlay stage */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-neutral-800 bg-black"
        style={{ aspectRatio: aspect }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={onLoadedMetadata}
          className="h-full w-full object-cover"
        />

        <DetectionOverlay
          frame={frame}
          state={displayState}
          sourceWidth={videoDims.w}
          sourceHeight={videoDims.h}
        />

        {videoMode === "camera" && status !== "streaming" && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-neutral-400">
            {status === "error"
              ? "카메라를 시작할 수 없습니다."
              : "카메라 권한을 허용해 주세요…"}
          </div>
        )}
      </div>

      {/* 실시간 감지 진단 + 민감도 조절 (테스트/시연용) */}
      <section className="grid gap-5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 md:grid-cols-2">
        {/* 왼쪽: 라이브 신호 */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-neutral-300">
            실시간 감지 진단
          </h2>
          {!debug ? (
            <p className="text-xs text-neutral-500">감지 대기 중…</p>
          ) : (
            <>
              <Gate
                label="포즈 인식"
                ok={debug.hasPose}
                detail={
                  debug.hasPose
                    ? "사람 골격 감지됨"
                    : "사람/골격 안 잡힘 — 전신이 프레임에 보이게"
                }
              />

              {/* ① 휴리스틱 체크포인트 3개 */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2.5">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  휴리스틱 체크포인트 (3)
                </div>
                <div className="flex flex-col gap-1.5 text-xs">
                  <Gate
                    label="① 하강"
                    ok={isDownState(debug.state) || debug.dropSignal}
                    detail={
                      isDownState(debug.state)
                        ? "충족 · 쓰러짐 구간 유지"
                        : `하강량 ${debug.netDrop.toFixed(2)} / 기준 ${tuning.dropDescent.toFixed(2)}`
                    }
                  />
                  <Gate
                    label="② 쓰러진 자세"
                    ok={isDownState(debug.state) || debug.endedDown}
                    detail={
                      isDownState(debug.state)
                        ? "쓰러진 상태 유지 중"
                        : endedDownReason(debug, tuning)
                    }
                  />
                  <Gate
                    label="③ 무동작"
                    ok={
                      isDownState(debug.state) &&
                      debug.immobileSec >= tuning.immobileSeconds
                    }
                    detail={
                      isDownState(debug.state)
                        ? `${debug.immobileSec.toFixed(1)}초 / ${tuning.immobileSeconds}초`
                        : "①·② 충족 후 측정"
                    }
                  />
                </div>
                <div className="mt-1.5 pl-6 text-[11px] text-neutral-600">
                  참고 · 자세 {postureKo(debug.posture)} · 몸통각{" "}
                  {debug.torsoAngle < 0
                    ? "?"
                    : `${Math.round(debug.torsoAngle)}°`}{" "}
                  · 박스비율{" "}
                  {debug.aspect === Infinity ? "∞" : debug.aspect.toFixed(2)}{" "}
                  <span className="text-neutral-700">(박스는 판정에 미사용)</span>
                </div>
              </div>

              {/* ② 휴리스틱 최종값 (3개 AND) */}
              <Gate
                label="휴리스틱 최종"
                ok={heuristicConfirmed(debug.state)}
                detail={
                  heuristicConfirmed(debug.state)
                    ? "①·②·③ 모두 충족 → 쓰러진 상태 확정 → ST-GCN 전달"
                    : `미확정 · ${STATE_LABEL[debug.state]}`
                }
              />

              {/* ③ ST-GCN 판정 값 */}
              <div className="rounded-lg border border-purple-900/60 bg-purple-950/20 p-2.5">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-purple-300/80">
                  낙상 행위 판정 (ST-GCN OR Claude · 최종)
                </div>
                {debug.state === "VERIFYING" || confirming ? (
                  <p className="text-xs text-purple-200">
                    판정 중… (모델 계산)
                  </p>
                ) : lastVerdict ? (
                  <Gate
                    label={lastVerdict.isFall ? "낙상 O" : "낙상 X"}
                    ok={lastVerdict.isFall}
                    detail={verdictDetail(lastVerdict)}
                  />
                ) : (
                  <p className="text-xs text-neutral-500">
                    대기 — 쓰러진 상태 감지 시 실행
                  </p>
                )}
              </div>
            </>
          )}
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
            흐름:{" "}
            <b className="text-neutral-400">①하강 + ②자세 + ③무동작</b> → 휴리스틱
            쓰러진 상태 확정 → <b className="text-purple-300">ST-GCN</b>이 실제 낙상
            행위면 <b className="text-red-300">쓰러짐! 발행</b>, 아니면 억제·복귀.
          </p>
        </div>

        {/* 오른쪽: 민감도 슬라이더 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-300">
              민감도 조절
            </h2>
            <button
              type="button"
              onClick={() => setTuning(DEFAULT_TUNING)}
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800"
            >
              기본값 복원
            </button>
          </div>
          <Slider
            label="하강 민감도 (휴리스틱)"
            value={tuning.dropDescent}
            min={0.1}
            max={0.8}
            step={0.05}
            fmt={(v) => v.toFixed(2)}
            hint="클수록 더 많이 내려가야 하강 인정"
            onChange={(v) => setTuning((t) => ({ ...t, dropDescent: v }))}
          />
          <Slider
            label="ST-GCN 판정기준"
            value={tuning.fallActionProb}
            min={0.1}
            max={0.9}
            step={0.05}
            fmt={(v) => `${Math.round(v * 100)}%`}
            hint="클수록 더 확실한 낙상 동작만 인정"
            onChange={(v) => setTuning((t) => ({ ...t, fallActionProb: v }))}
          />
          <Slider
            label="수평 각도 (휴리스틱)"
            value={tuning.torsoHorizontalDeg}
            min={30}
            max={85}
            step={5}
            fmt={(v) => `${Math.round(v)}°`}
            hint="클수록 더 눕혀져야 '수평'으로 인정"
            onChange={(v) =>
              setTuning((t) => ({ ...t, torsoHorizontalDeg: v }))
            }
          />
          <Slider
            label="무동작 시간 (휴리스틱)"
            value={tuning.immobileSeconds}
            min={0}
            max={6}
            step={0.5}
            fmt={(v) => `${v}초`}
            hint="클수록 더 오래 안 움직여야 ST-GCN 판정 진행"
            onChange={(v) => setTuning((t) => ({ ...t, immobileSeconds: v }))}
          />
        </div>
      </section>

      {/* AI 2차 확인 진행 표시 (CANDIDATE → Claude 확인 → emit 사이) */}
      {confirming && (
        <section className="flex items-center gap-3 rounded-xl border border-purple-800 bg-purple-950/40 p-4">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300 border-t-transparent" />
          <p className="text-sm font-semibold text-purple-200">
            AI 확인 중… 키프레임을 분석하고 있습니다
          </p>
        </section>
      )}

      {/* Emitted event / reset */}
      {lastEvent && (
        <section className="rounded-xl border border-red-800 bg-red-950/50 p-4">
          <p className="font-semibold text-red-200">
            응급 신호 전송됨 ·{" "}
            {lastEvent.severity === "critical" ? "위급" : "의심"}
          </p>
          <p className="mt-1 text-sm text-red-300/90">
            구역 {zoneKo(lastEvent.signals.zone)} · 무동작{" "}
            {lastEvent.signals.immobileSeconds}초 · 전이{" "}
            {lastEvent.signals.transition === "abrupt" ? "급격" : "점진"}
          </p>
          {lastEvent.fallModel?.source === "local-stgcn" && (
            <p className="mt-2 text-sm text-purple-200">
              🤖 ST-GCN 낙상확률 {Math.round(lastEvent.fallModel.probability * 100)}%
              {lastEvent.fallModel.sustained ? " · 지속" : ""}
            </p>
          )}
          {lastEvent.confirmation && (
            <p className="mt-1 text-sm text-purple-200">
              {lastEvent.confirmation.source === "claude"
                ? `🧠 AI 확인: 쓰러짐 ${lastEvent.confirmation.fallen ? "O" : "X"} · 무반응 ${lastEvent.confirmation.motionless ? "O" : "X"} · 신뢰도 ${confidencePct(lastEvent.confirmation.confidence)}%`
                : "AI 확인 생략(키 미설정)"}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <a
              href="/receiver"
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              수신 화면 확인
            </a>
            <button
              type="button"
              onClick={resetDetection}
              className="rounded-md border border-red-700 px-3 py-2 text-sm hover:bg-red-900/40"
            >
              감지 초기화
            </button>
          </div>
        </section>
      )}

      <p className="mt-auto text-center text-xs text-neutral-500">
        본 정보는 참고용이며 의학적 진단이 아닙니다. 합성/데모 목적의 영상만
        사용하세요.
      </p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers.
// ---------------------------------------------------------------------------

/** One live-signal row in the debug HUD: a check dot + label + detail. */
function Gate({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={
          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
          (ok ? "bg-green-600 text-white" : "bg-neutral-700 text-neutral-400")
        }
      >
        {ok ? "✓" : "·"}
      </span>
      <span className="w-[4.5rem] shrink-0 text-neutral-300">{label}</span>
      <span className={ok ? "text-green-300" : "text-neutral-500"}>{detail}</span>
    </div>
  );
}

/** A labeled range slider with a live value and a strict/loose hint. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  fmt,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  hint: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono text-neutral-100">
          {fmt(value)}{" "}
          <span className="text-[10px] font-sans text-amber-400/80">
            🔼 클수록 둔감
          </span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-500"
      />
      <span className="text-[10px] text-neutral-600">{hint}</span>
    </label>
  );
}

function postureKo(p: Posture): string {
  switch (p) {
    case "horizontal":
      return "수평";
    case "upright":
      return "직립";
    default:
      return "미상";
  }
}

/** Reason for the "쓰러진 자세" gate — torso angle OR vertical-collapse. */
function endedDownReason(d: CollapseDebug, t: Tuning): string {
  const ang = d.torsoAngle < 0 ? "?" : `${Math.round(d.torsoAngle)}°`;
  const need = Math.round(t.torsoHorizontalDeg);
  const keep = `키 ${Math.round(d.heightRatio * 100)}%`;
  if (d.posture === "horizontal") return `몸통 수평 (${ang} ≥ ${need}°)`;
  if (d.verticalCollapse) return `수직 붕괴 (${keep} ↓)`;
  return `미충족 (각 ${ang}<${need}° · ${keep})`;
}

/** States where the person is considered down (immobility being measured). */
function isDownState(s: CollapseState): boolean {
  return (
    s === "DOWN" ||
    s === "IMMOBILE_CONFIRM" ||
    s === "VERIFYING" ||
    s === "CANDIDATE_EMITTED"
  );
}

/** Heuristic has confirmed the down-state (all 3 checkpoints) and handed off. */
function heuristicConfirmed(s: CollapseState): boolean {
  return s === "VERIFYING" || s === "CANDIDATE_EMITTED";
}

/** One-line detail for the combined verdict row (ST-GCN OR Claude). */
function verdictDetail(v: FallVerdict): string {
  if (v.undecided) return "모델 미연결 → 기하 기반 발행(안전측)";
  const parts: string[] = [];
  if (v.stgcnRan) {
    parts.push(
      `ST-GCN ${Math.round(v.stgcnProb * 100)}%/${Math.round(v.threshold * 100)}% ${v.stgcnFall ? "O" : "X"}`,
    );
  } else {
    parts.push("ST-GCN 미연결");
  }
  parts.push(v.claudeRan ? `Claude ${v.claudeFall ? "O" : "X"}` : "Claude 미연결");
  return parts.join(" · ");
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "bad";
}) {
  const cls =
    tone === "ok"
      ? "border-green-700 bg-green-950/60 text-green-300"
      : tone === "warn"
        ? "border-amber-700 bg-amber-950/60 text-amber-300"
        : "border-red-700 bg-red-950/60 text-red-300";
  return (
    <span className={"rounded-full border px-3 py-1 " + cls}>{label}</span>
  );
}

function cameraStatusLabel(s: string): string {
  switch (s) {
    case "streaming":
      return "연결됨";
    case "requesting":
      return "요청 중…";
    case "error":
      return "오류";
    default:
      return "대기";
  }
}

function detectorStatusLabel(s: DetectorStatus): string {
  switch (s) {
    case "ready":
      return "준비됨";
    case "loading":
      return "로딩 중…";
    case "error":
      return "오류";
    default:
      return "대기";
  }
}

function zoneKo(zone: Zone): string {
  switch (zone) {
    case "floor":
      return "바닥";
    case "bed":
      return "침대";
    case "couch":
      return "소파";
    default:
      return "미상";
  }
}

/** Confidence → integer percent. Accepts 0..1 fractions or 0..100 values. */
function confidencePct(confidence: number): number {
  const raw = Number.isFinite(confidence) ? confidence : 0;
  const pct = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
