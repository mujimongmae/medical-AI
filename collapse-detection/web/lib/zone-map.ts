// OWNER: zone-map part. Maps a point to a physical zone (bed/couch/floor).
// Zones are user-drawn rectangles by default; COCO bed/couch detection is bonus.

import type { BBox, DetectedObject, Zone } from "@/lib/types";

/** A named rectangular zone in source-pixel coordinates. */
export interface ZoneRect {
  zone: Exclude<Zone, "unknown">;
  bbox: BBox;
}

/**
 * Priority when a point/person overlaps multiple zones. Bed/couch (suppress
 * regions) win over floor so a person on a bed is never flagged as collapsed.
 */
const ZONE_PRIORITY: Record<Exclude<Zone, "unknown">, number> = {
  bed: 2,
  couch: 2,
  floor: 1,
};

function pointInRect(x: number, y: number, [bx, by, bw, bh]: BBox): boolean {
  return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
}

/**
 * Classify a point (typically the hip-center) into a zone. Returns "unknown"
 * when it falls outside every configured rect. When the point lies in several
 * rects, the highest-priority zone wins (bed/couch over floor).
 */
export function classifyZone(
  point: { x: number; y: number },
  zones: ZoneRect[],
): Zone {
  let best: Zone = "unknown";
  let bestPriority = 0;
  for (const z of zones) {
    if (!pointInRect(point.x, point.y, z.bbox)) continue;
    const p = ZONE_PRIORITY[z.zone];
    if (p > bestPriority) {
      bestPriority = p;
      best = z.zone;
    }
  }
  return best;
}

/** Intersection-over-area of `box` covered by `rect` (0..1). */
function overlapRatio(box: BBox, rect: BBox): number {
  const [ax, ay, aw, ah] = box;
  const [rx, ry, rw, rh] = rect;
  const ix = Math.max(ax, rx);
  const iy = Math.max(ay, ry);
  const ix2 = Math.min(ax + aw, rx + rw);
  const iy2 = Math.min(ay + ah, ry + rh);
  const iw = ix2 - ix;
  const ih = iy2 - iy;
  if (iw <= 0 || ih <= 0) return 0;
  const boxArea = aw * ah;
  if (boxArea <= 0) return 0;
  return (iw * ih) / boxArea;
}

/**
 * Classify a person bounding box into a zone by overlap ratio. A zone must
 * cover at least `minOverlap` of the person box to count. Highest-priority zone
 * among qualifying overlaps wins. Falls back to the hip-center point test using
 * the box center when nothing meets the overlap bar.
 */
export function classifyZoneByBox(
  personBbox: BBox,
  zones: ZoneRect[],
  minOverlap = 0.3,
): Zone {
  let best: Zone = "unknown";
  let bestPriority = 0;
  let bestRatio = 0;
  for (const z of zones) {
    const ratio = overlapRatio(personBbox, z.bbox);
    if (ratio < minOverlap) continue;
    const p = ZONE_PRIORITY[z.zone];
    if (p > bestPriority || (p === bestPriority && ratio > bestRatio)) {
      bestPriority = p;
      bestRatio = ratio;
      best = z.zone;
    }
  }
  if (best !== "unknown") return best;
  const [x, y, w, h] = personBbox;
  return classifyZone({ x: x + w / 2, y: y + h / 2 }, zones);
}

/**
 * BONUS: derive candidate ZoneRects from COCO-SSD detections. Turns detected
 * "bed"/"couch" objects into suppress zones the user can accept/edit. Only
 * objects at/above `minScore` are used.
 */
export function zonesFromDetections(
  objects: DetectedObject[],
  minScore = 0.5,
): ZoneRect[] {
  const zones: ZoneRect[] = [];
  for (const o of objects) {
    if (o.score < minScore) continue;
    const cls = o.class.toLowerCase();
    if (cls === "bed") zones.push({ zone: "bed", bbox: o.bbox });
    else if (cls === "couch" || cls === "sofa")
      zones.push({ zone: "couch", bbox: o.bbox });
  }
  return zones;
}
