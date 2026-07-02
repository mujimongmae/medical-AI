// OWNER: Integrate part. Optional Supabase client.
//
// The event-bus already handles its own lazy Supabase transport, so this module
// is a small convenience for any UI code that wants a shared client. It is null
// whenever the env vars are absent, so callers must null-check before use.
//
// SECURITY: only the anon key belongs here (public, RLS-guarded). Never put the
// service-role key in NEXT_PUBLIC_* — it would ship to the browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Shared Supabase client, or `null` when the app runs without Supabase config
 * (the demo default: events flow over BroadcastChannel only).
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** Convenience flag for UI ("원격 수신 사용 가능" 등 표시용). */
export const isSupabaseEnabled = supabase !== null;
