import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// In-memory rate limiting (per edge function instance)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 }); // 1 min window
    return false;
  }
  entry.count++;
  return entry.count > 10; // Max 10 attempts per minute
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { action, username, password } = await req.json();

    // Rate limiting by IP
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (action === 'login') {
      if (isRateLimited(clientIP)) {
        return new Response(JSON.stringify({ success: false, reason: 'rate_limited' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!username || !password) {
        return new Response(JSON.stringify({ success: false, reason: 'invalid' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get clients list from DB
      const { data: row } = await supabase
        .from('clients_list')
        .select('clients')
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const clients = (row?.clients as any[]) || [];
      const client = clients.find((c: any) => c.u === username && c.p === password);

      if (!client) {
        return new Response(JSON.stringify({ success: false, reason: 'invalid' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const isExpired = client.t?.toLowerCase() === 'expirado' ||
        (client.e && new Date(client.e) < new Date());

      if (isExpired) {
        return new Response(JSON.stringify({ success: false, reason: 'expired' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check concurrent sessions - block if user is online (last seen < 2 min)
      // Use a shorter window to reduce false positives from stale heartbeats
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: presence } = await supabase
        .from('user_presence')
        .select('last_seen')
        .eq('client_username', username)
        .gte('last_seen', twoMinAgo)
        .maybeSingle();

      if (presence) {
        return new Response(JSON.stringify({ success: false, reason: 'already_online' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Clear any stale presence so the new session starts clean
      await supabase
        .from('user_presence')
        .update({ last_seen: new Date(0).toISOString() })
        .eq('client_username', username);

      // Return sanitized client data (no password)
      const safeClient = { ...client };
      delete safeClient.p;

      return new Response(JSON.stringify({ success: true, client: safeClient }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
