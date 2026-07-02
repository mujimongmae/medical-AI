// OWNER: state-machine part. Consumes DetectionFrames, emits collapse candidates.
// Rules (screening/07): primary axis = abrupt transition; zone + immobility assist.
// NORMAL → SUSPECTED → DOWN → IMMOBILE_CONFIRM → CANDIDATE_EMITTED (recover → NORMAL).
//
// Signal model (all thresholds from types.ts THRESHOLDS):
//  1. drop     — hip-center vertical fall speed, normalized by body height (px)/sec.
//  2. torsoFlip— torso angle goes vertical (upright) → horizontal within the window.
//  3. aspectFlip— person bbox aspect (w/h) crosses upright-max → horizontal-min.
//  "다수충족" (≥2 of 3) ⇒ transition = "abrupt"; otherwise "gradual".
//  Zone assist: bed/couch suppress emission, floor raises severity.
//  Immobility assist: after DOWN, per-frame hip movement must stay under the
//  normalized threshold for IMMOBILE_SECONDS to confirm a candidate.

import type {
  BBox,
  CollapseState,
  DetectionFrame,
  EmergencyEvent,
  Keypoint,
  Posture,
  TransitionKind,
  Zone,
} from "@/lib/types";
import { THRESHOLDS } from "@/lib/types";
import type { ZoneRect } from "@/lib/zone-map";

/**
 * The subset of thresholds a user can tune live from the UI. Every field is
 * optional; unset fields fall back to the THRESHOLDS defaults. Read every frame
 * (via config.getThresholds) so a slider change takes effect immediately with
 * no machine re-creation / state reset.
 */
export interface TunableThresholds {
  /** Net hip descent (× body height) required — ↑ stricter (must fall more). */
  dropDescent?: number;
  /** Bbox aspect (w/h) counted as "down" — ↑ stricter (must spread wider). */
  aspectHorizontalMin?: number;
  /** Torso angle (deg) counted as horizontal — ↑ stricter (must lie flatter). */
  torsoHorizontalDeg?: number;
  /** Seconds immobile before emitting — ↑ stricter (must stay still longer). */
  immobileSeconds?: number;
}

export interface StateMachineConfig {
  cameraId: string;
  /** User-drawn zones for bed/couch suppression + floor suspicion. */
  zones: ZoneRect[];
  /** Called when a candidate is emitted (wire to event-bus.emitEmergencyEvent). */
  onCandidate: (event: EmergencyEvent) => void;
  /** Optional: capture a keyframe data URL at emission time. */
  captureKeyframe?: () => string | undefined;
  /** Optional live-tunable thresholds; read every frame for instant feedback. */
  getThresholds?: () => TunableThresholds;
}

/**
 * Live diagnostic snapshot of the last processed frame — drives the on-screen
 * debug HUD so we can SEE which gate is (not) firing during a fall instead of
 * guessing at thresholds.
 */
export interface CollapseDebug {
  state: CollapseState;
  /** A confident pose+hip was found this frame (false ⇒ machine is holding). */
  hasPose: boolean;
  posture: Posture;
  /** Torso angle from vertical (deg); -1 when no shoulder keypoint. */
  torsoAngle: number;
  /** Person bbox aspect (w/h). */
  aspect: number;
  /** Net downward hip travel over the window, normalized by body height. */
  netDrop: number;
  /** netDrop ≥ DROP_DESCENT_NORMALIZED. */
  dropSignal: boolean;
  /** Bbox is as wide as tall or wider (aspect ≥ ASPECT_RATIO_HORIZONTAL_MIN). */
  aspectWide: boolean;
  /** Torso rotated upright→horizontal within the window. */
  torsoFlip: boolean;
  /** Body ended in a down-ish configuration (horizontal torso OR wide bbox). */
  endedDown: boolean;
  /** Seconds immobile while DOWN (0 otherwise). */
  immobileSec: number;
}

export interface CollapseStateMachine {
  /** Feed one detection frame; advances the state machine. */
  update: (frame: DetectionFrame) => void;
  /** Current state (for UI banner). */
  getState: () => CollapseState;
  /** Live diagnostic snapshot for the debug HUD. */
  getDebug: () => CollapseDebug;
  /** Reset to NORMAL (e.g. after app-side cancel). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Per-frame geometric features derived from a DetectionFrame. `null` when the
// frame lacks a confident pose / hip keypoints (we simply skip such frames).
// ---------------------------------------------------------------------------

interface FrameFeatures {
  /** Timestamp in seconds. */
  t: number;
  /** Hip-center (midpoint of left/right hip). */
  hip: { x: number; y: number };
  posture: Posture;
  /** Torso angle from vertical in degrees (0 = upright, 90 = flat). -1 if no shoulder. */
  torsoAngle: number;
  /** Person bbox aspect ratio (w / h). */
  aspect: number;
  /** Person bbox in source pixels. */
  bbox: BBox;
  /** Normalization scale = larger bbox dimension (~body length). */
  bodyHeight: number;
}

interface DownContext {
  transition: TransitionKind;
  zone: Zone;
  /** Wall time (s) the immobile timer started (resets on movement). */
  immobileSince: number;
  /** Hip position of the previous frame, for per-frame displacement. */
  prevHip: { x: number; y: number };
}

const {
  DROP_SPEED_NORMALIZED,
  DROP_DESCENT_NORMALIZED,
  TORSO_HORIZONTAL_DEG,
  TORSO_UPRIGHT_DEG,
  TRANSITION_WINDOW_FRAMES,
  ASPECT_RATIO_UPRIGHT_MAX,
  ASPECT_RATIO_HORIZONTAL_MIN,
  IMMOBILE_SECONDS,
  IMMOBILE_MOVEMENT_NORMALIZED,
  MIN_POSE_SCORE,
  MIN_OBJECT_SCORE,
  MIN_KEYPOINT_SCORE,
} = THRESHOLDS;

const HISTORY_MAX = TRANSITION_WINDOW_FRAMES + 5;

// ---------------------------------------------------------------------------
// Small geometry helpers.
// ---------------------------------------------------------------------------

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Point-in-rect zone lookup (local copy; zone-map owns the shared version). */
function classifyZoneLocal(
  point: { x: number; y: number },
  zones: ZoneRect[],
): Zone {
  let match: Zone = "unknown";
  for (const z of zones) {
    const [x, y, w, h] = z.bbox;
    if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) {
      match = z.zone; // last match wins
    }
  }
  return match;
}

function genId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Feature extraction.
// ---------------------------------------------------------------------------

function kpMap(keypoints: Keypoint[]): Map<string, Keypoint> {
  const m = new Map<string, Keypoint>();
  for (const kp of keypoints) {
    if (kp.score >= MIN_KEYPOINT_SCORE) m.set(kp.name, kp);
  }
  return m;
}

/** Midpoint of a left/right keypoint pair; falls back to whichever is present. */
function pairCenter(
  m: Map<string, Keypoint>,
  left: string,
  right: string,
): { x: number; y: number } | null {
  const l = m.get(left);
  const r = m.get(right);
  if (l && r) return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
  if (l) return { x: l.x, y: l.y };
  if (r) return { x: r.x, y: r.y };
  return null;
}

/** Bounding box over all confident keypoints. */
function keypointBBox(m: Map<string, Keypoint>): BBox | null {
  if (m.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const kp of m.values()) {
    minX = Math.min(minX, kp.x);
    minY = Math.min(minY, kp.y);
    maxX = Math.max(maxX, kp.x);
    maxY = Math.max(maxY, kp.y);
  }
  return [minX, minY, maxX - minX, maxY - minY];
}

function extractFeatures(
  frame: DetectionFrame,
  horizontalDeg: number,
): FrameFeatures | null {
  const pose = frame.pose;
  if (!pose || pose.score < MIN_POSE_SCORE) return null;

  const m = kpMap(pose.keypoints);
  const hip = pairCenter(m, "left_hip", "right_hip");
  if (!hip) return null; // no hip-center ⇒ cannot track collapse geometry

  const shoulder = pairCenter(m, "left_shoulder", "right_shoulder");

  // Prefer the COCO-SSD person box (fuller extent); fall back to keypoint box.
  let bbox: BBox | null = null;
  let bestScore: number = MIN_OBJECT_SCORE;
  for (const o of frame.objects) {
    if (o.class === "person" && o.score >= bestScore) {
      bbox = o.bbox;
      bestScore = o.score;
    }
  }
  if (!bbox) bbox = keypointBBox(m);
  if (!bbox) return null;

  const [, , bw, bh] = bbox;
  const bodyHeight = Math.max(Math.abs(bw), Math.abs(bh)) || 1;
  const aspect = bh !== 0 ? Math.abs(bw) / Math.abs(bh) : Infinity;

  // Torso angle from vertical: 0° = perfectly upright, 90° = flat.
  let posture: Posture = "unknown";
  let torsoAngle = -1;
  if (shoulder) {
    const dx = Math.abs(hip.x - shoulder.x);
    const dy = Math.abs(hip.y - shoulder.y);
    torsoAngle = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (torsoAngle <= TORSO_UPRIGHT_DEG) posture = "upright";
    else if (torsoAngle >= horizontalDeg) posture = "horizontal";
  }
  // Aspect only rescues the UPRIGHT case (a narrow box is unambiguously
  // standing). A WIDE box is NOT trusted as horizontal here — that corroboration
  // happens in evaluateTransition, gated by a real descent (a close-up face
  // widens the box but has no descent). "horizontal" comes from the torso angle
  // (shoulder→hip), which is distance-invariant.
  if (posture === "unknown" && aspect <= ASPECT_RATIO_UPRIGHT_MAX) {
    posture = "upright";
  }

  return { t: frame.timestamp / 1000, hip, posture, torsoAngle, aspect, bbox, bodyHeight };
}

// ---------------------------------------------------------------------------
// State machine.
// ---------------------------------------------------------------------------

export function createCollapseStateMachine(
  config: StateMachineConfig,
): CollapseStateMachine {
  let state: CollapseState = "NORMAL";
  let history: FrameFeatures[] = [];
  let down: DownContext | null = null;
  let suspectedFrames = 0;

  // Live diagnostic of the last processed frame (drives the debug HUD).
  let lastDebug: CollapseDebug = {
    state: "NORMAL",
    hasPose: false,
    posture: "unknown",
    torsoAngle: -1,
    aspect: 0,
    netDrop: 0,
    dropSignal: false,
    aspectWide: false,
    torsoFlip: false,
    endedDown: false,
    immobileSec: 0,
  };

  /** Merge live-tunable thresholds over the compiled defaults (read per frame). */
  function resolveTH() {
    const o = config.getThresholds?.() ?? {};
    return {
      dropDescent: o.dropDescent ?? DROP_DESCENT_NORMALIZED,
      aspectHorizontalMin: o.aspectHorizontalMin ?? ASPECT_RATIO_HORIZONTAL_MIN,
      torsoHorizontalDeg: o.torsoHorizontalDeg ?? TORSO_HORIZONTAL_DEG,
      immobileSeconds: o.immobileSeconds ?? IMMOBILE_SECONDS,
    };
  }
  type TH = ReturnType<typeof resolveTH>;

  interface TransitionEval {
    /** Net downward hip travel over the window, normalized by body height. */
    netDrop: number;
    /** netDrop ≥ drop threshold (a real descent occurred). */
    dropSignal: boolean;
    /** The descent was fast (single-frame velocity) ⇒ classify as abrupt. */
    velocityAbrupt: boolean;
    /** Torso went vertical→horizontal within the window (a genuine flip). */
    torsoFlip: boolean;
    /** Current bbox is as wide as tall or wider (aspect ≥ threshold). */
    aspectWide: boolean;
    /** Body ended down: torso reads horizontal OR the bbox went wide. */
    endedDown: boolean;
  }

  /**
   * Motion-first fall signature over the recent window:
   *  - dropSignal: NET downward hip travel (max later-minus-earlier), normalized
   *    by body height. A single jittery spike that returns nets ~0, so this is
   *    robust to keypoint noise (unlike per-frame velocity).
   *  - endedDown: the body is no longer standing — EITHER the torso angle reads
   *    horizontal (a sideways fall) OR the bbox went as-wide-as-tall (a fall
   *    toward/away from the camera keeps the torso vertical in 2D but spreads
   *    the box). Direction-robust, unlike torso angle alone.
   *  A fall requires dropSignal AND endedDown. Neither fires on a static pose or
   *  a close-up face (no descent), so those never trigger.
   */
  function evaluateTransition(th: TH): TransitionEval {
    const win = history.slice(-TRANSITION_WINDOW_FRAMES);
    const cur = win[win.length - 1];

    // Net descent: largest drop from any earlier low point to a later frame.
    let minY = win[0].hip.y;
    let netDrop = 0;
    for (const fr of win) {
      netDrop = Math.max(netDrop, (fr.hip.y - minY) / cur.bodyHeight);
      minY = Math.min(minY, fr.hip.y);
    }

    // Fast single-frame descent ⇒ abrupt (drives severity, not the gate).
    let velocityAbrupt = false;
    for (let i = 1; i < win.length; i++) {
      const dt = win[i].t - win[i - 1].t;
      if (dt > 0) {
        const v = (win[i].hip.y - win[i - 1].hip.y) / dt / win[i].bodyHeight;
        if (v >= DROP_SPEED_NORMALIZED) velocityAbrupt = true;
      }
    }

    // Torso orientation flip (vertical → horizontal) somewhere in the window.
    let torsoFlip = false;
    for (let i = 0; i < win.length - 1; i++) {
      if (win[i].posture === "upright" && cur.posture === "horizontal") {
        torsoFlip = true;
        break;
      }
    }

    const aspectWide = cur.aspect >= th.aspectHorizontalMin;
    const endedDown = cur.posture === "horizontal" || aspectWide;

    return {
      netDrop,
      dropSignal: netDrop >= th.dropDescent,
      velocityAbrupt,
      torsoFlip,
      aspectWide,
      endedDown,
    };
  }

  function toNormal(): void {
    state = "NORMAL";
    down = null;
    suspectedFrames = 0;
    // Clear the transition window on recovery: a resolved fall (e.g. a person
    // who went down then stood back up) must not leave a stale drop/flip signal
    // lingering in the window to re-trigger suspicion frame after frame.
    history = [];
  }

  /** Enter the DOWN path unless a bed/couch zone suppresses it. */
  function enterDown(f: FrameFeatures, ev: TransitionEval): void {
    const zone = classifyZoneLocal(f.hip, config.zones);
    if (zone === "bed" || zone === "couch") {
      // Suppressed: lying down in bed/couch is expected, not an emergency.
      toNormal();
      return;
    }
    state = "DOWN";
    down = {
      transition: ev.velocityAbrupt ? "abrupt" : "gradual",
      zone,
      immobileSince: f.t,
      prevHip: f.hip,
    };
    suspectedFrames = 0;
  }

  function emit(f: FrameFeatures, immobileSeconds: number): void {
    if (!down) return;
    const severity =
      down.transition === "abrupt" && down.zone === "floor"
        ? "critical"
        : "suspected";
    const event: EmergencyEvent = {
      eventId: genId(),
      timestamp: new Date().toISOString(),
      cameraId: config.cameraId,
      status: "candidate",
      severity,
      personBbox: f.bbox,
      signals: {
        transition: down.transition,
        zone: down.zone,
        immobileSeconds: Math.round(immobileSeconds),
        posture: f.posture === "unknown" ? "horizontal" : f.posture,
      },
      keyframeDataUrl: config.captureKeyframe?.(),
    };
    state = "CANDIDATE_EMITTED";
    config.onCandidate(event);
  }

  /** Immobility bookkeeping while the person is DOWN. Returns seconds immobile. */
  function immobileStep(f: FrameFeatures, th: TH): number {
    if (!down) return 0;
    // Standing back up = recovery, regardless of the timer.
    if (f.posture === "upright") {
      toNormal();
      return 0;
    }
    const disp = dist(f.hip, down.prevHip) / f.bodyHeight;
    down.prevHip = f.hip;
    if (disp > IMMOBILE_MOVEMENT_NORMALIZED) {
      down.immobileSince = f.t; // moved ⇒ restart the immobile timer
    }
    const duration = f.t - down.immobileSince;
    if (duration >= th.immobileSeconds) emit(f, duration);
    return duration;
  }

  function update(frame: DetectionFrame): void {
    if (state === "CANDIDATE_EMITTED") return; // terminal until reset()

    const th = resolveTH();
    const f = extractFeatures(frame, th.torsoHorizontalDeg);
    if (!f) {
      // No reliable pose this frame; hold state, but flag it in the HUD so the
      // user can see the pose was lost (a common cause of "nothing triggers").
      lastDebug = { ...lastDebug, state, hasPose: false };
      return;
    }

    history.push(f);
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);

    const ev = evaluateTransition(th);
    let immobileSec = 0;

    switch (state) {
      case "NORMAL": {
        // A fall needs a real descent (dropSignal) AND an "ended down" signal
        // (torso horizontal OR bbox went wide). Static posture, bbox aspect, or
        // hip jitter alone never trigger — a still person (even close to the
        // camera) has no descent, so endedDown can't rescue it.
        if (ev.dropSignal && ev.endedDown) {
          enterDown(f, ev);
        } else if (ev.dropSignal) {
          state = "SUSPECTED"; // descending — wait for the "ended down" signal
          suspectedFrames = 0;
        }
        break;
      }
      case "SUSPECTED": {
        // Descent already seen; confirm it ends down (horizontal OR wide box).
        suspectedFrames++;
        if (ev.endedDown) {
          enterDown(f, ev);
        } else if (f.posture === "upright") {
          toNormal();
        } else if (suspectedFrames > TRANSITION_WINDOW_FRAMES) {
          toNormal();
        }
        break;
      }
      case "DOWN": {
        state = "IMMOBILE_CONFIRM";
        immobileSec = immobileStep(f, th);
        break;
      }
      case "IMMOBILE_CONFIRM": {
        immobileSec = immobileStep(f, th);
        break;
      }
    }

    lastDebug = {
      state,
      hasPose: true,
      posture: f.posture,
      torsoAngle: f.torsoAngle,
      aspect: f.aspect,
      netDrop: ev.netDrop,
      dropSignal: ev.dropSignal,
      aspectWide: ev.aspectWide,
      torsoFlip: ev.torsoFlip,
      endedDown: ev.endedDown,
      immobileSec,
    };
  }

  return {
    update,
    getState: () => state,
    getDebug: () => lastDebug,
    reset: () => {
      state = "NORMAL";
      history = [];
      down = null;
      suspectedFrames = 0;
    },
  };
}
