import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Single browser client, created lazily.
//
// Why lazy: the old version called createBrowserClient(...) at module scope, so the
// client was built the moment this file was imported. During `next build`, Next
// prerenders /_not-found (root layout -> Nav -> this file), which ran the constructor
// at build time and threw "Your project's URL and API key are required", crashing the
// build. The Proxy defers construction to the first property access (which only happens
// at runtime in the browser), so the build never builds a client during prerender.

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing at runtime: set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (Vercel project settings or .env.local)."
    );
  }

  _client = createBrowserClient(url, key);
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});