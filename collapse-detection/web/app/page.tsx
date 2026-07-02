"use client";

// OWNER: Integrate part. Homecam window.
//
// Pipeline: useCamera (prefers the iPhone Continuity Camera) → rAF detect loop
// (MoveNet + COCO-SSD) → collapse state machine (zone-aware) → DetectionOverlay,
// and emit an EmergencyEvent over the event-bus when a CANDIDATE is confirmed.
//
// Open this window on the "home" side and /receiver in a second tab/device to
// see the full alert flow. Camera only works over a secure context (localhost).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { loadDetectors, type Detectors } from "@/lib/detectors";
import {
  createCollapseStateMachine,
  type CollapseStateMachine,
} from "@/lib/collapse-state-machine";
import { zonesFromDetections, type ZoneRect } from "@/lib/zone-map";
import { emitEmergencyEvent } from "@/lib/event-bus";
import { confirmCollapse } from "@/lib/confirm-client";
import DetectionOverlay from "@/components/DetectionOverlay";
import type {
  CollapseState,
  DetectionFrame,
  EmergencyEvent,
  Zone,
} from "@/lib/types";

const CAMERA_ID = "homecam-1";

type DetectorStatus = "idle" | "loading" | "ready" | "error";

/** Zone types the user can draw (unknown is not drawable). */
type DrawableZone = Exclude<Zone, "unknown">;

const ZONE_META: Record<DrawableZone, { label: string; color: string }> = {
  floor: { label: "바닥", color: "#f59e0b" },
  bed: { label: "침대", color: "#60a5fa" },
  couch: { label: "소파", color: "#a78bfa" },
};

const STATE_LABEL: Record<CollapseState, string> = {
  NORMAL: "정상 감시 중",
  SUSPECTED: "쓰러짐 의심",
  DOWN: "쓰러짐 감지",
  IMMOBILE_CONFIRM: "무동작 확인 중",
  CANDIDATE_EMITTED: "응급 신호 전송됨",
};

/** A drag rectangle in container-CSS pixels (before conversion to source px). */
interface DragRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function HomeCamPage() {
  const { videoRef, devices, activeDeviceId, selectDevice, requestCamera, status, error } =
    useCamera();

  const [frame, setFrame] = useState<DetectionFrame | null>(null);
  const [displayState, setDisplayState] = useState<CollapseState>("NORMAL");
  const [zones, setZones] = useState<ZoneRect[]>([]);
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

  // Zone drawing UI.
  const [drawTool, setDrawTool] = useState<DrawableZone | null>(null);
  const [drag, setDrag] = useState<DragRect | null>(null);

  // Refs read by the rAF loop / machine so we avoid stale closures.
  const detectorsRef = useRef<Detectors | null>(null);
  const machineRef = useRef<CollapseStateMachine | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const keyframeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

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
      zones,
      captureKeyframe,
      // CANDIDATE → collect keyframes → Claude 2nd-stage confirm → emit enriched.
      // The emit is deferred until confirmation resolves (1~3s). Confirmation
      // never throws (skipped fallback), so the event is always emitted.
      onCandidate: (event) => {
        setConfirming(true);
        void (async () => {
          try {
            const burst = await collectKeyframes(4, 200);
            const keyframes = event.keyframeDataUrl
              ? [event.keyframeDataUrl, ...burst]
              : burst;
            const confirmation = await confirmCollapse(
              keyframes,
              event.signals,
            );
            const enriched: EmergencyEvent = { ...event, confirmation };
            emitEmergencyEvent(enriched);
            setLastEvent(enriched);
          } finally {
            setConfirming(false);
          }
        })();
      },
    });
    setDisplayState("NORMAL");
  }, [zones, captureKeyframe, collectKeyframes]);

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
          const m = machineRef.current;
          if (m) {
            m.update(f);
            setDisplayState(m.getState());
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

  // -- Zone drawing: pointer handlers convert CSS px → source px on commit. --
  const toSourcePx = useCallback(
    (rect: DragRect): ZoneRect["bbox"] => {
      const el = containerRef.current;
      if (!el || videoDims.w === 0 || videoDims.h === 0) {
        return [rect.x, rect.y, rect.w, rect.h];
      }
      const box = el.getBoundingClientRect();
      const sx = videoDims.w / box.width;
      const sy = videoDims.h / box.height;
      return [rect.x * sx, rect.y * sy, rect.w * sx, rect.h * sy];
    },
    [videoDims],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drawTool) return;
      const box = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      dragStartRef.current = { x, y };
      setDrag({ x, y, w: 0, h: 0 });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [drawTool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = dragStartRef.current;
      if (!start) return;
      const box = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - box.left;
      const cy = e.clientY - box.top;
      setDrag({
        x: Math.min(start.x, cx),
        y: Math.min(start.y, cy),
        w: Math.abs(cx - start.x),
        h: Math.abs(cy - start.y),
      });
    },
    [],
  );

  const onPointerUp = useCallback(() => {
    const d = drag;
    const tool = drawTool;
    dragStartRef.current = null;
    setDrag(null);
    if (!tool || !d || d.w < 8 || d.h < 8) return; // ignore stray taps
    const bbox = toSourcePx(d);
    setZones((prev) => [...prev, { zone: tool, bbox }]);
    setDrawTool(null);
  }, [drag, drawTool, toSourcePx]);

  const autoDetectZones = useCallback(() => {
    if (!frame) return;
    const detected = zonesFromDetections(frame.objects);
    if (detected.length > 0) setZones((prev) => [...prev, ...detected]);
  }, [frame]);

  const clearZones = useCallback(() => setZones([]), []);
  const undoZone = useCallback(
    () => setZones((prev) => prev.slice(0, -1)),
    [],
  );

  const resetDetection = useCallback(() => {
    machineRef.current?.reset();
    setDisplayState("NORMAL");
    setLastEvent(null);
  }, []);

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

  // Stable ref for the overlay (avoids redundant redraws when unrelated state
  // changes; zones array identity only changes on actual edits).
  const overlayZones = useMemo(() => zones, [zones]);

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
          label={`카메라: ${cameraStatusLabel(status)}`}
          tone={status === "streaming" ? "ok" : status === "error" ? "bad" : "warn"}
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
          zones={overlayZones}
          sourceWidth={videoDims.w}
          sourceHeight={videoDims.h}
        />

        {/* Drawing interaction layer (only active while a zone tool is armed). */}
        {drawTool && (
          <div
            className="absolute inset-0 z-10 cursor-crosshair touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {drag && (
              <div
                className="absolute border-2 border-dashed"
                style={{
                  left: drag.x,
                  top: drag.y,
                  width: drag.w,
                  height: drag.h,
                  borderColor: ZONE_META[drawTool].color,
                  backgroundColor: ZONE_META[drawTool].color + "22",
                }}
              />
            )}
          </div>
        )}

        {status !== "streaming" && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-neutral-400">
            {status === "error"
              ? "카메라를 시작할 수 없습니다."
              : "카메라 권한을 허용해 주세요…"}
          </div>
        )}
      </div>

      {/* Zone tools */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-300">
          구역 지정{" "}
          <span className="font-normal text-neutral-500">
            — 침대·소파는 오탐 억제, 바닥은 의심 구역
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ZONE_META) as DrawableZone[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setDrawTool((cur) => (cur === z ? null : z))}
              className={
                "rounded-md border px-3 py-2 text-sm transition " +
                (drawTool === z
                  ? "border-white bg-white/10 font-semibold"
                  : "border-neutral-700 hover:bg-neutral-800")
              }
              style={drawTool === z ? { borderColor: ZONE_META[z].color } : undefined}
            >
              {drawTool === z ? `${ZONE_META[z].label} 그리는 중…` : `${ZONE_META[z].label} 지정`}
            </button>
          ))}
          <button
            type="button"
            onClick={autoDetectZones}
            disabled={!frame}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            자동 감지(침대/소파)
          </button>
          <button
            type="button"
            onClick={undoZone}
            disabled={zones.length === 0}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            마지막 취소
          </button>
          <button
            type="button"
            onClick={clearZones}
            disabled={zones.length === 0}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            모두 지우기
          </button>
        </div>
        {zones.length > 0 && (
          <p className="text-xs text-neutral-500">
            지정된 구역: {zones.map((z) => ZONE_META[z.zone].label).join(", ")}
          </p>
        )}
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
          {lastEvent.confirmation && (
            <p className="mt-2 text-sm text-purple-200">
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
