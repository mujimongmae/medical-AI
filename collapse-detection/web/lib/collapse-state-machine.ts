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
  /**
   * Optional: fired the instant the machine commits to DOWN (the fall just
   * completed, BEFORE the immobility wait). Lets the caller snapshot the recent
   * keypoint buffer for the temporal model (Layer 2 ST-GCN) while the ballistic
   * descent is still the most-recent motion — instead of slicing it later at
   * emit time, when it would be diluted by seconds of post-fall stillness.
   */
  onDown?: () => void;
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
  /** Vertical span collapsed to ≤ ratio of the recent tallest (went to ground). */
  verticalCollapse: boolean;
  /** Current vertical span ÷ recent tallest span (1 = still tall, →0 = collapsed). */
  heightRatio: number;
  /** Body ended down: torso horizontal OR vertical-collapse. */
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
  /**
   * Promote a VERIFYING down-state to a confirmed alarm (CANDIDATE_EMITTED).
   * Called by the caller after Layer 2 (ST-GCN) confirms an actual fall action.
   * No-op unless currently VERIFYING.
   */
  confirm: () => void;
  /** Reset to NORMAL (e.g. after app-side cancel or a suppressed non-fall). */
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
  /** Vertical pixel span of the confident keypoints (head→foot extent). */
  vSpan: number;
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
  VERTICAL_COLLAPSE_RATIO,
  ASPECT_RATIO_UPRIGHT_MAX,
  ASPECT_RATIO_HORIZONTAL_MIN,
  IMMOBILE_SECONDS,
  IMMOBILE_MOVEMENT_NORMALIZED,
  MIN_POSE_SCORE,
  MIN_OBJECT_SCORE,
  MIN_KEYPOINT_SCORE,
} = THRESHOLDS;

/** Transition window in SECONDS (video/wall time) — NOT a frame count, so the
 *  descent signal is consistent regardless of analysis fps or playback rate.
 *  (A frame-count window shrank in video-time when playback slowed, breaking ①.) */
const WINDOW_SECONDS = 1.2;
const HISTORY_MAX = 120; // holds > WINDOW_SECONDS even at 60fps analysis

/** A detected descent stays "recent" for this many frames, so the drop and the
 *  down-pose needn't land on the exact same (noisy) frame to latch into DOWN. */
const DESCENT_STICKY_FRAMES = 30;

/** Consecutive genuinely-recovered frames required to leave the DOWN latch —
 *  debounces noise so a floor twitch never kicks the machine out. */
const RECOVER_FRAMES = 6;

/** Recovery requires the person back near full standing height (span ÷ standing).
 *  A person struggling/slumped on the floor stays well below this, so twitches
 *  and partial sit-ups do NOT count as recovery. */
const STANDING_RECOVER_RATIO = 0.8;

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

  // Vertical extent of the confident keypoints (head→foot in image px). Shrinks
  // sharply when the body goes to the ground — the basis for vertical-collapse
  // detection, which is view-invariant (works even when the torso angle can't
  // read horizontal, e.g. a high-angle CCTV fall away from the camera).
  let minKY = Infinity;
  let maxKY = -Infinity;
  for (const kp of m.values()) {
    if (kp.y < minKY) minKY = kp.y;
    if (kp.y > maxKY) maxKY = kp.y;
  }
  const vSpan = maxKY > minKY ? maxKY - minKY : bodyHeight;

  return {
    t: frame.timestamp / 1000,
    hip,
    posture,
    torsoAngle,
    aspect,
    vSpan,
    bbox,
    bodyHeight,
  };
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
  // Persistent down-state tracking (robust to per-frame pose noise).
  let standingSpan = 0; // EMA of vertical span while upright (the "tall" ref)
  let descentTtl = 0; // frames remaining where a descent counts as "recent"
  let upFrames = 0; // consecutive NOT-down frames (for debounced recovery)
  let lastF: FrameFeatures | null = null; // last frame with a valid pose

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
    verticalCollapse: false,
    heightRatio: 1,
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
  }

  /**
   * Window-based motion signals (transitions). The DOWN-state latch itself lives
   * in update() using PERSISTENT signals (standingSpan / isDown), because these
   * window signals are transient — they light up only while the window straddles
   * the standing→down transition, then decay once it fills with down frames.
   *  - dropSignal: NET downward hip travel over the window, normalized by body
   *    height. Robust to single-frame jitter (a spike that returns nets ~0).
   *  - velocityAbrupt / torsoFlip / aspectWide: severity + HUD hints.
   */
  function evaluateTransition(th: TH): TransitionEval {
    // Time-based window: all frames within the last WINDOW_SECONDS of video time.
    const cur = history[history.length - 1];
    const cutoff = cur.t - WINDOW_SECONDS;
    let start = history.length - 1;
    while (start > 0 && history[start - 1].t >= cutoff) start--;
    const win = history.slice(start);

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

    return {
      netDrop,
      dropSignal: netDrop >= th.dropDescent,
      velocityAbrupt,
      torsoFlip,
      aspectWide,
    };
  }

  function toNormal(): void {
    state = "NORMAL";
    down = null;
    descentTtl = 0;
    upFrames = 0;
    // Clear the transition window on recovery: a resolved fall (e.g. a person
    // who went down then stood back up) must not leave a stale drop/flip signal
    // lingering in the window to re-trigger suspicion frame after frame.
    // NOTE: standingSpan is intentionally kept (it's a scene property).
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
    upFrames = 0;
    // Fall just completed — let the caller snapshot the keypoint buffer NOW,
    // while the descent is the freshest motion (see StateMachineConfig.onDown).
    config.onDown?.();
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
    // Down-state confirmed by the heuristic. Do NOT alarm yet — halt in
    // VERIFYING and hand off to the caller, which runs Layer 2 (ST-GCN) to
    // decide whether an actual fall ACTION occurred. The caller then calls
    // confirm() (→ alarm) or reset() (→ suppress, back to NORMAL).
    state = "VERIFYING";
    config.onCandidate(event);
  }

  /**
   * Immobility bookkeeping while the person is DOWN. Returns seconds immobile.
   *  - Recovery: only when GENUINELY stood back up (recovered) for RECOVER_FRAMES
   *    consecutive frames. A floor twitch / partial sit-up (still low) does NOT
   *    recover, so the machine keeps watching for the post-twitch stillness.
   *  - Immobility: measured as NET displacement from an ANCHOR (where the person
   *    settled), not frame-to-frame — so per-frame keypoint jitter stays within
   *    tolerance and the timer actually accumulates, while a real move (the
   *    twitch) re-anchors and restarts it. This is exactly "twitch → reset →
   *    then measure the final stillness".
   */
  function immobileStep(f: FrameFeatures, th: TH, recovered: boolean): number {
    if (!down) return 0;
    if (recovered) {
      upFrames++;
      if (upFrames >= RECOVER_FRAMES) {
        toNormal();
        return 0;
      }
    } else {
      upFrames = 0;
    }
    const disp = dist(f.hip, down.prevHip) / f.bodyHeight;
    if (disp > IMMOBILE_MOVEMENT_NORMALIZED) {
      down.prevHip = f.hip; // re-anchor at the new resting spot
      down.immobileSince = f.t; // moved ⇒ restart the immobile timer
    }
    const duration = f.t - down.immobileSince;
    if (duration >= th.immobileSeconds) emit(f, duration);
    return duration;
  }

  function update(frame: DetectionFrame): void {
    // Halted while the caller runs Layer 2 (ST-GCN) + decides. No processing.
    if (state === "VERIFYING") return;

    const th = resolveTH();
    const f = extractFeatures(frame, th.torsoHorizontalDeg);
    if (!f) {
      // Pose lost. During an ACTIVE down episode this is NOT recovery — the
      // person is still on the floor (often harder to detect BECAUSE they're
      // lying, or the clip is paused/ended). Keep the immobility timer running on
      // wall-clock so "fall → pose lost → still" still confirms, using the last
      // valid frame for the emitted event.
      if (
        down &&
        lastF &&
        (state === "DOWN" || state === "IMMOBILE_CONFIRM")
      ) {
        if (state === "DOWN") state = "IMMOBILE_CONFIRM";
        const t = frame.timestamp / 1000;
        const duration = t - down.immobileSince; // no hip ⇒ assume still
        if (duration >= th.immobileSeconds) emit(lastF, duration);
        lastDebug = { ...lastDebug, state, hasPose: false, immobileSec: duration };
        return;
      }
      // Otherwise just hold, flagging the lost pose in the HUD.
      lastDebug = { ...lastDebug, state, hasPose: false };
      return;
    }

    lastF = f;
    history.push(f);
    if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);

    const ev = evaluateTransition(th);

    // --- Persistent down-state signals (robust to per-frame pose noise) ---
    // standingSpan: EMA of the vertical span while upright = "how tall standing".
    // Updated only while upright, so it stays frozen (a correct reference) during
    // the fall, yet adapts as the person walks nearer/farther.
    if (f.posture === "upright") {
      standingSpan =
        standingSpan === 0 ? f.vSpan : 0.85 * standingSpan + 0.15 * f.vSpan;
    }
    const heightRatio = standingSpan > 0 ? f.vSpan / standingSpan : 1;
    const collapsed = standingSpan > 0 && heightRatio <= VERTICAL_COLLAPSE_RATIO;
    // isDown STAYS true the whole time the person is on the ground (unlike the
    // window-transient signals), so the machine can latch into DOWN and hold it.
    const isDown = f.posture === "horizontal" || collapsed;
    // "Recovered" = actually back on their feet: upright AND near full standing
    // height. A floor twitch / slump stays well below, so it never recovers.
    const recovered =
      f.posture === "upright" && heightRatio >= STANDING_RECOVER_RATIO;
    // A descent is "recent" for a while, so drop + down needn't be the same frame.
    if (ev.dropSignal) descentTtl = DESCENT_STICKY_FRAMES;
    else if (descentTtl > 0) descentTtl--;

    let immobileSec = 0;

    switch (state) {
      case "NORMAL": {
        // Latch into DOWN when a recent descent is followed by a down pose.
        // Only enter SUSPECTED while NOT upright — a descent that stays upright is
        // a sit/crouch (torso vertical), which must not linger as "suspected".
        if (descentTtl > 0 && isDown) enterDown(f, ev);
        else if (descentTtl > 0 && f.posture !== "upright") {
          state = "SUSPECTED"; // descending, not upright — awaiting the down pose
          upFrames = 0;
        }
        break;
      }
      case "SUSPECTED": {
        if (isDown) enterDown(f, ev);
        else if (f.posture === "upright" || descentTtl === 0) toNormal();
        break;
      }
      case "DOWN": {
        state = "IMMOBILE_CONFIRM";
        immobileSec = immobileStep(f, th, recovered);
        break;
      }
      case "IMMOBILE_CONFIRM": {
        immobileSec = immobileStep(f, th, recovered);
        break;
      }
      case "CANDIDATE_EMITTED": {
        // Recover only after the person GENUINELY stood back up for a sustained
        // period — never on a floor twitch — so the alarm doesn't clear early.
        if (recovered) {
          upFrames++;
          if (upFrames >= RECOVER_FRAMES) toNormal();
        } else {
          upFrames = 0;
        }
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
      // Sticky: reflects a recent descent, so the HUD ① doesn't flicker off the
      // instant the standing frames scroll out of the window.
      dropSignal: descentTtl > 0,
      aspectWide: ev.aspectWide,
      torsoFlip: ev.torsoFlip,
      verticalCollapse: collapsed,
      heightRatio,
      endedDown: isDown,
      immobileSec,
    };
  }

  return {
    update,
    getState: () => state,
    getDebug: () => lastDebug,
    confirm: () => {
      if (state === "VERIFYING") state = "CANDIDATE_EMITTED";
    },
    reset: () => {
      state = "NORMAL";
      history = [];
      down = null;
      descentTtl = 0;
      upFrames = 0;
      // Clear the standing-height reference too. This matters on a SCENE change
      // (camera → uploaded video): a tall "standing" span learned from a person
      // close to the camera must not leak into a video where the subject is
      // smaller, or vertical-collapse would fire spuriously. Re-learned within a
      // second of seeing an upright person.
      standingSpan = 0;
      lastF = null;
    },
  };
}
