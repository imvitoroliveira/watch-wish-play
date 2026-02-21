import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[stream-proxy] Proxying: ${url.substring(0, 80)}...`);

    // Fetch the stream from the IPTV server
    const streamRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": new URL(url).origin + "/",
      },
    });

    if (!streamRes.ok) {
      console.error(`[stream-proxy] Upstream error: HTTP ${streamRes.status}`);
      return new Response(
        JSON.stringify({ error: `Upstream returned HTTP ${streamRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine content type
    const contentType = streamRes.headers.get("content-type") || "video/mp2t";
    const contentLength = streamRes.headers.get("content-length");

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Access-Control-Expose-Headers": "Content-Length, Content-Type",
    };

    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    // Stream the response body directly through
    return new Response(streamRes.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[stream-proxy] Error:", (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
