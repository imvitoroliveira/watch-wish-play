import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  try {
    // All methods require admin auth
    if (!validateAdmin(req)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const FIXED_ID = "00000000-0000-0000-0000-000000000001";

    if (req.method === "GET") {
      const { data } = await supabase
        .from("clients_list")
        .select("clients, uploaded_at")
        .eq("id", FIXED_ID)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          clients: data?.clients || [],
          uploaded_at: data?.uploaded_at || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { clients } = body;

      if (!Array.isArray(clients) || clients.length === 0) {
        return new Response(
          JSON.stringify({ error: "Provide a non-empty clients array" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase.from("clients_list").upsert(
        {
          id: FIXED_ID,
          clients: clients,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      return new Response(
        JSON.stringify({ success: true, count: clients.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
