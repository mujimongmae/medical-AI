"use client";

// OWNER: camera part. React hook wrapping camera.ts for a <video> element.
// TODO(camera): implement device selection + stream lifecycle + cleanup.

import type { CameraDevice } from "@/lib/camera";

export interface UseCameraResult {
  /** Attach to a <video ref={videoRef} playsInline muted />. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  devices: CameraDevice[];
  activeDeviceId: string | null;
  selectDevice: (deviceId: string) => void;
  status: "idle" | "requesting" | "streaming" | "error";
  error: string | null;
}

/**
 * Manage camera permission, device list, and the active stream bound to a video
 * element. Prefers the iPhone Continuity Camera when present.
 * TODO(camera): implement.
 */
export function useCamera(): UseCameraResult {
  throw new Error("TODO(camera): useCamera not implemented");
}
