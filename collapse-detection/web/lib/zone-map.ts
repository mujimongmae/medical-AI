// OWNER: zone-map part. Maps a point to a physical zone (bed/couch/floor).
// Zones are user-drawn rectangles by default; COCO bed/couch detection is bonus.
// TODO(zone): implement point-in-zone lookup.

import type { BBox, Zone } from "@/lib/types";

/** A named rectangular zone in source-pixel coordinates. */
export interface ZoneRect {
  zone: Exclude<Zone, "unknown">;
  bbox: BBox;
}

/**
 * Classify a point (typically the hip-center) into a zone. Returns "unknown"
 * when it falls outside every configured rect.
 * TODO(zone): point-in-rect test, last-match or priority wins.
 */
export function classifyZone(
  _point: { x: number; y: number },
  _zones: ZoneRect[],
): Zone {
  throw new Error("TODO(zone): classifyZone not implemented");
}
