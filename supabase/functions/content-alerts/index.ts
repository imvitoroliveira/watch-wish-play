import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    if (req.method === 'POST') {
      const { username, action, movie_title, movie_id } = await req.json();
      if (!username) return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      if (action === 'toggle') {
        const { data: existing } = await supabase
          .from('content_alerts')
          .select('id')
          .eq('client_username', username)
          .eq('movie_id', movie_id)
          .maybeSingle();

        if (existing) {
          await supabase.from('content_alerts').delete().eq('id', existing.id);
          return new Response(JSON.stringify({ active: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          await supabase.from('content_alerts').insert({
            client_username: username,
            movie_title,
            movie_id,
          });
          return new Response(JSON.stringify({ active: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      if (action === 'list') {
        const { data } = await supabase
          .from('content_alerts')
          .select('movie_id')
          .eq('client_username', username)
          .eq('notified', false);
        return new Response(JSON.stringify({ alerts: (data || []).map(a => a.movie_id) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // GET: cron - check M3U catalog for newly available content
    if (req.method === 'GET') {
      // Get pending alerts
      const { data: pendingAlerts } = await supabase
        .from('content_alerts')
        .select('*')
        .eq('notified', false);

      if (!pendingAlerts || pendingAlerts.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get M3U catalog
      const { data: catalog } = await supabase
        .from('m3u_catalog')
        .select('titles')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!catalog?.titles) {
        return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const m3uTitles = (catalog.titles as string[]).map(normalizeTitle);
      const m3uSet = new Set(m3uTitles);
      const pushAlertKey = Deno.env.get('PUSHALERT_API_KEY');
      let sent = 0;

      for (const alert of pendingAlerts) {
        const normalizedAlert = normalizeTitle(alert.movie_title);
        let found = m3uSet.has(normalizedAlert);
        if (!found) {
          for (const m3u of m3uTitles) {
            if (m3u.includes(normalizedAlert) || normalizedAlert.includes(m3u)) {
              found = true;
              break;
            }
          }
        }

        if (found) {
          try {
            if (pushAlertKey) {
              await fetch('https://api.pushalert.co/rest/v1/send', {
                method: 'POST',
                headers: {
                  'Authorization': `api_key=${pushAlertKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  title: '🎬 Conteúdo Disponível!',
                  message: `"${alert.movie_title}" já está disponível no catálogo!`,
                  url: '/',
                }),
              });
            }

            await supabase
              .from('content_alerts')
              .update({ notified: true })
              .eq('id', alert.id);
            sent++;
          } catch (e) {
            console.error('Failed to send content alert:', e);
          }
        }
      }

      return new Response(JSON.stringify({ sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
