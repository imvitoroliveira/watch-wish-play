import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate admin auth
  const adminAuth = req.headers.get("x-admin-auth");
  if (!adminAuth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let user = "", pass = "";
  try {
    const decoded = atob(adminAuth);
    [user, pass] = decoded.split(":");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid auth format" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminUser = Deno.env.get("ADMIN_USER");
  const adminPass = Deno.env.get("ADMIN_PASS");

  if (!user || !pass || user !== adminUser || pass !== adminPass) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { action, username } = await req.json();

    // Action: validate — test PushAlert API connectivity without sending
    if (action === "validate") {
      const pushAlertKey = Deno.env.get("PUSHALERT_API_KEY");
      if (!pushAlertKey) {
        return new Response(JSON.stringify({
          success: false,
          error: "PUSHALERT_API_KEY not configured",
          api_reachable: false,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Call PushAlert stats endpoint to validate API key
      const statsRes = await fetch("https://api.pushalert.co/rest/v2/stats/count", {
        method: "GET",
        headers: {
          "Authorization": `api_key=${pushAlertKey}`,
        },
      });
      const statsText = await statsRes.text();
      console.log("[push-test] PushAlert validate response:", statsRes.status, statsText);

      return new Response(JSON.stringify({
        success: statsRes.ok,
        api_reachable: true,
        api_status: statsRes.status,
        api_response: statsText.substring(0, 200),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: send — send a real test push to a specific user
    if (action === "send") {
      if (!username) {
        return new Response(JSON.stringify({ error: "username required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pushAlertKey = Deno.env.get("PUSHALERT_API_KEY");
      if (!pushAlertKey) {
        return new Response(JSON.stringify({ success: false, error: "PUSHALERT_API_KEY not configured" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const params = new URLSearchParams();
      params.append("title", "🔔 Teste de Notificação");
      params.append("message", `Esta é uma notificação de teste enviada pelo gestor.`);
      params.append("url", "https://clientestoptv.lovable.app/dashboard");
      params.append("attributes", JSON.stringify({ username }));

      const pushRes = await fetch("https://api.pushalert.co/rest/v2/web-push/send", {
        method: "POST",
        headers: {
          "Authorization": `api_key=${pushAlertKey}`,
        },
        body: params,
      });

      const pushText = await pushRes.text();
      console.log(`[push-test] Send to ${username}:`, pushRes.status, pushText);

      let pushData: any;
      try { pushData = JSON.parse(pushText); } catch { pushData = pushText; }

      return new Response(JSON.stringify({
        success: pushRes.ok,
        push_status: pushRes.status,
        push_response: pushData,
        username,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'validate' or 'send'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
