import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ABACATE_API = "https://api.abacatepay.com/v1";

// Plan config: price in cents → plan details
const PLAN_BY_AMOUNT: Record<number, { plan: string; days: number }> = {
  3500: { plan: "mensal", days: 30 },
  9000: { plan: "trimestral", days: 90 },
  17000: { plan: "semestral", days: 180 },
};

function getPlanByAmount(amountCents: number): { plan: string; days: number } {
  return PLAN_BY_AMOUNT[amountCents] || { plan: "mensal", days: 30 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const natvToken = Deno.env.get("NATV_API_TOKEN")!;
    const abacateApiKey = Deno.env.get("ABACATEPAY_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: create_billing (called from frontend) ───
    if (body.action === "create_billing") {
      const { username, plan } = body;
      if (!username || !plan) {
        return new Response(JSON.stringify({ error: "username and plan required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const planPrices: Record<string, number> = {
        mensal: 3500,
        trimestral: 9000,
        semestral: 17000,
      };

      const priceCents = planPrices[plan];
      if (!priceCents) {
        return new Response(JSON.stringify({ error: "invalid plan" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const planLabels: Record<string, string> = {
        mensal: "Renovação 1 Mês",
        trimestral: "Renovação 3 Meses",
        semestral: "Renovação 6 Meses",
      };

      // Create billing via AbacatePay API
      const billingResponse = await fetch(`${ABACATE_API}/billing/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${abacateApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          frequency: "ONE_TIME",
          methods: ["PIX"],
          products: [
            {
              externalId: `${plan}_${username}_${Date.now()}`,
              name: planLabels[plan],
              quantity: 1,
              price: priceCents,
            },
          ],
          metadata: { username, plan },
          returnUrl: "https://clientestoptv.lovable.app/dashboard",
          completionUrl: "https://clientestoptv.lovable.app/dashboard",
        }),
      });

      const billingData = await billingResponse.json();
      console.log("[AbacatePay] Billing created:", JSON.stringify(billingData));

      if (!billingResponse.ok) {
        console.error("[AbacatePay] Error creating billing:", billingData);
        return new Response(JSON.stringify({ error: "Failed to create billing", details: billingData }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const checkoutUrl = billingData.data?.url || billingData.url;

      return new Response(JSON.stringify({ url: checkoutUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Webhook: billing.paid event from AbacatePay ───
    if (body.event === "billing.paid" || body.event === "BILLING_PAID") {
      // Validate webhook secret
      const webhookSecret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET");
      const receivedSecret = req.headers.get("x-webhook-secret") || body.secret;
      if (webhookSecret && receivedSecret !== webhookSecret) {
        console.error("[AbacatePay Webhook] Invalid webhook secret");
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[AbacatePay Webhook] Event: ${body.event}`, JSON.stringify(body));

      const billingData = body.data || body;
      const metadata = billingData.metadata || {};
      const username = metadata.username;

      if (!username) {
        console.error("[AbacatePay Webhook] No username found in metadata");
        return new Response(JSON.stringify({ error: "no username in metadata" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine plan from metadata or amount
      let planInfo: { plan: string; days: number };
      if (metadata.plan && ["mensal", "trimestral", "semestral"].includes(metadata.plan)) {
        const planDays: Record<string, number> = { mensal: 30, trimestral: 90, semestral: 180 };
        planInfo = { plan: metadata.plan, days: planDays[metadata.plan] };
      } else {
        const amount = billingData.amount || billingData.products?.[0]?.price || 0;
        planInfo = getPlanByAmount(amount);
      }

      console.log(`[AbacatePay Webhook] Activating: ${username}, plan: ${planInfo.plan}, days: ${planInfo.days}`);

      // Log transaction
      const transactionId = billingData.id || billingData.billing_id || "unknown";
      const { data: txData } = await supabase.from("payment_transactions").insert({
        client_username: username,
        plan: planInfo.plan,
        days: planInfo.days,
        cakto_transaction_id: `abacate_${transactionId}`,
        status: "approved",
      }).select("id").single();

      // Activate via NATV API
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

      // Update transaction status
      if (txData?.id) {
        await supabase.from("payment_transactions").update({
          natv_activated: natvSuccess,
          activated_at: natvSuccess ? new Date().toISOString() : null,
        }).eq("id", txData.id);
      }

      // Update clients_list expiration
      if (natvSuccess) {
        try {
          const { data: clientsData } = await supabase
            .from("clients_list")
            .select("clients")
            .eq("id", "00000000-0000-0000-0000-000000000001")
            .maybeSingle();

          if (clientsData?.clients && Array.isArray(clientsData.clients)) {
            const clients = clientsData.clients as any[];
            const idx = clients.findIndex((c: any) => c.u === username);
            if (idx >= 0) {
              const now = new Date();
              const currentExp = clients[idx].e ? new Date(clients[idx].e) : now;
              const baseDate = currentExp > now ? currentExp : now;
              const newExp = new Date(baseDate);
              newExp.setDate(newExp.getDate() + planInfo.days);

              clients[idx].e = newExp.toISOString().split("T")[0];
              clients[idx].t = "Ativo";
              clients[idx]["7"] = "0";

              await supabase.from("clients_list").update({
                clients,
                uploaded_at: new Date().toISOString(),
              }).eq("id", "00000000-0000-0000-0000-000000000001");

              console.log(`[AbacatePay Webhook] Updated ${username} exp to ${clients[idx].e}`);
            }
          }
        } catch (err) {
          console.error("[AbacatePay Webhook] Error updating clients_list:", err);
        }
      }

      return new Response(
        JSON.stringify({ success: true, activated: natvSuccess, username, plan: planInfo.plan }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown event
    console.log(`[AbacatePay Webhook] Unhandled event: ${body.event || "none"}`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[AbacatePay Webhook] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
