// OWNER: detectors part. Wraps COCO-SSD + MoveNet into per-frame DetectionFrame.
// NOTE: dynamic-import the TF models to avoid SSR + keep the initial bundle lean.
// This module is source-only; installing/building/running is the Foundation /
// Integrate agents' job. Callers should invoke `detect` from a rAF loop.

import type {
  DetectedObject,
  DetectionFrame,
  Keypoint,
  Pose,
} from "@/lib/types";
import { THRESHOLDS } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tunables local to the detector.
// ---------------------------------------------------------------------------

/**
 * Run the (heavier) COCO-SSD object detector only every N frames. Object boxes
 * (bed/couch/person furniture context) change slowly, so we reuse the last
 * result on the in-between frames. MoveNet runs every frame (cheap + we need
 * fresh pose geometry for the fall heuristics).
 */
export const COCO_SSD_EVERY_N_FRAMES = 10 as const;

// ---------------------------------------------------------------------------
// Detectors handle.
// ---------------------------------------------------------------------------

/** Opaque handle holding the loaded models. */
export interface Detectors {
  /** Run both models on one frame and assemble a DetectionFrame. */
  detect: (
    source: HTMLVideoElement | HTMLCanvasElement,
    timestamp: number,
  ) => Promise<DetectionFrame>;
  /** Free model memory. */
  dispose: () => void;
}

// Minimal structural types for the dynamically-imported model outputs, so we
// don't need the model packages present at type-check time in every consumer.
interface CocoPrediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}
interface CocoModel {
  detect: (
    input: HTMLVideoElement | HTMLCanvasElement,
  ) => Promise<CocoPrediction[]>;
}
interface MoveNetKeypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}
interface MoveNetPose {
  keypoints: MoveNetKeypoint[];
  score?: number;
}
interface PoseDetectorModel {
  estimatePoses: (
    input: HTMLVideoElement | HTMLCanvasElement,
    config?: { maxPoses?: number; flipHorizontal?: boolean },
  ) => Promise<MoveNetPose[]>;
  dispose?: () => void;
}

// ---------------------------------------------------------------------------
// Singleton load. Concurrent callers share one in-flight promise.
// ---------------------------------------------------------------------------

let loadPromise: Promise<Detectors> | null = null;

/**
 * Load COCO-SSD + MoveNet (SinglePose Lightning) and return a Detectors handle.
 * Idempotent: repeated calls return the same instance. On failure the cached
 * promise is cleared so a later call can retry.
 */
export function loadDetectors(): Promise<Detectors> {
  if (!loadPromise) {
    loadPromise = loadDetectorsImpl().catch((err) => {
      // Allow a retry on the next call instead of caching the rejection.
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

async function loadDetectorsImpl(): Promise<Detectors> {
  // Dynamic imports keep TF.js out of the SSR bundle and off the initial load.
  const tf = await import("@tensorflow/tfjs");
  const cocoSsd = await import("@tensorflow-models/coco-ssd");
  const poseDetection = await import("@tensorflow-models/pose-detection");

  // WebGL backend for GPU-accelerated inference on the main thread.
  await tf.setBackend("webgl");
  await tf.ready();

  const [cocoModel, poseDetector] = await Promise.all([
    cocoSsd.load({ base: "lite_mobilenet_v2" }) as Promise<CocoModel>,
    poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      // Thunder is markedly more accurate than Lightning (still 17 keypoints,
      // ~3x heavier but real-time on WebGL) — better joint localization means
      // steadier fall geometry and more markers clearing the confidence bar.
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
    }) as Promise<PoseDetectorModel>,
  ]);

  let frameCount = 0;
  let cachedObjects: DetectedObject[] = [];
  let disposed = false;

  async function detect(
    source: HTMLVideoElement | HTMLCanvasElement,
    timestamp: number,
  ): Promise<DetectionFrame> {
    const { width, height } = sourceSize(source);

    // Empty frame guard: video not ready yet (0-sized) → nothing to run.
    if (disposed || width === 0 || height === 0) {
      return { timestamp, width, height, objects: cachedObjects, pose: null };
    }

    // --- Objects (throttled): reuse cache on the in-between frames. ---
    const runObjects = frameCount % COCO_SSD_EVERY_N_FRAMES === 0;
    frameCount++;

    const objectsPromise: Promise<DetectedObject[]> = runObjects
      ? cocoModel
          .detect(source)
          .then((preds) =>
            preds
              .filter((p) => p.score >= THRESHOLDS.MIN_OBJECT_SCORE)
              .map<DetectedObject>((p) => ({
                class: p.class,
                score: p.score,
                bbox: [p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]],
              })),
          )
          .catch(() => cachedObjects)
      : Promise.resolve(cachedObjects);

    // --- Pose (every frame). ---
    const posePromise: Promise<Pose | null> = poseDetector
      .estimatePoses(source, { maxPoses: 1, flipHorizontal: false })
      .then((poses) => toPose(poses[0]))
      .catch(() => null);

    const [objects, pose] = await Promise.all([objectsPromise, posePromise]);

    if (runObjects) cachedObjects = objects;

    return { timestamp, width, height, objects, pose };
  }

  function dispose(): void {
    disposed = true;
    cachedObjects = [];
    try {
      poseDetector.dispose?.();
    } catch {
      // best-effort cleanup
    }
  }

  return { detect, dispose };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function sourceSize(source: HTMLVideoElement | HTMLCanvasElement): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.width, height: source.height };
}

/** Convert a raw MoveNet pose into our shared Pose, or null if too weak. */
function toPose(raw: MoveNetPose | undefined): Pose | null {
  if (!raw) return null;
  // MoveNet SinglePose doesn't always populate a top-level score; derive one
  // from the mean keypoint confidence when it's missing.
  const score =
    typeof raw.score === "number" ? raw.score : meanKeypointScore(raw.keypoints);
  if (score < THRESHOLDS.MIN_POSE_SCORE) return null;

  const keypoints: Keypoint[] = raw.keypoints.map((k, i) => ({
    name: k.name ?? COCO_KEYPOINT_NAMES[i] ?? `kp_${i}`,
    x: k.x,
    y: k.y,
    score: k.score ?? 0,
  }));
  return { keypoints, score };
}

function meanKeypointScore(keypoints: MoveNetKeypoint[]): number {
  if (keypoints.length === 0) return 0;
  let sum = 0;
  for (const k of keypoints) sum += k.score ?? 0;
  return sum / keypoints.length;
}

/** COCO-17 keypoint order (MoveNet output order) — fallback if name missing. */
const COCO_KEYPOINT_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
] as const;
