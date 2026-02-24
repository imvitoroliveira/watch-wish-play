import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // POST: toggle reminder
    if (req.method === 'POST') {
      const { username, action, match_id, match_date, home_team, away_team, league_name } = await req.json();
      if (!username) return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      if (action === 'toggle') {
        // Check if exists
        const { data: existing } = await supabase
          .from('match_reminders')
          .select('id')
          .eq('client_username', username)
          .eq('match_id', match_id)
          .maybeSingle();

        if (existing) {
          await supabase.from('match_reminders').delete().eq('id', existing.id);
          return new Response(JSON.stringify({ active: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          await supabase.from('match_reminders').insert({
            client_username: username,
            match_id,
            match_date,
            home_team,
            away_team,
            league_name,
          });
          return new Response(JSON.stringify({ active: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      if (action === 'list') {
        const { data } = await supabase
          .from('match_reminders')
          .select('match_id')
          .eq('client_username', username);
        return new Response(JSON.stringify({ reminders: (data || []).map(r => r.match_id) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // GET: cron job - check reminders and send push for matches starting in 5 min
    if (req.method === 'GET') {
      const now = new Date();
      const fiveMinLater = new Date(now.getTime() + 5 * 60 * 1000);

      const { data: pending } = await supabase
        .from('match_reminders')
        .select('*')
        .eq('notified', false)
        .lte('match_date', fiveMinLater.toISOString())
        .gte('match_date', now.toISOString());

      if (!pending || pending.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const pushAlertKey = Deno.env.get('PUSHALERT_API_KEY');
      let sent = 0;

      for (const reminder of pending) {
        try {
          if (pushAlertKey) {
            await fetch('https://api.pushalert.co/rest/v1/send', {
              method: 'POST',
              headers: {
                'Authorization': `api_key=${pushAlertKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: '⚽ Jogo começando em 5 minutos!',
                message: `${reminder.home_team} vs ${reminder.away_team} - ${reminder.league_name}`,
                url: '/',
              }),
            });
          }

          await supabase
            .from('match_reminders')
            .update({ notified: true })
            .eq('id', reminder.id);
          sent++;
        } catch (e) {
          console.error('Failed to send reminder push:', e);
        }
      }

      return new Response(JSON.stringify({ sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
