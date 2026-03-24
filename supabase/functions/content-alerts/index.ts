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
      const body = await req.json();
      const { username, action, movie_title, original_title, movie_id } = body;

      // Validate action is a string (block array injection)
      if (typeof action !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid action type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!username) return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      if (action === 'toggle' || action === 'add') {
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
            original_title: original_title || '',
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

      // Unknown action
      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // GET: cron - check M3U catalog for newly available content
    if (req.method === 'GET') {
      const { data: pendingAlerts } = await supabase
        .from('content_alerts')
        .select('*')
        .eq('notified', false);

      if (!pendingAlerts || pendingAlerts.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

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
      const results: any[] = [];

      for (const alert of pendingAlerts) {
        // Build list of normalized titles to check (PT + original EN)
        const titlesToCheck: string[] = [];
        const normalizedPT = normalizeTitle(alert.movie_title);
        if (normalizedPT.length >= 2) titlesToCheck.push(normalizedPT);
        
        if (alert.original_title) {
          const normalizedEN = normalizeTitle(alert.original_title);
          if (normalizedEN.length >= 2 && normalizedEN !== normalizedPT) {
            titlesToCheck.push(normalizedEN);
          }
        }

        // Strict exact match only — no partial includes()
        let found = false;
        for (const check of titlesToCheck) {
          if (m3uSet.has(check)) {
            found = true;
            break;
          }
        }

        if (found) {
          let pushResult: any = null;
          try {
            if (pushAlertKey) {
              const params = new URLSearchParams();
              params.append('title', '🎬 Conteúdo Disponível!');
              params.append('message', `"${alert.movie_title}" já está disponível no catálogo!`);
              params.append('url', 'https://clientestoptv.lovable.app/dashboard');
              params.append('attributes', JSON.stringify({ username: alert.client_username }));

              const pushRes = await fetch('https://api.pushalert.co/rest/v2/web-push/send', {
                method: 'POST',
                headers: {
                  'Authorization': `api_key=${pushAlertKey}`,
                },
                body: params,
              });
              const pushText = await pushRes.text();
              console.log(`[Push] content-alert for ${alert.client_username}:`, pushRes.status, pushText);
              try { pushResult = JSON.parse(pushText); } catch { pushResult = pushText; }
            }

            await supabase
              .from('content_alerts')
              .update({ notified: true })
              .eq('id', alert.id);

            // Log to notifications table for audit
            await supabase.from('notifications').insert({
              title: '🎬 Conteúdo Disponível!',
              body: `"${alert.movie_title}" disponível. Push status: ${pushResult?.success ?? 'no_key'}`,
              target_user: alert.client_username,
              type: 'content_alert',
            });

            sent++;
            results.push({ user: alert.client_username, title: alert.movie_title, push: pushResult });
          } catch (e) {
            console.error('Failed to send content alert:', e);
            results.push({ user: alert.client_username, title: alert.movie_title, error: (e as Error).message });
          }
        }
      }

      return new Response(JSON.stringify({ sent, checked: pendingAlerts.length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
