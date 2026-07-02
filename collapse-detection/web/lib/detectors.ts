// OWNER: detectors part. Wraps COCO-SSD + MediaPipe Pose Landmarker into a
// per-frame DetectionFrame.
// NOTE: dynamic-import the models to avoid SSR + keep the initial bundle lean.
// This module is source-only; installing/building/running is the Foundation /
// Integrate agents' job. Callers should invoke `detect` from a rAF loop.

import type {
  DetectedObject,
  DetectionFrame,
  Keypoint,
  Pose,
} from "@/lib/types";
import { BLAZEPOSE_33_NAMES, THRESHOLDS } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tunables local to the detector.
// ---------------------------------------------------------------------------

/**
 * Run the (heavier) COCO-SSD object detector only every N frames. Object boxes
 * (bed/couch/person furniture context) change slowly, so we reuse the last
 * result on the in-between frames. Pose runs every frame (cheap + we need
 * fresh pose geometry for the fall heuristics).
 */
export const COCO_SSD_EVERY_N_FRAMES = 10 as const;

/** CDN paths for the MediaPipe Pose Landmarker task assets. */
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const POSE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

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

/** One MediaPipe NormalizedLandmark (coords are 0..1 relative to the frame). */
interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}
/** Subset of the PoseLandmarker VIDEO result we consume. */
interface PoseLandmarkerResult {
  landmarks: NormalizedLandmark[][];
}
interface PoseLandmarkerModel {
  detectForVideo: (
    video: HTMLVideoElement | HTMLCanvasElement,
    timestampMs: number,
  ) => PoseLandmarkerResult;
  close?: () => void;
}

// ---------------------------------------------------------------------------
// Singleton load. Concurrent callers share one in-flight promise.
// ---------------------------------------------------------------------------

let loadPromise: Promise<Detectors> | null = null;

/**
 * Load COCO-SSD + MediaPipe Pose Landmarker (full, 33 landmarks) and return a
 * Detectors handle. Idempotent: repeated calls return the same instance. On
 * failure the cached promise is cleared so a later call can retry.
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
  // Dynamic imports keep the model runtimes out of the SSR bundle and off the
  // initial load.
  const tf = await import("@tensorflow/tfjs");
  const cocoSsd = await import("@tensorflow-models/coco-ssd");
  const { FilesetResolver, PoseLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );

  // WebGL backend for GPU-accelerated COCO-SSD inference on the main thread.
  await tf.setBackend("webgl");
  await tf.ready();

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

  const [cocoModel, landmarker] = await Promise.all([
    cocoSsd.load({ base: "lite_mobilenet_v2" }) as Promise<CocoModel>,
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: POSE_LANDMARKER_MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    }) as unknown as Promise<PoseLandmarkerModel>,
  ]);

  let frameCount = 0;
  let cachedObjects: DetectedObject[] = [];
  let disposed = false;
  // detectForVideo requires strictly-increasing timestamps; keep the last one
  // so we can bump collisions/regressions forward by at least 1ms.
  let lastTs = 0;

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

    // --- Pose (every frame). detectForVideo returns synchronously. ---
    // Monotonic timestamp: strictly greater than the previous frame's.
    const ts = Math.max(lastTs + 1, Math.round(timestamp));
    lastTs = ts;

    let pose: Pose | null = null;
    try {
      const res = landmarker.detectForVideo(source, ts);
      pose = toPose(res.landmarks?.[0], width, height);
    } catch {
      pose = null;
    }

    const objects = await objectsPromise;

    if (runObjects) cachedObjects = objects;

    return { timestamp, width, height, objects, pose };
  }

  function dispose(): void {
    disposed = true;
    cachedObjects = [];
    try {
      landmarker.close?.();
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

/**
 * Convert one MediaPipe pose (33 NormalizedLandmarks, 0..1) into our shared
 * Pose in source-pixel coordinates, or null if no confident person was found.
 */
function toPose(
  landmarks: NormalizedLandmark[] | undefined,
  width: number,
  height: number,
): Pose | null {
  if (!landmarks || landmarks.length === 0) return null;

  const keypoints: Keypoint[] = landmarks.map((lm, i) => ({
    name: BLAZEPOSE_33_NAMES[i] ?? `kp_${i}`,
    x: lm.x * width,
    y: lm.y * height,
    score: lm.visibility ?? 1,
  }));

  const score = meanVisibility(landmarks);
  if (score < THRESHOLDS.MIN_POSE_SCORE) return null;

  return { keypoints, score };
}

function meanVisibility(landmarks: NormalizedLandmark[]): number {
  if (landmarks.length === 0) return 0;
  let sum = 0;
  for (const lm of landmarks) sum += lm.visibility ?? 1;
  return sum / landmarks.length;
}
