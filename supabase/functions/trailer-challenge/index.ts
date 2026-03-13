import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rejects usernames containing SQL/XSS/path-traversal patterns
function isMaliciousInput(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const dangerous = /(<\s*script|<\s*img|on\w+\s*=|javascript:|union\s+select|;\s*drop\s|;\s*delete\s|'\s*or\s+'|'\s*or\s+1|--\s*$|\/\.\.|%00)/i;
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
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const username = url.searchParams.get('username');
      if (!username) return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (isMaliciousInput(username)) return new Response(JSON.stringify({ error: 'Invalid username' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const today = new Date().toISOString().split('T')[0];
      const month = today.substring(0, 7);

      // Get today's progress
      const { data: todayData } = await supabase
        .from('trailer_challenge')
        .select('trailers_watched, point_earned')
        .eq('client_username', username)
        .eq('challenge_date', today)
        .maybeSingle();

      // Get monthly progress
      const { data: monthData } = await supabase
        .from('trailer_challenge_completions')
        .select('total_points, completed')
        .eq('client_username', username)
        .eq('challenge_month', month)
        .maybeSingle();

      return new Response(JSON.stringify({
        today: {
          trailers_watched: todayData?.trailers_watched || 0,
          point_earned: todayData?.point_earned || false,
        },
        month: {
          total_points: monthData?.total_points || 0,
          completed: monthData?.completed || false,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'POST') {
      const { username, action } = await req.json();
      if (!username) return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (isMaliciousInput(username)) return new Response(JSON.stringify({ error: 'Invalid username' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      if (action === 'watch_trailer') {
        const today = new Date().toISOString().split('T')[0];
        const month = today.substring(0, 7);

        // Upsert today's record
        const { data: existing } = await supabase
          .from('trailer_challenge')
          .select('trailers_watched, point_earned')
          .eq('client_username', username)
          .eq('challenge_date', today)
          .maybeSingle();

        const currentCount = existing?.trailers_watched || 0;
        const alreadyEarned = existing?.point_earned || false;

        if (alreadyEarned) {
          return new Response(JSON.stringify({ message: 'Ponto já ganho hoje', trailers_watched: currentCount, point_earned: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const newCount = currentCount + 1;
        const earnPoint = newCount >= 3;

        await supabase
          .from('trailer_challenge')
          .upsert({
            client_username: username,
            challenge_date: today,
            trailers_watched: newCount,
            point_earned: earnPoint,
          }, { onConflict: 'client_username,challenge_date' });

        let monthlyPoints = 0;
        let monthCompleted = false;

        if (earnPoint) {
          // Update monthly completion
          const { data: monthData } = await supabase
            .from('trailer_challenge_completions')
            .select('total_points, completed')
            .eq('client_username', username)
            .eq('challenge_month', month)
            .maybeSingle();

          monthlyPoints = (monthData?.total_points || 0) + 1;
          monthCompleted = monthlyPoints >= 20;

          await supabase
            .from('trailer_challenge_completions')
            .upsert({
              client_username: username,
              challenge_month: month,
              total_points: monthlyPoints,
              completed: monthCompleted,
              completed_at: monthCompleted ? new Date().toISOString() : null,
            }, { onConflict: 'client_username,challenge_month' });

          // If challenge completed, send push via PushAlert
          if (monthCompleted && !monthData?.completed) {
            try {
              const pushAlertKey = Deno.env.get('PUSHALERT_API_KEY');
              if (pushAlertKey) {
                const params = new URLSearchParams();
                params.append('title', '🎬 Parabéns! Desafio Completo!');
                params.append('message', 'Você completou o Desafio Cine-Trailer e está concorrendo à mensalidade grátis!');
                params.append('url', 'https://clientestoptv.lovable.app/dashboard');
                params.append('attributes', JSON.stringify({ username }));

                const pushRes = await fetch('https://api.pushalert.co/rest/v2/web-push/send', {
                  method: 'POST',
                  headers: {
                    'Authorization': `api_key=${pushAlertKey}`,
                  },
                  body: params,
                });
                const pushResult = await pushRes.text();
                console.log(`[Push] challenge-complete for ${username}:`, pushResult);
              }
            } catch (e) {
              console.error('Push notification failed:', e);
            }
          }
        }

        return new Response(JSON.stringify({
          trailers_watched: newCount,
          point_earned: earnPoint,
          monthly_points: monthlyPoints,
          month_completed: monthCompleted,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
