"use client";

// OWNER: overlay part. Canvas overlay drawing object boxes, pose skeleton,
// zones, and the status banner on top of the homecam <video>.
// TODO(overlay): implement canvas drawing synced to video dimensions.

import type { CollapseState, DetectionFrame } from "@/lib/types";
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

/**
 * Absolutely-positioned canvas overlay. Render it as a sibling on top of the
 * <video> inside a `relative` container.
 * TODO(overlay): implement.
 */
export default function DetectionOverlay(
  _props: DetectionOverlayProps,
): React.JSX.Element {
  throw new Error("TODO(overlay): DetectionOverlay not implemented");
}
