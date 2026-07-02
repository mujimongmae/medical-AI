// OWNER: event-bus part. Publishes/subscribes EmergencyEvents.
// Default transport: BroadcastChannel("collapse-events") — two tabs, no backend.
// Optional: Supabase Realtime when env is present; else silently BroadcastChannel.
// TODO(event-bus): implement transports.

import type { EmergencyEvent } from "@/lib/types";

/** Publish a collapse candidate to all subscribers. TODO(event-bus). */
export function emitEmergencyEvent(_event: EmergencyEvent): void {
  throw new Error("TODO(event-bus): emitEmergencyEvent not implemented");
}

/**
 * Subscribe to collapse candidates. Returns an unsubscribe function.
 * TODO(event-bus): wire BroadcastChannel (+ optional Supabase channel).
 */
export function subscribeEmergencyEvents(
  _cb: (event: EmergencyEvent) => void,
): () => void {
  throw new Error("TODO(event-bus): subscribeEmergencyEvents not implemented");
}
