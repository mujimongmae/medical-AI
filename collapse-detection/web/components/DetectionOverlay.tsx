"use client";

// OWNER: overlay part. Canvas overlay drawing object boxes, pose skeleton,
// zones, and the status banner on top of the homecam <video>.
//
// Renders as an absolutely-positioned <canvas> that is a sibling of the
// <video>. The canvas backing store matches the *source* frame dimensions so
// all detector coordinates (which are in source pixels) map 1:1 while drawing.
// CSS then stretches the canvas to fill its container, keeping it aligned with
// the video which is likewise stretched (object-fit driven by the parent).

import { useEffect, useRef } from "react";
import type {
  CollapseState,
  DetectedObject,
  DetectionFrame,
  Keypoint,
  Pose,
} from "@/lib/types";
import { THRESHOLDS } from "@/lib/types";
import type { ZoneRect } from "@/lib/zone-map";

export interface DetectionOverlayProps {
  /** Latest detection result to render (null before first frame). */
  frame: DetectionFrame | null;
  /** Current collapse state, drives the banner color/text. */
  state: CollapseState;
  /** Configured zones to visualize. */
  zones?: ZoneRect[];
  /** Intrinsic source dimensions for coordinate scaling. */
  sourceWidth: number;
  sourceHeight: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Drawing constants (in source-pixel units so they scale with the frame).
// ---------------------------------------------------------------------------

/**
 * Skeleton edges by keypoint name. The base set is COCO-17; the extra edges
 * light up when the BlazePose-33 landmarks are present (hands, feet, mouth) so
 * the skeleton reads denser. Edges referencing a missing keypoint are skipped
 * automatically by the renderer, so mixing both sets is safe.
 */
const SKELETON_EDGES: ReadonlyArray<readonly [string, string]> = [
  // Face
  ["left_ear", "left_eye"],
  ["left_eye", "nose"],
  ["nose", "right_eye"],
  ["right_eye", "right_ear"],
  // Arms
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  // Shoulders / torso
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  // Legs
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  // --- BlazePose-33 extras (skipped when keypoints are absent) ---
  // Mouth
  ["mouth_left", "mouth_right"],
  // Left hand
  ["left_wrist", "left_thumb"],
  ["left_wrist", "left_index"],
  ["left_wrist", "left_pinky"],
  ["left_index", "left_pinky"],
  // Right hand
  ["right_wrist", "right_thumb"],
  ["right_wrist", "right_index"],
  ["right_wrist", "right_pinky"],
  ["right_index", "right_pinky"],
  // Left foot
  ["left_ankle", "left_heel"],
  ["left_heel", "left_foot_index"],
  ["left_ankle", "left_foot_index"],
  // Right foot
  ["right_ankle", "right_heel"],
  ["right_heel", "right_foot_index"],
  ["right_ankle", "right_foot_index"],
];

/** Zone stroke/fill colors. */
const ZONE_STYLE: Record<ZoneRect["zone"], string> = {
  floor: "#f59e0b", // amber — suspicious surface
  bed: "#60a5fa", // blue — suppressive
  couch: "#a78bfa", // violet — suppressive
};

const ZONE_LABEL: Record<ZoneRect["zone"], string> = {
  floor: "바닥",
  bed: "침대",
  couch: "소파",
};

interface BannerStyle {
  text: string;
  bg: string;
  /** When true, banner opacity pulses (blink). */
  blink: boolean;
}

/** Maps a collapse state to its banner appearance. */
function bannerFor(state: CollapseState): BannerStyle {
  switch (state) {
    case "NORMAL":
      return { text: "정상", bg: "#16a34a", blink: false }; // green
    case "SUSPECTED":
      return { text: "쓰러짐 의심", bg: "#f59e0b", blink: false }; // orange
    case "DOWN":
    case "IMMOBILE_CONFIRM":
    case "CANDIDATE_EMITTED":
      return { text: "쓰러짐!", bg: "#dc2626", blink: true }; // red, blinking
    default:
      return { text: "정상", bg: "#16a34a", blink: false };
  }
}

/** Finds the highest-confidence "person" object, if any. */
function findPerson(objects: DetectedObject[]): DetectedObject | null {
  let best: DetectedObject | null = null;
  for (const o of objects) {
    if (o.class !== "person") continue;
    if (best === null || o.score > best.score) best = o;
  }
  return best;
}

function keypointMap(pose: Pose): Map<string, Keypoint> {
  const m = new Map<string, Keypoint>();
  for (const k of pose.keypoints) m.set(k.name, k);
  return m;
}

// ---------------------------------------------------------------------------
// Component.
// ---------------------------------------------------------------------------

/**
 * Absolutely-positioned canvas overlay. Render it as a sibling on top of the
 * <video> inside a `relative` container.
 */
export default function DetectionOverlay({
  frame,
  state,
  zones,
  sourceWidth,
  sourceHeight,
  className,
}: DetectionOverlayProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Drives the blink phase without re-rendering React on every frame.
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The frame's own dimensions win (they reflect the actual analyzed image);
    // fall back to the declared source size before the first frame arrives.
    const w = frame?.width || sourceWidth || canvas.width || 1;
    const h = frame?.height || sourceHeight || canvas.height || 1;

    // Keep the backing store at source resolution so detector coords map 1:1.
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    // Scale line widths / fonts with the frame so they read at any resolution.
    const unit = Math.max(1, Math.round(Math.min(w, h) / 240));

    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      ctx.clearRect(0, 0, w, h);

      // 1) Zones (drawn first, underneath everything).
      if (zones && zones.length > 0) {
        for (const z of zones) {
          const [zx, zy, zw, zh] = z.bbox;
          const color = ZONE_STYLE[z.zone];
          ctx.save();
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = color;
          ctx.fillRect(zx, zy, zw, zh);
          ctx.globalAlpha = 1;
          ctx.setLineDash([unit * 6, unit * 4]);
          ctx.lineWidth = unit;
          ctx.strokeStyle = color;
          ctx.strokeRect(zx, zy, zw, zh);
          ctx.setLineDash([]);
          drawLabel(ctx, ZONE_LABEL[z.zone], zx + unit * 2, zy + unit * 2, {
            bg: color,
            fg: "#ffffff",
            unit,
            anchor: "top",
          });
          ctx.restore();
        }
      }

      const person = frame ? findPerson(frame.objects) : null;

      // 2) Object boxes + labels (skip person; drawn specially below).
      if (frame) {
        for (const o of frame.objects) {
          if (o === person) continue;
          if (o.score < THRESHOLDS.MIN_OBJECT_SCORE) continue;
          const [ox, oy, ow, oh] = o.bbox;
          ctx.save();
          ctx.lineWidth = unit;
          ctx.strokeStyle = "#38bdf8"; // sky
          ctx.strokeRect(ox, oy, ow, oh);
          drawLabel(
            ctx,
            `${o.class} ${(o.score * 100).toFixed(0)}%`,
            ox,
            oy,
            { bg: "#0284c7", fg: "#ffffff", unit, anchor: "above" },
          );
          ctx.restore();
        }
      }

      // 3) Pose skeleton (drawn over the person region).
      if (frame?.pose && frame.pose.score >= THRESHOLDS.MIN_POSE_SCORE) {
        drawSkeleton(ctx, frame.pose, unit);
      }

      // 4) Person box + status banner anchored to it.
      const banner = bannerFor(state);
      // Blink: only the red critical banner pulses.
      const alpha = banner.blink
        ? 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 300))
        : 1;

      if (person) {
        const [px, py, pw, ph] = person.bbox;
        ctx.save();
        ctx.lineWidth = unit * 1.5;
        ctx.strokeStyle = banner.bg;
        ctx.globalAlpha = alpha;
        ctx.strokeRect(px, py, pw, ph);
        ctx.globalAlpha = 1;
        ctx.restore();

        drawBanner(ctx, banner, alpha, px, py, pw, unit);
      } else {
        // No person detected: still surface the state top-center as a fallback.
        drawBanner(ctx, banner, alpha, w / 2 - w * 0.15, unit * 4, w * 0.3, unit);
      }

      if (banner.blink) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [frame, state, zones, sourceWidth, sourceHeight]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={
        "pointer-events-none absolute inset-0 h-full w-full" +
        (className ? " " + className : "")
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Low-level drawing helpers.
// ---------------------------------------------------------------------------

/** Visual-only keypoint threshold (lower than the detection threshold) so more
 *  markers are drawn. Detection logic still uses THRESHOLDS.MIN_KEYPOINT_SCORE. */
const RENDER_KP_MIN = 0.2;

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  unit: number,
): void {
  const kp = keypointMap(pose);
  const solid = THRESHOLDS.MIN_KEYPOINT_SCORE;

  ctx.save();
  ctx.lineCap = "round";

  // Edges — full strength when both ends are confident, faint when marginal.
  for (const [a, b] of SKELETON_EDGES) {
    const ka = kp.get(a);
    const kb = kp.get(b);
    if (!ka || !kb) continue;
    const lo = Math.min(ka.score, kb.score);
    if (lo < RENDER_KP_MIN) continue;
    ctx.globalAlpha = lo >= solid ? 1 : 0.4;
    ctx.lineWidth = unit * 1.4;
    ctx.strokeStyle = "#22d3ee"; // cyan
    ctx.beginPath();
    ctx.moveTo(ka.x, ka.y);
    ctx.lineTo(kb.x, kb.y);
    ctx.stroke();
  }

  // Joints — every keypoint above the (lower) render threshold, with a white
  // outline for contrast. Confident joints solid + larger; marginal ones dim.
  ctx.lineWidth = Math.max(1, unit * 0.5);
  for (const k of pose.keypoints) {
    if (k.score < RENDER_KP_MIN) continue;
    const confident = k.score >= solid;
    ctx.globalAlpha = confident ? 1 : 0.5;
    ctx.beginPath();
    ctx.arc(k.x, k.y, unit * (confident ? 1.9 : 1.3), 0, Math.PI * 2);
    ctx.fillStyle = confident ? "#fbbf24" : "#f59e0b"; // amber / dim amber
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  banner: BannerStyle,
  alpha: number,
  personX: number,
  personY: number,
  personW: number,
  unit: number,
): void {
  const fontPx = Math.max(unit * 7, 12);
  ctx.save();
  ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const padX = unit * 3;
  const padY = unit * 2;
  const tw = ctx.measureText(banner.text).width;
  const bw = tw + padX * 2;
  const bh = fontPx + padY * 2;

  // Center the banner over the person box, clamped inside the canvas.
  let bx = personX + personW / 2 - bw / 2;
  let by = personY - bh - unit * 2;
  if (by < 0) by = personY + unit * 2; // flip below if it would clip the top
  bx = Math.max(0, Math.min(bx, ctx.canvas.width - bw));

  ctx.globalAlpha = alpha;
  ctx.fillStyle = banner.bg;
  roundRect(ctx, bx, by, bw, bh, unit * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(banner.text, bx + padX, by + bh / 2);
  ctx.restore();
}

interface LabelOpts {
  bg: string;
  fg: string;
  unit: number;
  /** "above" places the label above (x,y); "top"/"below" places it below. */
  anchor: "above" | "top" | "below";
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: LabelOpts,
): void {
  const { bg, fg, unit, anchor } = opts;
  const fontPx = Math.max(unit * 4, 10);
  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const padX = unit;
  const padY = unit * 0.6;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = fontPx + padY * 2;
  let by = y;
  if (anchor === "above") by = y - bh;
  if (by < 0) by = y; // clamp into view
  const bx = Math.max(0, Math.min(x, ctx.canvas.width - bw));

  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = fg;
  ctx.fillText(text, bx + padX, by + padY);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
