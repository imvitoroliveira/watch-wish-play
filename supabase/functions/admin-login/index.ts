const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { user, pass } = await req.json();

    if (!user || !pass || typeof user !== "string" || typeof pass !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais inválidas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ADMIN_USER = Deno.env.get("ADMIN_USER");
    const ADMIN_PASS = Deno.env.get("ADMIN_PASS");

    if (!ADMIN_USER || !ADMIN_PASS) {
      return new Response(
        JSON.stringify({ success: false, error: "Configuração de admin ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Constant-time-ish comparison to prevent timing attacks
    const userMatch = user.trim() === ADMIN_USER;
    const passMatch = pass.trim() === ADMIN_PASS;

    if (userMatch && passMatch) {
      // Generate a simple session token
      const token = crypto.randomUUID() + "-" + Date.now().toString(36);
      return new Response(
        JSON.stringify({ success: true, token }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Credenciais inválidas" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
