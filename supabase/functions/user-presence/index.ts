import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Rejects usernames containing SQL/XSS/path-traversal patterns
function isMaliciousInput(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const dangerous = /(<\s*script|<\s*img|on\w+\s*=|javascript:|union\s+select|;\s*drop\s|;\s*delete\s|'\s*or\s+'|'\s*or\s+1|--\s*$|\/\.\.|%00|`|\$\()/i;
  return dangerous.test(value);
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
    const { action, username } = await req.json();

    // Validate username against injection attacks
    if (username && isMaliciousInput(username)) {
      return new Response(JSON.stringify({ error: 'Invalid username' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Logout: set last_seen to far past so user is no longer "online"
    if (action === 'logout' && username) {
      await supabase
        .from('user_presence')
        .update({ last_seen: new Date(0).toISOString() })
        .eq('client_username', username);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Heartbeat: upsert last_seen
    if (action === 'heartbeat' && username) {
      await supabase
        .from('user_presence')
        .upsert(
          { client_username: username, last_seen: new Date().toISOString() },
          { onConflict: 'client_username' }
        );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin: list online users (last_seen within 5 minutes)
    if (action === 'list_online') {
      // Verify admin credentials
      const adminUser = Deno.env.get('ADMIN_USER');
      const adminPass = Deno.env.get('ADMIN_PASS');
      const authHeader = req.headers.get('x-admin-auth');
      
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const decoded = atob(authHeader);
        const [u, p] = decoded.split(':');
        if (u !== adminUser || p !== adminPass) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: onlineUsers } = await supabase
        .from('user_presence')
        .select('client_username, last_seen')
        .gte('last_seen', fiveMinAgo)
        .order('last_seen', { ascending: false });

      return new Response(JSON.stringify({ online: onlineUsers || [] }), {
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
