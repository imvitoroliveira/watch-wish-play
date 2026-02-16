const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TMDB_BASE = 'https://api.themoviedb.org/3';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const TMDB_TOKEN = Deno.env.get('TMDB_API_TOKEN');
  if (!TMDB_TOKEN) {
    return new Response(JSON.stringify({ error: 'TMDB token not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { endpoint, params } = await req.json();

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('/')) {
      return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Whitelist allowed endpoints
    const allowedPrefixes = [
      '/trending/', '/search/', '/discover/', '/movie/', '/tv/',
    ];
    if (!allowedPrefixes.some(p => endpoint.startsWith(p))) {
      return new Response(JSON.stringify({ error: 'Endpoint not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(`${TMDB_BASE}${endpoint}`);
    url.searchParams.set('language', 'pt-BR');
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === 'string') url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${TMDB_TOKEN}`,
        'accept': 'application/json',
      },
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
