// Proxy server-side para a XTream API (player_api.php).
// Necessário porque o preview roda em HTTPS e servidores IPTV são HTTP → mixed content bloqueia fetch direto do browser.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { domain, user, pass, action } = await req.json();

    if (!domain || !user || !pass || !action) {
      return new Response(JSON.stringify({ error: 'domain, user, pass, action required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Whitelist de actions permitidas (evita SSRF/abuse)
    const ALLOWED = ['get_live_categories', 'get_live_streams', 'get_vod_categories', 'get_vod_streams', 'get_series_categories', 'get_series'];
    if (!ALLOWED.includes(String(action))) {
      return new Response(JSON.stringify({ error: 'action not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitizar domain (deve ser http/https válido, sem path)
    let base: string;
    try {
      const u = new URL(domain);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad proto');
      base = u.origin;
    } catch {
      return new Response(JSON.stringify({ error: 'invalid domain' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = `${base}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${action}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `upstream ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
