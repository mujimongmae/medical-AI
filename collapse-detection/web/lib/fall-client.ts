"use client";

// Client for the local ST-GCN fall-model backend (collapse-detection/backend).
// The homecam POSTs a recent window of MediaPipe-33 keypoints (normalized 0..1
// x, y, visibility) and gets back a learned fall probability. Fully graceful:
// if the backend is down, every call resolves to a "skipped" result so the
// detection pipeline never breaks.

import type { EmergencyEvent } from "@/lib/types";

type FallModel = NonNullable<EmergencyEvent["fallModel"]>;

const FALL_API = process.env.NEXT_PUBLIC_FALL_API ?? "http://localhost:8000";

const SKIPPED: FallModel = { source: "skipped", probability: 0, sustained: false };

/**
 * Score a keypoint window with the local ST-GCN service.
 * @param frames  frames[t] = 33 landmarks × [x, y, visibility], normalized 0..1.
 */
export async function scoreFall(frames: number[][][]): Promise<FallModel> {
  if (!frames.length) return SKIPPED;
  try {
    const res = await fetch(`${FALL_API}/fall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames }),
    });
    if (!res.ok) return SKIPPED;
    const d = (await res.json()) as {
      ready?: boolean;
      fallProbability?: number;
      sustained?: boolean;
    };
    if (!d?.ready) return SKIPPED;
    return {
      source: "local-stgcn",
      probability: Number(d.fallProbability) || 0,
      sustained: Boolean(d.sustained),
    };
  } catch {
    return SKIPPED; // backend unreachable — non-fatal
  }
}

/** Health probe for the fall backend (drives a status pill). */
export async function checkFallBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${FALL_API}/health`);
    if (!res.ok) return false;
    const d = (await res.json()) as { ready?: boolean };
    return Boolean(d?.ready);
  } catch {
    return false;
  }
}
