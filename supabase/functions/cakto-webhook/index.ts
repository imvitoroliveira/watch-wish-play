import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map checkout URLs to plan details
const PLAN_MAP: Record<string, { plan: string; days: number }> = {
  "33r6n8m_738327": { plan: "mensal", days: 30 },
  "3czpic5": { plan: "trimestral", days: 90 },
  "9mgrzzt": { plan: "semestral", days: 180 },
};

function getPlanFromCheckout(checkoutId: string): { plan: string; days: number } | null {
  for (const [key, value] of Object.entries(PLAN_MAP)) {
    if (checkoutId.includes(key)) return value;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const natvToken = Deno.env.get("NATV_API_TOKEN")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // POST from Cakto webhook or from our frontend (to generate checkout URL)
    if (req.method === "POST") {
      const body = await req.json();

      // Frontend request: get checkout URL with username embedded
      if (body.action === "get_checkout_url") {
        const { username, plan } = body;
        if (!username || !plan) {
          return new Response(JSON.stringify({ error: "username and plan required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const checkoutUrls: Record<string, string> = {
          mensal: "https://pay.cakto.com.br/33r6n8m_738327",
          trimestral: "https://pay.cakto.com.br/3czpic5",
          semestral: "https://pay.cakto.com.br/9mgrzzt",
        };

        const baseUrl = checkoutUrls[plan];
        if (!baseUrl) {
          return new Response(JSON.stringify({ error: "invalid plan" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Append username as query parameter for identification
        const url = `${baseUrl}?username=${encodeURIComponent(username)}`;

        return new Response(JSON.stringify({ url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cakto webhook event
      if (body.event === "purchase_approved" || body.event === "subscription_renewed") {
        console.log(`[Cakto Webhook] Event: ${body.event}`, JSON.stringify(body));

        // Extract username from the checkout custom field or from metadata
        const username =
          body.data?.buyer?.custom_fields?.username ||
          body.data?.metadata?.username ||
          body.data?.checkout?.custom_params?.username ||
          // Try to extract from the checkout URL query params
          extractUsernameFromTracker(body);

        if (!username) {
          console.error("[Cakto Webhook] No username found in payload");
          return new Response(JSON.stringify({ error: "no username found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Determine plan from checkout/product info
        const checkoutId = body.data?.checkout?.id || body.data?.product?.id || "";
        const planInfo = getPlanFromCheckout(checkoutId) || { plan: "mensal", days: 30 };

        console.log(`[Cakto Webhook] Activating user: ${username}, plan: ${planInfo.plan}, days: ${planInfo.days}`);

        // Log the transaction
        const { data: txData } = await supabase.from("payment_transactions").insert({
          client_username: username,
          plan: planInfo.plan,
          days: planInfo.days,
          cakto_transaction_id: body.data?.transaction?.id || body.data?.id || "unknown",
          status: "approved",
        }).select("id").single();

        // Activate user via NATV API
        let natvSuccess = false;
        try {
          const natvResponse = await fetch(
            `https://natv-api.sytes.net/api/user/activation?token=${natvToken}&username=${encodeURIComponent(username)}&days=${planInfo.days}`,
            { method: "GET" }
          );
          const natvResult = await natvResponse.text();
          console.log(`[NATV API] Response: ${natvResult}`);
          natvSuccess = natvResponse.ok;
        } catch (err) {
          console.error("[NATV API] Error:", err);
        }

        // Update transaction with activation status
        if (txData?.id) {
          await supabase.from("payment_transactions").update({
            natv_activated: natvSuccess,
            activated_at: natvSuccess ? new Date().toISOString() : null,
          }).eq("id", txData.id);
        }

        // Also update client status in clients_list if activation succeeded
        if (natvSuccess) {
          try {
            const { data: clientsData } = await supabase
              .from("clients_list")
              .select("clients")
              .eq("id", "00000000-0000-0000-0000-000000000001")
              .maybeSingle();

            if (clientsData?.clients && Array.isArray(clientsData.clients)) {
              const clients = clientsData.clients as any[];
              const clientIndex = clients.findIndex((c: any) => c.u === username);
              if (clientIndex >= 0) {
                // Calculate new expiration date
                const now = new Date();
                const currentExp = clients[clientIndex].e ? new Date(clients[clientIndex].e) : now;
                const baseDate = currentExp > now ? currentExp : now;
                const newExp = new Date(baseDate);
                newExp.setDate(newExp.getDate() + planInfo.days);

                clients[clientIndex].e = newExp.toISOString().split("T")[0];
                clients[clientIndex].t = "Ativo";
                clients[clientIndex]["7"] = "0";

                await supabase.from("clients_list").update({
                  clients,
                  uploaded_at: new Date().toISOString(),
                }).eq("id", "00000000-0000-0000-0000-000000000001");

                console.log(`[Cakto Webhook] Updated client ${username} expiration to ${clients[clientIndex].e}`);
              }
            }
          } catch (err) {
            console.error("[Cakto Webhook] Error updating clients_list:", err);
          }
        }

        return new Response(
          JSON.stringify({ success: true, activated: natvSuccess, username, plan: planInfo.plan }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Unknown event - acknowledge
      console.log(`[Cakto Webhook] Unhandled event: ${body.event}`);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err) {
    console.error("[Cakto Webhook] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractUsernameFromTracker(body: any): string | null {
  // Try various locations where Cakto might put query params
  const tracker = body.data?.tracker || body.data?.utm_content || "";
  if (tracker && typeof tracker === "string") {
    const match = tracker.match(/username[=:]([^&\s]+)/i);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}
