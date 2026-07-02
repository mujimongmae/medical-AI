// OWNER: camera part. Low-level getUserMedia helpers (no React).
// TODO(camera): implement device enumeration + stream acquisition.

/** A selectable camera device (label helps users pick the iPhone Continuity cam). */
export interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * List available video input devices. Note: labels are only populated after the
 * user has granted camera permission at least once.
 * TODO(camera): navigator.mediaDevices.enumerateDevices() → filter videoinput.
 */
export async function listCameras(): Promise<CameraDevice[]> {
  throw new Error("TODO(camera): listCameras not implemented");
}

/**
 * Acquire a MediaStream for the given device (or default when omitted).
 * TODO(camera): navigator.mediaDevices.getUserMedia({ video: { deviceId } }).
 */
export async function startCamera(
  _deviceId?: string,
): Promise<MediaStream> {
  throw new Error("TODO(camera): startCamera not implemented");
}

/** Stop all tracks on a stream. TODO(camera): iterate getTracks().stop(). */
export function stopCamera(_stream: MediaStream): void {
  throw new Error("TODO(camera): stopCamera not implemented");
}
