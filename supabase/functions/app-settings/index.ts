import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-auth",
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
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", "main")
        .maybeSingle();

      if (error) throw error;
      return new Response(JSON.stringify(data || { billing_enabled: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      // Verify admin
      const adminAuth = req.headers.get("x-admin-auth") || "";
      const [u, p] = adminAuth.split(":");
      const adminUser = Deno.env.get("ADMIN_USER");
      const adminPass = Deno.env.get("ADMIN_PASS");
      if (u !== adminUser || p !== adminPass) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
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
