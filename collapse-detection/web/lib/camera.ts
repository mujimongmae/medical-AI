// OWNER: camera part. Low-level getUserMedia helpers (no React).
// Enumerate video inputs, prefer the iPhone Continuity Camera, and acquire /
// tear down MediaStreams by deviceId.

/** A selectable camera device (label helps users pick the iPhone Continuity cam). */
export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** True when running in a browser with the mediaDevices API available. */
function hasMediaDevices(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * Heuristic: does this device label look like an iPhone Continuity Camera?
 * macOS surfaces the phone as a normal webcam whose label contains "iPhone".
 */
export function isIphoneContinuityCamera(label: string): boolean {
  return /iphone/i.test(label);
}

/**
 * Order devices so the iPhone Continuity Camera(s) come first — that's the
 * intended demo capture device on this machine.
 */
function preferIphoneFirst(devices: CameraDevice[]): CameraDevice[] {
  return [...devices].sort((a, b) => {
    const ai = isIphoneContinuityCamera(a.label) ? 0 : 1;
    const bi = isIphoneContinuityCamera(b.label) ? 0 : 1;
    return ai - bi;
  });
}

/**
 * List available video input devices, iPhone Continuity Camera(s) first.
 *
 * Note: `label` is only populated after the user has granted camera permission
 * at least once. Before that, labels are empty strings (browser privacy rule),
 * so callers typically call this again after startCamera() succeeds.
 */
export async function listCameras(): Promise<CameraDevice[]> {
  if (!hasMediaDevices() || typeof navigator.mediaDevices.enumerateDevices !== "function") {
    return [];
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  const cams = all
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      // Fall back to a friendly name when permission hasn't been granted yet.
      label: d.label || `카메라 ${i + 1}`,
    }));
  return preferIphoneFirst(cams);
}

/**
 * Acquire a MediaStream for the given device (or the default video input when
 * omitted). When a deviceId is supplied we use `exact` so the browser doesn't
 * silently fall back to a different camera.
 *
 * Throws the underlying DOMException (NotAllowedError / NotFoundError / …) so
 * callers can map it to user-facing status.
 */
export async function startCamera(deviceId?: string): Promise<MediaStream> {
  if (!hasMediaDevices()) {
    throw new Error("이 브라우저에서는 카메라를 사용할 수 없습니다.");
  }
  const video: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: "user" };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

/** Stop all tracks on a stream so the camera indicator turns off. */
export function stopCamera(stream: MediaStream): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Track may already be ended; ignore.
    }
  }
}

// NOTE(camera): WebRTC remote-stream fallback (e.g. phone → app over the network
// via a peer connection) would live here if Continuity Camera is unavailable.
// Out of scope for the demo; left as an intentional placeholder.
