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
   * returns nets ~0). e.g. 0.5 => the hip fell half a body-height. A fall needs
   * this AND a torso flip to horizontal — static posture never triggers.
   */
  DROP_DESCENT_NORMALIZED: 0.5,

  /** Torso angle (deg from vertical) above which the body counts as horizontal. */
  TORSO_HORIZONTAL_DEG: 60,

  /** Torso angle (deg from vertical) below which the body counts as upright. */
  TORSO_UPRIGHT_DEG: 30,

  /** Frame window over which the vertical→horizontal flip must occur. */
  TRANSITION_WINDOW_FRAMES: 25,

  /**
   * Aspect-ratio flip: person bbox (w/h). Standing ~<0.6; lying ~>1.2.
   * A cross from below LOW to above HIGH within the window is a "flip".
   */
  ASPECT_RATIO_UPRIGHT_MAX: 0.6,
  ASPECT_RATIO_HORIZONTAL_MIN: 1.2,

  /** Seconds the person must stay immobile after DOWN to confirm a candidate. */
  IMMOBILE_SECONDS: 3,

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
