// OWNER: detectors part. Wraps COCO-SSD + MoveNet into per-frame DetectionFrame.
// NOTE: dynamic-import the TF models to avoid SSR + keep the initial bundle lean.
// TODO(detectors): implement model loading + inference.

import type { DetectionFrame } from "@/lib/types";

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

/**
 * Load COCO-SSD + MoveNet (SinglePose Lightning) and return a Detectors handle.
 * TODO(detectors): await import("@tensorflow/tfjs"); import cocoSsd + poseDetection.
 */
export async function loadDetectors(): Promise<Detectors> {
  throw new Error("TODO(detectors): loadDetectors not implemented");
}
