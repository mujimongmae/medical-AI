// OWNER: event-bus part. Publishes/subscribes EmergencyEvents.
//
// Transports:
//   1. BroadcastChannel("collapse-events") — DEFAULT. Same browser, two tabs
//      (homecam emitter + receiver app). No backend, no config.
//   2. Supabase Realtime — OPTIONAL. Enabled only when both
//      NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are present.
//      Lets the receiver run on a different device/network. When absent, we
//      silently fall back to BroadcastChannel only (no errors, no warnings).
//
// Design notes:
//   - All Supabase work is lazy + dynamically imported so the app builds and
//     runs even when @supabase/supabase-js is not installed or env is unset.
//   - We tag every outbound message with a per-tab senderId so a tab never
//     re-delivers its own event to itself (BroadcastChannel doesn't echo to the
//     same instance, but the Supabase round-trip would). This keeps emit/subscribe
//     idempotent across transports.

import { EVENT_CHANNEL, type EmergencyEvent } from "@/lib/types";

const isBrowser = typeof window !== "undefined";

/** Unique id for this tab/runtime, used to drop self-originated Supabase echoes. */
const SENDER_ID =
  isBrowser && typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Persistent outbound BroadcastChannel — created lazily and reused for every
 *  send. We intentionally do NOT close it per-message: a synchronous close()
 *  right after postMessage() can cancel the (async) delivery in some browsers,
 *  which silently drops the event before the receiver tab ever sees it. */
let emitChannel: BroadcastChannel | null = null;
function getEmitChannel(): BroadcastChannel | null {
  if (!isBrowser) return null;
  if (!emitChannel) {
    try {
      emitChannel = new BroadcastChannel(EVENT_CHANNEL);
    } catch {
      emitChannel = null;
    }
  }
  return emitChannel;
}

/** Supabase Realtime channel + table name (kept in sync with the SQL file). */
const SUPABASE_CHANNEL = EVENT_CHANNEL;
const SUPABASE_TABLE = "emergency_events";

/** Envelope sent over the wire so we can identify + skip our own echoes. */
interface EventEnvelope {
  senderId: string;
  event: EmergencyEvent;
}

// ---------------------------------------------------------------------------
// Supabase env detection (both must be set; otherwise Supabase is disabled).
// ---------------------------------------------------------------------------

function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { url, anonKey };
  return null;
}

// ---------------------------------------------------------------------------
// Lazy Supabase client (singleton). Dynamically imported to avoid hard dep.
// ---------------------------------------------------------------------------

// The client type is intentionally loose (any) so this module has no compile-time
// dependency on @supabase/supabase-js. Resolves to null when unavailable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseClientPromise: Promise<any | null> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabaseClient(): Promise<any | null> {
  if (supabaseClientPromise) return supabaseClientPromise;

  const env = getSupabaseEnv();
  if (!isBrowser || !env) {
    supabaseClientPromise = Promise.resolve(null);
    return supabaseClientPromise;
  }

  supabaseClientPromise = import("@supabase/supabase-js")
    .then((mod) =>
      mod.createClient(env.url, env.anonKey, {
        realtime: { params: { eventsPerSecond: 5 } },
      }),
    )
    .catch(() => null); // package missing or failed to load → disable silently

  return supabaseClientPromise;
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

/**
 * Publish a collapse candidate to all subscribers.
 * Always broadcasts locally (BroadcastChannel); additionally inserts into the
 * Supabase `emergency_events` table when Supabase is configured.
 */
export function emitEmergencyEvent(event: EmergencyEvent): void {
  if (!isBrowser) return;

  const envelope: EventEnvelope = { senderId: SENDER_ID, event };

  // 1) Local transport — synchronous, always on. Reuse the persistent channel
  //    (do NOT close it here) so delivery isn't cancelled by a same-tick close.
  const bc = getEmitChannel();
  if (bc) {
    try {
      bc.postMessage(envelope);
    } catch {
      // BroadcastChannel unsupported — Supabase (if any) still carries the event.
    }
  }

  // 2) Optional Supabase transport — fire-and-forget.
  void getSupabaseClient().then((client) => {
    if (!client) return;
    client
      .from(SUPABASE_TABLE)
      .insert({
        event_id: event.eventId,
        sender_id: SENDER_ID,
        payload: event,
      })
      .then(
        () => {},
        () => {}, // swallow insert errors; local transport already delivered
      );
  });
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

/**
 * Subscribe to collapse candidates from all active transports.
 * Returns an unsubscribe function that tears down every transport it opened.
 * Self-originated events (same tab) are never re-delivered.
 */
export function subscribeEmergencyEvents(
  cb: (event: EmergencyEvent) => void,
): () => void {
  if (!isBrowser) return () => {};

  const teardowns: Array<() => void> = [];

  // Guards against double-delivery when both transports carry the same event.
  const seen = new Set<string>();
  const deliver = (envelope: EventEnvelope | null) => {
    if (!envelope || !envelope.event) return;
    if (envelope.senderId === SENDER_ID) return; // skip our own echo
    const id = envelope.event.eventId;
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    cb(envelope.event);
  };

  // 1) BroadcastChannel.
  try {
    const bc = new BroadcastChannel(EVENT_CHANNEL);
    bc.onmessage = (e: MessageEvent<EventEnvelope>) => deliver(e.data);
    teardowns.push(() => {
      bc.onmessage = null;
      bc.close();
    });
  } catch {
    // unsupported — rely on Supabase if present.
  }

  // 2) Supabase Realtime (Postgres INSERT stream).
  void getSupabaseClient().then((client) => {
    if (!client) return;

    const channel = client
      .channel(SUPABASE_CHANNEL)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: SUPABASE_TABLE },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (msg: any) => {
          const row = msg?.new;
          if (!row?.payload) return;
          deliver({
            senderId: row.sender_id ?? "",
            event: row.payload as EmergencyEvent,
          });
        },
      )
      .subscribe();

    teardowns.push(() => {
      try {
        client.removeChannel(channel);
      } catch {
        // ignore teardown errors
      }
    });
  });

  return () => {
    for (const t of teardowns) {
      try {
        t();
      } catch {
        // ignore
      }
    }
    teardowns.length = 0;
  };
}
