const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Whitelist of allowed webhook domains
const ALLOWED_DOMAINS = [
  "n8n.io",
  "app.n8n.cloud",
  "hooks.n8n.cloud",
  "n8n.lovable.app",
  "make.com",
  "hook.us1.make.com",
  "hook.eu1.make.com",
  "hook.integromat.com",
  "hooks.zapier.com",
  "automation.lovable.app",
];

function isAllowedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();
    // Check exact match or subdomain match
    return ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

function validateAdmin(req: Request): boolean {
  const authHeader = req.headers.get("x-admin-auth") || "";
  const ADMIN_USER = Deno.env.get("ADMIN_USER");
  const ADMIN_PASS = Deno.env.get("ADMIN_PASS");
  if (!ADMIN_USER || !ADMIN_PASS) return false;

  try {
    const decoded = atob(authHeader);
    const [user, pass] = decoded.split(":");
    return user === ADMIN_USER && pass === ADMIN_PASS;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Require admin authentication
  if (!validateAdmin(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { webhook_url, payload } = await req.json();

    if (!webhook_url || !payload) {
      return new Response(
        JSON.stringify({ error: "webhook_url and payload are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate webhook_url against whitelist
    if (!isAllowedUrl(webhook_url)) {
      return new Response(
        JSON.stringify({
          error: "Domain not allowed",
          allowed_domains: ALLOWED_DOMAINS,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    return new Response(
      JSON.stringify({ status: response.status, data: responseText }),
      {
        status: response.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("n8n-proxy error:", error);
    return new Response(
      JSON.stringify({ error: error?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
