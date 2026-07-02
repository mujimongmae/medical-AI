"use client";

// OWNER: camera part. React hook wrapping camera.ts for a <video> element.
// Handles permission, device list, active-stream lifecycle, and cleanup.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCameras,
  startCamera,
  stopCamera,
  isIphoneContinuityCamera,
  type CameraDevice,
} from "@/lib/camera";

export interface UseCameraResult {
  /** Attach to a <video ref={videoRef} playsInline muted />. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  devices: CameraDevice[];
  activeDeviceId: string | null;
  selectDevice: (deviceId: string) => void;
  status: "idle" | "requesting" | "streaming" | "error";
  error: string | null;
}

/** Map a getUserMedia rejection to a friendly Korean message. */
function describeError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "사용 가능한 카메라를 찾을 수 없습니다.";
    case "NotReadableError":
      return "다른 앱이 카메라를 사용 중입니다. 종료 후 다시 시도해 주세요.";
    default:
      return (err as { message?: string })?.message ?? "카메라를 시작할 수 없습니다.";
  }
}

/**
 * Manage camera permission, device list, and the active stream bound to a video
 * element. Prefers the iPhone Continuity Camera when present.
 *
 * Lifecycle:
 *  - On mount: request the default camera (prompts for permission), then
 *    enumerate devices (labels are only readable post-permission) and switch to
 *    the iPhone Continuity Camera if one is found.
 *  - selectDevice(id): tear down the current stream and open the chosen device.
 *  - On unmount: stop all tracks.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Guards against races: a stale start() resolving after a newer selection.
  const requestSeq = useRef(0);
  const mountedRef = useRef(true);

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [status, setStatus] = useState<UseCameraResult["status"]>("idle");
  const [error, setError] = useState<string | null>(null);

  // Mirror of activeDeviceId so the mount effect can read the latest value
  // without listing it as a dependency (which would re-run the effect).
  const activeDeviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeDeviceIdRef.current = activeDeviceId;
  }, [activeDeviceId]);

  /** Bind a stream to the <video>, replacing (and stopping) any previous one. */
  const attachStream = useCallback((stream: MediaStream) => {
    if (streamRef.current && streamRef.current !== stream) {
      stopCamera(streamRef.current);
    }
    streamRef.current = stream;
    const el = videoRef.current;
    if (el) {
      el.srcObject = stream;
      // Autoplay can reject if the element isn't ready; safe to ignore.
      void el.play().catch(() => {});
    }
  }, []);

  /** Open a camera by id (or default), updating status/error/devices. */
  const open = useCallback(
    async (deviceId?: string) => {
      const seq = ++requestSeq.current;
      setStatus("requesting");
      setError(null);
      try {
        const stream = await startCamera(deviceId);
        // A newer request superseded us, or we unmounted → discard this stream.
        if (seq !== requestSeq.current || !mountedRef.current) {
          stopCamera(stream);
          return;
        }
        attachStream(stream);
        // Resolve the actual device id from the granted track.
        const trackSettings = stream.getVideoTracks()[0]?.getSettings();
        setActiveDeviceId(deviceId ?? trackSettings?.deviceId ?? null);
        setStatus("streaming");

        // Labels become available only after permission is granted.
        const cams = await listCameras();
        if (seq === requestSeq.current && mountedRef.current) {
          setDevices(cams);
        }
      } catch (err) {
        if (seq !== requestSeq.current || !mountedRef.current) return;
        setError(describeError(err));
        setStatus("error");
      }
    },
    [attachStream],
  );

  const selectDevice = useCallback(
    (deviceId: string) => {
      if (deviceId === activeDeviceId && status === "streaming") return;
      void open(deviceId);
    },
    [activeDeviceId, status, open],
  );

  // Mount: request default camera, then auto-prefer the iPhone Continuity Cam.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      await open();
      if (cancelled) return;
      // After permission, if an iPhone Continuity Camera exists and isn't the
      // active one, switch to it (listCameras already sorts iPhone-first).
      const cams = await listCameras();
      if (cancelled) return;
      const iphone = cams.find((c) => isIphoneContinuityCamera(c.label));
      if (iphone && iphone.deviceId && iphone.deviceId !== activeDeviceIdRef.current) {
        void open(iphone.deviceId);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      // Invalidate any in-flight open() so it discards its stream.
      requestSeq.current++;
      if (streamRef.current) {
        stopCamera(streamRef.current);
        streamRef.current = null;
      }
    };
    // Run once on mount; open/listCameras are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { videoRef, devices, activeDeviceId, selectDevice, status, error };
}
