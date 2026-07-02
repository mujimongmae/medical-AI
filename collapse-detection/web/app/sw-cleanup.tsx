"use client";

import { useEffect } from "react";

/**
 * We do NOT ship a service worker. Any SW registered on this origin is stale or
 * foreign (e.g. left over from another localhost:3000 project, or injected by a
 * browser extension) and will serve cached bundles — causing hydration errors
 * and "my changes don't show up". Unregister everything and drop caches on load.
 */
export default function SwCleanup(): null {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()))
        .catch(() => {});
    }
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => void caches.delete(k)))
        .catch(() => {});
    }
  }, []);
  return null;
}
