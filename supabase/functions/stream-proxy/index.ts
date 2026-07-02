const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
  "Access-Control-Max-Age": "86400",
};

// In-memory rate limiter: IP -> { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 180; // live HLS may request many short segments; block only abusive bursts

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
    // Remove strict file extension checks since XTREAM/IPTV Live/VOD routes often lack extensions (e.g. /username/password/12345)
    return true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // IPTV servers são rígidos com a extensão no path. 
    // O navegador Chrome/Edge suporta MKV nativamente se o codec for H.264/AAC.
    const playableUrl = streamUrl;
    
    console.log(`[stream-proxy] Tunneling: ${playableUrl.substring(0, 80)}...`);

    // Extract headers from client request to support seeking (Range)
    const forwardHeaders: Record<string, string> = {
      "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
      "Connection": "keep-alive",
    };

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      forwardHeaders["Range"] = rangeHeader;
    }

    const streamRes = await fetch(playableUrl, { 
      headers: forwardHeaders, 
      redirect: "follow" 
    });

    if (!streamRes.ok) {
      console.warn(`[stream-proxy] Upstream error: ${streamRes.status}`);
      // Em caso de 401/403/404, repassamos o código mas sem corpo.
      // Isso permite que o player (GlobalPlayer) detecte a falha e pule para a próxima rota.
      return new Response(null, { 
        status: streamRes.status, 
        headers: corsHeaders 
      });
    }

    // Pass through relevant headers from upstream
    const resHeaders = new Headers(corsHeaders);
    
    const headersToPass = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "server"
    ];

    headersToPass.forEach(h => {
      const val = streamRes.headers.get(h);
      if (val) resHeaders.set(h, val);
    });

    // Live IPTV não deve ser transformado/bufferizado por camadas intermediárias.
    // Isso reduz pausas longas e evita que segmentos antigos sejam reutilizados após reconnect.
    resHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, no-transform");
    resHeaders.set("Pragma", "no-cache");
    resHeaders.set("Expires", "0");
    resHeaders.set("X-Accel-Buffering", "no");

    // Se o upstream não mandar content-type, forçar video/mp4 (genérico para browsers)
    if (!resHeaders.has("content-type")) {
      resHeaders.set("content-type", playableUrl.includes(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp4");
    }

    console.log(`[stream-proxy] Resposta upstream: ${streamRes.status} | Type: ${resHeaders.get("content-type")}`);

    // Middleware M3U8: só tratar como playlist quando o CORPO realmente for #EXTM3U.
    // Alguns painéis XTream respondem uma rota ".m3u8" com MPEG-TS ao vivo (video/mp2t).
    // Se usarmos streamRes.text() nesses casos, a função fica presa lendo um stream infinito
    // e o player permanece em loading eterno.
    const contentType = (streamRes.headers.get("content-type") || "").toLowerCase();
    const mayBeM3u8 = playableUrl.toLowerCase().includes(".m3u8") || contentType.includes("mpegurl");

    if (mayBeM3u8 && streamRes.body) {
      const reader = streamRes.body.getReader();
      const firstRead = await reader.read();

      if (firstRead.done || !firstRead.value) {
        return new Response(null, {
          status: streamRes.status,
          headers: resHeaders,
        });
      }

      const decoder = new TextDecoder();
      const firstChunkText = decoder.decode(firstRead.value, { stream: true });

      if (!firstChunkText.trimStart().startsWith("#EXTM3U")) {
        const passthroughStream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(firstRead.value!);

            const pump = async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) controller.enqueue(value);
                }
                controller.close();
              } catch (err) {
                controller.error(err);
              }
            };

            pump();
          },
          cancel() {
            reader.cancel().catch(() => {});
          },
        });

        if (!resHeaders.has("content-type") || resHeaders.get("content-type")?.includes("mpegurl")) {
          resHeaders.set("content-type", "video/mp2t");
        }

        return new Response(passthroughStream, {
          status: streamRes.status,
          headers: resHeaders,
        });
      }

      let m3u8Text = firstChunkText;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) m3u8Text += decoder.decode(value, { stream: true });
      }
      m3u8Text += decoder.decode();

      const proxyBaseUrl = new URL(req.url).origin + new URL(req.url).pathname + "?url=";
      const upstreamBaseUrl = playableUrl.substring(0, playableUrl.lastIndexOf("/") + 1);

      const lines = m3u8Text.split("\n");
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          // É uma URL de segmento (absoluta ou relativa)
          let segmentUrl = trimmed;
          if (!trimmed.startsWith("http")) {
            segmentUrl = upstreamBaseUrl + trimmed;
          }
          return proxyBaseUrl + encodeURIComponent(segmentUrl);
        }
        // Se a linha ditar outro playlist (M3U8 dentro de M3U8), a mesma regra se aplica!
        if (trimmed.startsWith("#EXT-X-STREAM-INF")) {
          return line;
        }
        return line;
      });

      return new Response(rewrittenLines.join("\n"), { 
        status: streamRes.status, 
        headers: resHeaders 
      });
    }

    // Para Filmes, Séries (.mp4, .mkv) apenas devolve o Stream Puro
    return new Response(streamRes.body, { 
      status: streamRes.status, 
      headers: resHeaders 
    });

  } catch (error) {
    console.error(`[stream-proxy] Falha crítica:`, (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
