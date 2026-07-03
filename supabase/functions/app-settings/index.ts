import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Support both GET requests and POST with action:"get"
    let action = "get";
    let body: any = {};

    if (req.method === "POST") {
      try {
        body = await req.json();
        action = body.action || "update";
      } catch {
        action = "update";
      }
    }

    // ─── READ settings ───
    if (req.method === "GET" || action === "get") {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", "main")
        .maybeSingle();

      if (error) throw error;
      return new Response(JSON.stringify(data || { billing_enabled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE settings ───
    if (action === "update") {
      const adminAuth = req.headers.get("x-admin-auth") || "";

      // Accept both base64 (current frontend) and legacy plain "user:pass"
      let u = "";
      let p = "";
      try {
        const decoded = atob(adminAuth);
        if (decoded.includes(":")) {
          [u, p] = decoded.split(":");
        } else {
          [u, p] = adminAuth.split(":");
        }
      } catch {
        [u, p] = adminAuth.split(":");
      }

      const adminUser = Deno.env.get("ADMIN_USER");
      const adminPass = Deno.env.get("ADMIN_PASS");
      if (u !== adminUser || p !== adminPass) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { billing_enabled } = body;

      const { error } = await supabase
        .from("app_settings")
        .update({ billing_enabled, updated_at: new Date().toISOString() })
        .eq("id", "main");

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, billing_enabled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
