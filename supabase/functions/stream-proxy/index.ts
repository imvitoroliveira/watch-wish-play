const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let streamUrl: string | null = null;

    // Accept URL from query param (GET) or body (POST)
    if (req.method === "GET") {
      const url = new URL(req.url);
      streamUrl = url.searchParams.get("url");
    } else {
      const body = await req.json();
      streamUrl = body.url || body.streamUrl || null;
    }

    if (!streamUrl) {
      return new Response(
        JSON.stringify({ error: "Stream URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[stream-proxy] Proxying: ${streamUrl.substring(0, 100)}...`);

    // Parse the stream URL to extract origin for Referer
    const parsedUrl = new URL(streamUrl);
    const origin = parsedUrl.origin;

    const streamRes = await fetch(streamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": origin + "/",
        "Origin": origin,
      },
      redirect: "follow",
    });

    if (!streamRes.ok || !streamRes.body) {
      console.error(`[stream-proxy] Upstream HTTP ${streamRes.status}`);
      return new Response(
        JSON.stringify({ error: `Upstream HTTP ${streamRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = streamRes.headers.get("content-type") || "video/mp2t";
    const contentLength = streamRes.headers.get("content-length");

    const headers: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Accept-Ranges": "none",
    };
    if (contentLength) headers["Content-Length"] = contentLength;

    // Stream the body directly - no buffering
    return new Response(streamRes.body, { status: 200, headers });
  } catch (error) {
    console.error("[stream-proxy] Error:", (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
