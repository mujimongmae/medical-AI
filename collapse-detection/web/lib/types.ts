// ============================================================================
// Shared types & constants for the collapse-detection app.
//
// OWNERSHIP: This file is authored by Foundation. All other modules import from
// it read-only. Do NOT redefine these shapes elsewhere.
// ============================================================================

// ---------------------------------------------------------------------------
// Emergency event contract (crosses the detection → app boundary).
// Kept byte-identical to the shared契約 in the team spec.
// ---------------------------------------------------------------------------

/** Bounding box in pixel coordinates: [x, y, width, height]. */
export type BBox = [number, number, number, number];

/** How the person reached the down state. */
export type TransitionKind = "abrupt" | "gradual";

/** Physical zone the person's center is in (bed/couch suppress; floor suspects). */
export type Zone = "floor" | "bed" | "couch" | "unknown";

/** Coarse body orientation derived from the torso angle. */
export type Posture = "horizontal" | "upright" | "unknown";

/** Severity of a candidate emergency (suspected = watch, critical = act). */
export type Severity = "suspected" | "critical";

/**
 * A collapse *candidate* emitted by the detection pipeline. The detection part's
 * responsibility ends at emitting this. The app owns the cancel gate + 119 flow.
 */
export interface EmergencyEvent {
  eventId: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  cameraId: string;
  /** Detection only ever emits candidates; the app resolves them. */
  status: "candidate";
  severity: Severity;
  /** Person bounding box at the moment of emission. */
  personBbox: BBox;
  signals: {
    transition: TransitionKind;
    zone: Zone;
    immobileSeconds: number;
    posture: Posture;
  };
  /** Optional JPEG/PNG data URL keyframe for the app to show. */
  keyframeDataUrl?: string;
  /**
   * Optional second-stage confirmation. `source` is "claude" when a VLM/LLM
   * pass reviewed the keyframe, or "skipped" when confirmation was bypassed
   * (e.g. missing API key or fast-path demo). Fields describe the review.
   */
  confirmation?: {
    source: "claude" | "skipped";
    fallen: boolean;
    motionless: boolean;
    needsHelp: boolean;
    confidence: number;
    reason: string;
  };
  /**
   * Optional learned-model signal. The local ST-GCN (MultiScaleTCNAttn) service
   * scores the recent keypoint window for a fall action. `source` is
   * "local-stgcn" when scored, "skipped" when the backend is unreachable.
   */
  fallModel?: {
    source: "local-stgcn" | "skipped";
    probability: number;
    sustained: boolean;
  };
}

// ---------------------------------------------------------------------------
// Detection frame shapes (producer: detectors.ts, consumer: state machine /
// overlay). MoveNet SinglePose + COCO-SSD.
// ---------------------------------------------------------------------------

/** One detected object from COCO-SSD. */
export interface DetectedObject {
  class: string;
  score: number;
  bbox: BBox;
}

/** A single MoveNet keypoint. `name` follows the COCO-17 naming, e.g. "left_hip". */
export interface Keypoint {
  name: string;
  x: number;
  y: number;
  score: number;
}

/** MoveNet single-pose result for one frame. */
export interface Pose {
  keypoints: Keypoint[];
  /** Overall pose confidence. */
  score: number;
}

/** Everything the detectors produce for a single video frame. */
export interface DetectionFrame {
  /** Monotonic timestamp in ms (e.g. performance.now()). */
  timestamp: number;
  /** Source frame dimensions in pixels, for normalizing motion by body height. */
  width: number;
  height: number;
  objects: DetectedObject[];
  /** Null when no confident person pose was found this frame. */
  pose: Pose | null;
}

// ---------------------------------------------------------------------------
// State machine states (see collapse-state-machine.ts).
// ---------------------------------------------------------------------------

export type CollapseState =
  | "NORMAL"
  | "SUSPECTED"
  | "DOWN"
  | "IMMOBILE_CONFIRM"
  // Down-state confirmed + immobile; halted while Layer 2 (ST-GCN) decides
  // whether an actual fall ACTION occurred. No alarm yet (shown as "확인 중").
  | "VERIFYING"
  | "CANDIDATE_EMITTED";

// ---------------------------------------------------------------------------
// Tunable thresholds. Single source of truth for all detection heuristics.
// Values are demo-tuned; adjust here only.
// ---------------------------------------------------------------------------

export const THRESHOLDS = {
  /**
   * Abrupt-drop trigger: vertical fall speed of the hip-center, normalized by
   * body height (px) per second. e.g. 1.5 => center drops 1.5 body-heights/sec.
   */
  DROP_SPEED_NORMALIZED: 1.5,

  /**
   * Fall GATE: net downward travel of the hip-center over the window, as a
   * fraction of body height. Robust to single-frame jitter (a spike that
   * returns nets ~0). e.g. 0.20 => the hip fell ~a fifth of a body-height.
   * Webcam falls rarely show half a body-height of hip travel before the
   * person exits frame, so this is tuned low; a fall needs this descent AND
   * an "ended down" signal (torso horizontal OR wide bbox) — static posture,
   * a close-up face, or hip jitter alone never trigger.
   */
  DROP_DESCENT_NORMALIZED: 0.2,

  /** Torso angle (deg from vertical) above which the body counts as horizontal. */
  TORSO_HORIZONTAL_DEG: 60,

  /** Torso angle (deg from vertical) below which the body counts as upright. */
  TORSO_UPRIGHT_DEG: 30,

  /**
   * Vertical-collapse ratio: the body counts as "down" if the person's current
   * vertical pixel span (keypoint head→foot extent) drops to ≤ this fraction of
   * its recent tallest span in the window. Catches falls the torso ANGLE misses
   * (away/toward the camera, high-angle CCTV) WITHOUT firing on a standing
   * person close to the camera — who stays tall (ratio ~1). e.g. 0.6 => the body
   * became ≤60% of its recent standing height.
   */
  VERTICAL_COLLAPSE_RATIO: 0.6,

  /** Frame window over which the vertical→horizontal flip must occur. */
  TRANSITION_WINDOW_FRAMES: 25,

  /**
   * Aspect-ratio flip: person bbox (w/h). Standing ~<0.6; lying/collapsed
   * ~≥1.0 (as wide as tall or wider). Used ONLY to corroborate an "ended down"
   * state together with a real descent — a wide box alone (close-up face) never
   * triggers, because the descent gate must also fire.
   */
  ASPECT_RATIO_UPRIGHT_MAX: 0.6,
  ASPECT_RATIO_HORIZONTAL_MIN: 1.0,

  /**
   * Seconds the person must stay immobile after DOWN before handing off to the
   * ST-GCN verification (i.e. "fell, then ~2s still" ⇒ run the fall-action model).
   */
  IMMOBILE_SECONDS: 2,

  /**
   * Movement threshold while immobile: max allowed hip-center displacement per
   * frame, normalized by body height. Above this the immobile timer resets.
   */
  IMMOBILE_MOVEMENT_NORMALIZED: 0.05,

  /** Minimum MoveNet pose confidence to trust a frame's keypoints. */
  MIN_POSE_SCORE: 0.3,

  /** Minimum COCO-SSD object confidence to keep a detection. */
  MIN_OBJECT_SCORE: 0.5,

  /** Minimum per-keypoint confidence to use that keypoint in geometry. */
  MIN_KEYPOINT_SCORE: 0.3,
} as const;

export type Thresholds = typeof THRESHOLDS;

/** BroadcastChannel name shared by the emitter (homecam) and receiver (app). */
export const EVENT_CHANNEL = "collapse-events" as const;

// ---------------------------------------------------------------------------
// BlazePose / MediaPipe Pose landmark names, in canonical index order (0..32).
// The COCO-17 names the state machine relies on ("left_hip", "right_hip",
// "left_shoulder", "right_shoulder") are all present here, so switching the
// pose backend to BlazePose keeps those references valid.
// ---------------------------------------------------------------------------
export const BLAZEPOSE_33_NAMES = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
] as const;
