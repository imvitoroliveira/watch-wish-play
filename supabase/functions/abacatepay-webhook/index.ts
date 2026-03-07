import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Valid plans with price in cents and duration
const VALID_PLANS: Record<string, { priceCents: number; days: number; label: string }> = {
  mensal: { priceCents: 3500, days: 30, label: "Renovação 1 Mês" },
  trimestral: { priceCents: 9000, days: 90, label: "Renovação 3 Meses" },
  semestral: { priceCents: 17000, days: 180, label: "Renovação 6 Meses" },
};

// Reverse lookup: price → plan
const PLAN_BY_AMOUNT: Record<number, string> = {
  3500: "mensal",
  9000: "trimestral",
  17000: "semestral",
};

// ── Security: Validate webhook authenticity ──
function validateWebhookSecret(req: Request, body: any): { valid: boolean; reason?: string } {
  const webhookSecret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET");

  if (!webhookSecret) {
    console.error("[Security] ABACATEPAY_WEBHOOK_SECRET not configured — rejecting all webhooks");
    return { valid: false, reason: "webhook secret not configured on server" };
  }

  // Check header first, then body field
  const receivedSecret = req.headers.get("x-webhook-secret") || body?.secret;

  if (!receivedSecret) {
    console.error("[Security] No webhook secret provided in request");
    return { valid: false, reason: "missing webhook secret" };
  }

  // Constant-time comparison to prevent timing attacks
  if (receivedSecret.length !== webhookSecret.length) {
    console.error("[Security] Webhook secret length mismatch");
    return { valid: false, reason: "invalid webhook secret" };
  }

  let mismatch = 0;
  for (let i = 0; i < webhookSecret.length; i++) {
    mismatch |= webhookSecret.charCodeAt(i) ^ receivedSecret.charCodeAt(i);
  }

  if (mismatch !== 0) {
    console.error("[Security] Webhook secret mismatch — possible forgery attempt");
    return { valid: false, reason: "invalid webhook secret" };
  }

  return { valid: true };
}

// ── Security: Validate payment data integrity ──
function validatePaymentData(billingData: any, metadata: any): { valid: boolean; reason?: string; plan?: string; days?: number } {
  const username = metadata?.username;
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    return { valid: false, reason: "missing or invalid username in metadata" };
  }

  // Sanitize username: only allow alphanumeric, dots, underscores, hyphens
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(username)) {
    console.error(`[Security] Invalid username format: ${username}`);
    return { valid: false, reason: "invalid username format" };
  }

  // Determine plan from metadata or amount
  let planKey: string | undefined;

  if (metadata?.plan && typeof metadata.plan === "string") {
    planKey = metadata.plan.toLowerCase();
    if (!VALID_PLANS[planKey]) {
      console.error(`[Security] Invalid plan in metadata: ${metadata.plan}`);
      return { valid: false, reason: "invalid plan in metadata" };
    }
  } else {
    // Fallback: determine from amount
    const amount = billingData?.amount || billingData?.products?.[0]?.price;
    if (typeof amount === "number" && PLAN_BY_AMOUNT[amount]) {
      planKey = PLAN_BY_AMOUNT[amount];
    } else {
      console.error(`[Security] Cannot determine plan — no valid plan in metadata or recognizable amount`);
      return { valid: false, reason: "cannot determine plan from payment data" };
    }
  }

  // Cross-validate: if both plan and amount are present, they must match
  if (metadata?.plan && billingData?.amount) {
    const expectedPrice = VALID_PLANS[planKey]?.priceCents;
    if (expectedPrice && billingData.amount !== expectedPrice) {
      console.error(`[Security] Price mismatch: plan=${planKey} expects ${expectedPrice}, got ${billingData.amount}`);
      return { valid: false, reason: "plan/amount mismatch — possible tampering" };
    }
  }

  const plan = VALID_PLANS[planKey];
  return { valid: true, plan: planKey, days: plan.days };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── Action: create_billing (creates dynamic billing via AbacatePay API with metadata) ───
    if (body.action === "create_billing") {
      const { username, plan } = body;
      if (!username || !plan) {
        return new Response(JSON.stringify({ error: "username and plan required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!VALID_PLANS[plan]) {
        return new Response(JSON.stringify({ error: "invalid plan" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sanitize username
      if (!/^[a-zA-Z0-9._-]{1,100}$/.test(username)) {
        return new Response(JSON.stringify({ error: "invalid username format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const abacateApiKey = Deno.env.get("ABACATEPAY_API_KEY");
      if (!abacateApiKey) {
        console.error("[create_billing] ABACATEPAY_API_KEY not configured");
        return new Response(JSON.stringify({ error: "payment service unavailable" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const planInfo = VALID_PLANS[plan];
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

      try {
      const returnUrl = "https://clientestoptv.lovable.app";

      const abacateRes = await fetch("https://api.abacatepay.com/v1/billing/create", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${abacateApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            frequency: "ONE_TIME",
            methods: ["PIX"],
            returnUrl: returnUrl,
            completionUrl: returnUrl,
            products: [
              {
                externalId: `${plan}_${username}`,
                name: planInfo.label,
                description: `Renovação ${planInfo.label} - ${username}`,
                quantity: 1,
                price: planInfo.priceCents,
              },
            ],
            metadata: {
              username: username,
              plan: plan,
            },
          }),
        });

        const abacateData = await abacateRes.json();

        if (!abacateRes.ok || !abacateData?.data?.url) {
          console.error("[create_billing] AbacatePay API error:", JSON.stringify(abacateData));
          return new Response(JSON.stringify({ error: "failed to create billing" }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`[create_billing] Created billing for ${username}, plan=${plan}, url=${abacateData.data.url}`);

        return new Response(JSON.stringify({ 
          success: true, 
          url: abacateData.data.url,
          billing_id: abacateData.data.id,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("[create_billing] Error:", err);
        return new Response(JSON.stringify({ error: "payment service error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── Webhook: billing.paid event from AbacatePay ───
    if (body.event === "billing.paid" || body.event === "BILLING_PAID") {
      // STEP 1: Validate webhook secret (MANDATORY)
      const secretValidation = validateWebhookSecret(req, body);
      if (!secretValidation.valid) {
        console.error(`[Security] Webhook REJECTED: ${secretValidation.reason}`);
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[AbacatePay Webhook] Authenticated event: ${body.event}`);

      const billingData = body.data || body;
      const metadata = billingData.metadata || {};

      // STEP 2: Validate payment data integrity
      const paymentValidation = validatePaymentData(billingData, metadata);
      if (!paymentValidation.valid) {
        console.error(`[Security] Payment validation FAILED: ${paymentValidation.reason}`);
        return new Response(JSON.stringify({ error: paymentValidation.reason }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const username = metadata.username.trim();
      const planKey = paymentValidation.plan!;
      const days = paymentValidation.days!;

      // STEP 3: Check for duplicate transactions
      const transactionId = billingData.id || billingData.billing_id || "unknown";
      const abacateTransactionId = `abacate_${transactionId}`;

      if (transactionId !== "unknown") {
        const { data: existingTx } = await supabase
          .from("payment_transactions")
          .select("id")
          .eq("cakto_transaction_id", abacateTransactionId)
          .maybeSingle();

        if (existingTx) {
          console.warn(`[Security] Duplicate transaction detected: ${abacateTransactionId} — skipping`);
          return new Response(JSON.stringify({ success: true, message: "already processed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      console.log(`[AbacatePay Webhook] Validated: user=${username}, plan=${planKey}, days=${days}, tx=${abacateTransactionId}`);

      // STEP 4: Log transaction BEFORE activation
      const { data: txData } = await supabase.from("payment_transactions").insert({
        client_username: username,
        plan: planKey,
        days: days,
        cakto_transaction_id: abacateTransactionId,
        status: "approved",
      }).select("id").single();

      // STEP 5: Activate via NATV API
      const natvToken = Deno.env.get("NATV_API_TOKEN")!;
      let natvSuccess = false;
      try {
        const natvResponse = await fetch(
          `https://natv-api.sytes.net/api/user/activation?token=${natvToken}&username=${encodeURIComponent(username)}&days=${days}`,
          { method: "GET" }
        );
        const natvResult = await natvResponse.text();
        console.log(`[NATV API] Response: ${natvResult}`);
        natvSuccess = natvResponse.ok;
      } catch (err) {
        console.error("[NATV API] Error:", err);
      }

      // STEP 6: Update transaction status
      if (txData?.id) {
        await supabase.from("payment_transactions").update({
          natv_activated: natvSuccess,
          activated_at: natvSuccess ? new Date().toISOString() : null,
        }).eq("id", txData.id);
      }

      // STEP 7: Update clients_list expiration
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
              newExp.setDate(newExp.getDate() + days);

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
        JSON.stringify({ success: true, activated: natvSuccess, username, plan: planKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown event — don't process, just acknowledge
    console.log(`[AbacatePay Webhook] Unhandled event: ${body.event || "none"}`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[AbacatePay Webhook] Error:", err);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
