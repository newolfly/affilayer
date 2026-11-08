/**
 * Supabase helpers for Worker-side authenticated calls (migration 010).
 *
 * The web app signs users in with Supabase Auth; the Worker verifies those
 * users by calling Auth's /auth/v1/user with the caller's JWT, and it calls
 * SECURITY DEFINER RPCs with the caller's JWT forwarded so auth.uid() and
 * is_admin() inside the RPC see the real caller (same pattern as the
 * browser's direct RPC calls in 008). The Worker never mints tokens and
 * never holds a service-role key.
 */

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface SupabaseClient {
  url: string;
  anonKey: string;
  fetchFn?: typeof fetch;
}

function fetchOf(client: SupabaseClient): typeof fetch {
  return client.fetchFn ?? fetch;
}

/** Verify a Supabase JWT via Auth. Returns the user, or null. */
export async function verifyUserJwt(
  client: SupabaseClient,
  jwt: string,
): Promise<SupabaseUser | null> {
  const res = await fetchOf(client)(`${client.url}/auth/v1/user`, {
    headers: {
      apikey: client.anonKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string; email?: string };
  if (!data?.id) return null;
  return { id: data.id, email: data.email };
}

/** Call a PostgREST RPC. When `jwt` is given it is forwarded as the
 *  Authorization bearer so auth.uid() inside the function is the caller;
 *  otherwise the anon key is used (no-JWT backend calls). */
export async function supabaseRpc<T>(
  client: SupabaseClient,
  fn: string,
  params: Record<string, unknown>,
  jwt?: string,
): Promise<T> {
  const res = await fetchOf(client)(`${client.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: client.anonKey,
      Authorization: `Bearer ${jwt ?? client.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`supabase rpc ${fn} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Read rows via PostgREST with the caller's JWT (RLS applies). */
export async function supabaseSelect<T>(
  client: SupabaseClient,
  table: string,
  query: string,
  jwt: string,
): Promise<T[]> {
  const res = await fetchOf(client)(`${client.url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: client.anonKey,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`supabase select ${table} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T[];
}

/** Is this JWT's user an admin? Calls public.is_admin() with the JWT. */
export async function isAdminUser(
  client: SupabaseClient,
  jwt: string,
): Promise<boolean> {
  return supabaseRpc<boolean>(client, 'is_admin', {}, jwt);
}
