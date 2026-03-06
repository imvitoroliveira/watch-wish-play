const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// In-memory rate limiter: IP -> { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // max 30 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

// Cleanup old entries periodically to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

// Domain whitelist for stream URLs
const ALLOWED_STREAM_PATTERNS = [
  /\.(mp4|mkv|avi|m3u8|ts|flv|mov|wmv)(\?|$)/i,
];

function isStreamUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    // Must be http or https
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    // Must look like a media file or HLS stream
    return ALLOWED_STREAM_PATTERNS.some((p) => p.test(url.pathname + url.search));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                   req.headers.get("cf-connecting-ip") ||
                   "unknown";
  if (!checkRateLimit(clientIP)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Max 30 requests/minute." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    let streamUrl: string | null = null;

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

    // Validate URL looks like a media stream
    if (!isStreamUrl(streamUrl)) {
      return new Response(
        JSON.stringify({ error: "URL must point to a media file (.mp4, .m3u8, .ts, etc.)" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Block local/internal network requests (SSRF prevention)
    try {
      const parsedUrl = new URL(streamUrl);
      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "0.0.0.0" ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.") ||
        hostname.startsWith("192.168.") ||
        hostname === "metadata.google.internal" ||
        hostname.endsWith(".internal")
      ) {
        return new Response(
          JSON.stringify({ error: "Internal URLs are not allowed" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert .mkv to .mp4 for browser compatibility
    const playableUrl = streamUrl.replace(/\.(mkv|avi|wmv|flv|mov)(\?|$)/i, '.mp4$2');
    
    console.log(`[stream-proxy] Proxying: ${playableUrl.substring(0, 100)}...`);

    // Try fetching with various User-Agents and headers that IPTV servers expect
    const headers: Record<string, string> = {
      "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
      "Accept": "*/*",
      "Connection": "keep-alive",
    };

    // Extract range header from client request to support seeking
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    const streamRes = await fetch(playableUrl, { headers, redirect: "follow" });

    if (!streamRes.ok || !streamRes.body) {
      console.error(`[stream-proxy] Upstream HTTP ${streamRes.status} for ${playableUrl.substring(0, 80)}`);
      
      // If mp4 fails, try the original URL
      if (playableUrl !== streamUrl) {
        console.log(`[stream-proxy] Retrying with original URL...`);
        const retryRes = await fetch(streamUrl, { headers, redirect: "follow" });
        if (retryRes.ok && retryRes.body) {
          const contentType = retryRes.headers.get("content-type") || "video/mp4";
          const contentLength = retryRes.headers.get("content-length");
          const resHeaders: Record<string, string> = {
            ...corsHeaders,
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
          };
          if (contentLength) resHeaders["Content-Length"] = contentLength;
          if (retryRes.headers.get("accept-ranges")) resHeaders["Accept-Ranges"] = retryRes.headers.get("accept-ranges")!;
          return new Response(retryRes.body, { status: retryRes.status, headers: resHeaders });
        }
        const retryBody = await retryRes.text().catch(() => "");
        console.error(`[stream-proxy] Retry also failed: HTTP ${retryRes.status} ${retryBody.substring(0, 200)}`);
      }

      return new Response(
        JSON.stringify({ error: `Upstream HTTP ${streamRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = streamRes.headers.get("content-type") || "video/mp4";
    const contentLength = streamRes.headers.get("content-length");

    const resHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    };
    if (contentLength) resHeaders["Content-Length"] = contentLength;
    if (streamRes.headers.get("accept-ranges")) resHeaders["Accept-Ranges"] = streamRes.headers.get("accept-ranges")!;
    if (streamRes.headers.get("content-range")) resHeaders["Content-Range"] = streamRes.headers.get("content-range")!;

    return new Response(streamRes.body, { status: streamRes.status, headers: resHeaders });
  } catch (error) {
    console.error("[stream-proxy] Error:", (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
