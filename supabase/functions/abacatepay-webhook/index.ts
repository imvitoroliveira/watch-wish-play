import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-webhook-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
// PLANS CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const VALID_PLANS: Record<string, { priceCents: number; days: number; months: number; label: string }> = {
  mensal: { priceCents: 3500, days: 30, months: 1, label: "Renovação 1 Mês" },
  trimestral: { priceCents: 9000, days: 90, months: 3, label: "Renovação 3 Meses" },
  semestral: { priceCents: 17000, days: 180, months: 6, label: "Renovação 6 Meses" },
};

const PLAN_BY_AMOUNT: Record<number, string> = {
  3500: "mensal",
  9000: "trimestral",
  17000: "semestral",
};

// All events AbacatePay may send when a payment is confirmed
const PAID_EVENTS = [
  "billing.paid", "BILLING_PAID",           // v1
  "checkout.completed", "checkout.paid",      // v2
  "payment.completed",                        // v2
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function generateDeterministicCpf(username: string): string {
  let seed = 2166136261;
  for (let i = 0; i < username.length; i++) {
    seed ^= username.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const base: number[] = [];
  let n = Math.abs(seed) || 1;
  for (let i = 0; i < 9; i++) {
    n = (Math.imul(n, 1103515245) + 12345) & 0x7fffffff;
    base.push(n % 10);
  }
  if (base.every((d) => d === base[0])) base[8] = (base[8] + 7) % 10;
  const calcDigit = (digits: number[], f: number) => {
    const s = digits.reduce((a, d, i) => a + d * (f - i), 0);
    const m = s % 11;
    return m < 2 ? 0 : 11 - m;
  };
  const d1 = calcDigit(base, 10);
  const d2 = calcDigit([...base, d1], 11);
  return [...base, d1, d2].join("").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function normalizeBrazilianPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

function buildCustomerEmail(username: string): string {
  const local = username
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 48) || "cliente";
  return `${local}@clientestoptv.com.br`;
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK SECRET VALIDATION
// AbacatePay sends secret as:
//   1) Query parameter: ?webhookSecret=...   (official v2 method)
//   2) Body field: body.secret               (legacy v1)
//   3) Header: x-webhook-secret              (custom)
// ═══════════════════════════════════════════════════════════════
function validateWebhookSecret(req: Request, body: any): { valid: boolean; reason?: string } {
  const webhookSecret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[Security] ABACATEPAY_WEBHOOK_SECRET not configured");
    return { valid: false, reason: "webhook secret not configured" };
  }

  const url = new URL(req.url);
  const receivedSecret =
    url.searchParams.get("webhookSecret") ||
    req.headers.get("x-webhook-secret") ||
    body?.secret;

  if (!receivedSecret) {
    console.error("[Security] No webhook secret found. URL params:", url.search);
    console.error("[Security] Headers x-webhook-secret:", req.headers.get("x-webhook-secret"));
    console.error("[Security] Body has 'secret' key:", "secret" in (body || {}));
    return { valid: false, reason: "missing webhook secret" };
  }

  // Constant-time comparison
  if (receivedSecret.length !== webhookSecret.length) {
    console.error("[Security] Secret length mismatch:", receivedSecret.length, "vs", webhookSecret.length);
    return { valid: false, reason: "invalid webhook secret" };
  }
  let mismatch = 0;
  for (let i = 0; i < webhookSecret.length; i++) {
    mismatch |= webhookSecret.charCodeAt(i) ^ receivedSecret.charCodeAt(i);
  }
  if (mismatch !== 0) {
    console.error("[Security] Secret value mismatch");
    return { valid: false, reason: "invalid webhook secret" };
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════
// EXTRACT USERNAME + PLAN FROM WEBHOOK PAYLOAD
// Searches metadata, externalId, description, and pending transaction
// ═══════════════════════════════════════════════════════════════
function extractUsernameAndPlan(body: any, billingData: any): { username?: string; plan?: string } {
  let username: string | undefined;
  let plan: string | undefined;

  // 1. Direct metadata (multiple possible locations)
  const metadataSources = [
    body?.metadata,
    body?.data?.metadata,
    billingData?.metadata,
    billingData?.checkout?.metadata,
    billingData?.payment?.metadata,
  ];
  for (const m of metadataSources) {
    if (m && typeof m === "object") {
      if (m.username && !username) username = String(m.username).trim();
      if (m.plan && !plan) plan = String(m.plan).trim().toLowerCase();
    }
  }

  // 2. externalId format: "plan_username"
  const externalIdCandidates = [
    billingData?.externalId,
    billingData?.external_id,
    billingData?.checkout?.externalId,
    billingData?.checkout?.external_id,
    billingData?.payment?.externalId,
    billingData?.payment?.external_id,
    billingData?.products?.[0]?.externalId,
    billingData?.items?.[0]?.externalId,
    // AbacatePay v1 nests under billing object
    billingData?.billing?.products?.[0]?.externalId,
    billingData?.billing?.externalId,
  ];
  for (const eid of externalIdCandidates) {
    if (typeof eid !== "string") continue;
    const match = eid.match(/^(mensal|trimestral|semestral)_(.+)$/i);
    if (match) {
      if (!plan) plan = match[1].toLowerCase();
      if (!username) username = match[2];
    }
  }

  // 3. Description format: "Renovação ... - username"
  const descriptions = [
    billingData?.products?.[0]?.description,
    billingData?.items?.[0]?.description,
    billingData?.checkout?.description,
    billingData?.payment?.description,
    billingData?.products?.[0]?.name,
    billingData?.items?.[0]?.name,
    billingData?.billing?.products?.[0]?.description,
    billingData?.billing?.products?.[0]?.name,
  ];
  for (const desc of descriptions) {
    if (typeof desc !== "string") continue;
    const match = desc.match(/- ([a-zA-Z0-9._-]+)$/);
    if (match?.[1] && !username) username = match[1];
  }

  // 4. Determine plan from amount if still missing
  if (!plan) {
    const amount =
      billingData?.billing?.amount ??
      billingData?.amount ??
      billingData?.paidAmount ??
      billingData?.checkout?.amount ??
      billingData?.checkout?.paidAmount ??
      billingData?.payment?.amount ??
      billingData?.payment?.paidAmount ??
      billingData?.products?.[0]?.price ??
      billingData?.items?.[0]?.price ??
      billingData?.billing?.products?.[0]?.price;
    if (typeof amount === "number" && PLAN_BY_AMOUNT[amount]) {
      plan = PLAN_BY_AMOUNT[amount];
    }
  }

  return { username, plan };
}

// Resolve checkout/billing ID from webhook payload
function resolveTransactionId(body: any, billingData: any): string {
  const candidates = [
    billingData?.billing?.id,
    billingData?.checkout?.id,
    billingData?.payment?.id,
    billingData?.id,
    billingData?.billing_id,
    body?.data?.billing?.id,
    body?.data?.checkout?.id,
    body?.data?.payment?.id,
    body?.data?.id,
    body?.data?.billing_id,
    body?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return "unknown";
}

// NATV API activation via POST /user/activation (per OpenAPI spec at revenda.pixbot.link)
// Maps days to months: 30→1, 90→3, 180→6
const DAYS_TO_MONTHS: Record<number, number> = { 30: 1, 90: 3, 180: 6 };

async function activateNatvUser(username: string, days: number, natvToken: string): Promise<boolean> {
  const baseUrl = (Deno.env.get("NATV_API_BASE_URL") || "https://revenda.pixbot.link").trim().replace(/\/$/, "");
  const months = DAYS_TO_MONTHS[days] || 1;
  const natvUrl = `${baseUrl}/user/activation`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[Webhook] NATV activation (attempt ${attempt}): POST ${natvUrl}, username=${username}, months=${months}`);
      
      const natvResponse = await fetch(natvUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${natvToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, months }),
      });

      const natvResult = await natvResponse.text();
      console.log(`[Webhook] NATV Response: status=${natvResponse.status}, body=${natvResult.substring(0, 500)}`);

      if (natvResponse.ok) {
        console.log(`[Webhook] ✅ NATV activation SUCCESS: user=${username}, months=${months}`);
        return true;
      }

      // 402 = insufficient credits, 404 = user not found — don't retry
      if (natvResponse.status === 402 || natvResponse.status === 404) {
        console.error(`[Webhook] NATV non-retryable error (${natvResponse.status}): ${natvResult}`);
        return false;
      }
    } catch (err) {
      console.error(`[Webhook] NATV API network error (attempt ${attempt}):`, err);
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Helper to return JSON
  const jsonResponse = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ═══════════════════════════════════════════════════════════
    // ACTION: create_billing (frontend request to generate checkout URL)
    // ═══════════════════════════════════════════════════════════
    if (body.action === "create_billing") {
      const { username, plan } = body;
      if (!username || !plan) {
        return jsonResponse({ error: "username and plan required" }, 400);
      }
      if (!VALID_PLANS[plan]) {
        return jsonResponse({ error: "invalid plan" }, 400);
      }
      if (!/^[a-zA-Z0-9._-]{1,100}$/.test(username)) {
        return jsonResponse({ error: "invalid username format" }, 400);
      }

      const abacateApiKey = Deno.env.get("ABACATEPAY_API_KEY");
      if (!abacateApiKey) {
        console.error("[create_billing] ABACATEPAY_API_KEY not configured");
        return jsonResponse({ error: "payment service unavailable" }, 500);
      }

      const planInfo = VALID_PLANS[plan];
      const returnUrl = "https://clientestoptv.lovable.app";
      const displayName = username.includes(".")
        ? username.split(".")[0].charAt(0).toUpperCase() + username.split(".")[0].slice(1)
        : username;

      try {
        let clientPhone = "";
        try {
          const { data: clientsRow } = await supabase
            .from("clients_list")
            .select("clients")
            .eq("id", "00000000-0000-0000-0000-000000000001")
            .maybeSingle();
          if (clientsRow?.clients && Array.isArray(clientsRow.clients)) {
            const found = (clientsRow.clients as any[]).find((c: any) => c.u === username);
            const phoneCandidates = [found?.Notas, found?.notas, found?.NOTAS, found?.n, found?.N];
            clientPhone = phoneCandidates.map(normalizeBrazilianPhone).find(Boolean) || "";
          }
        } catch (err) {
          console.warn("[create_billing] Could not fetch client phone:", err);
        }

        const customerObj = {
          name: displayName,
          email: buildCustomerEmail(username),
          cellphone: clientPhone || "11999999999",
          taxId: generateDeterministicCpf(username),
        };

        const billingPayload = {
          frequency: "ONE_TIME",
          methods: ["PIX"],
          returnUrl,
          completionUrl: returnUrl,
          customer: customerObj,
          products: [
            {
              externalId: `${plan}_${username}`,
              name: planInfo.label,
              description: `${planInfo.label} - ${username}`,
              quantity: 1,
              price: planInfo.priceCents,
            },
          ],
          metadata: { username, plan, displayName },
        };

        const abacateRes = await fetch("https://api.abacatepay.com/v1/billing/create", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${abacateApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(billingPayload),
        });

        const abacateRaw = await abacateRes.text();
        let abacateData: any = null;
        try {
          abacateData = abacateRaw ? JSON.parse(abacateRaw) : null;
        } catch {
          console.error("[create_billing] AbacatePay returned non-JSON response", { status: abacateRes.status });
        }
        if (!abacateRes.ok || !abacateData?.data?.url) {
          console.error("[create_billing] AbacatePay API error:", JSON.stringify({ status: abacateRes.status, data: abacateData }));
          return jsonResponse({ error: "failed to create billing" }, 502);
        }

        const billingId = abacateData.data.id as string;
        const transactionRef = billingId ? `abacate_${billingId}` : null;

        if (transactionRef) {
          const { error: txErr } = await supabase.from("payment_transactions").insert({
            client_username: username,
            plan,
            days: planInfo.days,
            provider: "abacatepay",
            provider_transaction_id: transactionRef,
            status: "pending",
          });
          if (txErr) console.warn("[create_billing] Could not store pending tx:", txErr.message);
        }

        console.log(`[create_billing] OK: user=${username}, plan=${plan}, billing=${billingId}`);
        return jsonResponse({ success: true, url: abacateData.data.url, billing_id: billingId });
      } catch (err) {
        console.error("[create_billing] Error:", err);
        return jsonResponse({ error: "payment service error" }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // WEBHOOK: Payment confirmation from AbacatePay
    // ═══════════════════════════════════════════════════════════

    // Log EVERYTHING for debugging (before any validation)
    console.log(`[Webhook] ═══════════════════════════════════════`);
    console.log(`[Webhook] Event: ${body.event || "none"}`);
    console.log(`[Webhook] API Version: ${body.apiVersion || "?"}`);
    console.log(`[Webhook] Dev Mode: ${body.devMode ?? "?"}`);
    console.log(`[Webhook] URL: ${req.url}`);
    console.log(`[Webhook] Headers: ${JSON.stringify(Object.fromEntries(req.headers.entries()))}`);
    console.log(`[Webhook] Body: ${JSON.stringify(body).substring(0, 3000)}`);
    console.log(`[Webhook] ═══════════════════════════════════════`);

    if (PAID_EVENTS.includes(body.event)) {
      // ── STEP 1: Validate webhook secret ──
      const secretCheck = validateWebhookSecret(req, body);
      if (!secretCheck.valid) {
        console.error(`[Webhook] REJECTED: ${secretCheck.reason}`);
        return jsonResponse({ error: "unauthorized" }, 401);
      }
      console.log(`[Webhook] ✅ Secret validated for event: ${body.event}`);

      const billingData = body.data || body;

      // ── STEP 2: Resolve transaction ID & find pending transaction ──
      const rawTxId = resolveTransactionId(body, billingData);
      const abacateTxId = rawTxId !== "unknown" ? `abacate_${rawTxId}` : null;
      console.log(`[Webhook] Transaction ID: ${abacateTxId || "unknown"}`);

      let existingTx: {
        id: string; status: string; natv_activated: boolean;
        client_username: string; plan: string; days: number;
      } | null = null;

      if (abacateTxId) {
        const { data } = await supabase
          .from("payment_transactions")
          .select("id, status, natv_activated, client_username, plan, days")
          .eq("provider_transaction_id", abacateTxId)
          .maybeSingle();
        existingTx = data;
        console.log(`[Webhook] Pending tx lookup by ID: ${existingTx ? "FOUND" : "NOT FOUND"}`);
      }

      // Skip only if already approved AND NATV already activated
      const alreadyApproved = existingTx?.status === "approved";
      if (alreadyApproved && existingTx?.natv_activated) {
        console.warn(`[Webhook] Already processed with NATV activated: ${abacateTxId}`);
        return jsonResponse({ success: true, message: "already processed" });
      }
      if (alreadyApproved && !existingTx?.natv_activated) {
        console.warn(`[Webhook] Approved tx without NATV activation detected. Retrying NATV activation for: ${abacateTxId}`);
      }

      // ── STEP 3: Extract username + plan from payload ──
      const extracted = extractUsernameAndPlan(body, billingData);
      
      // Merge with pending transaction data as fallback
      const username = (extracted.username || existingTx?.client_username || "").trim();
      const planKey = extracted.plan || existingTx?.plan || "";
      
      console.log(`[Webhook] Extracted: username=${username}, plan=${planKey}`);

      // If we couldn't find tx by ID, try by username
      if (!existingTx && username) {
        const { data } = await supabase
          .from("payment_transactions")
          .select("id, status, natv_activated, client_username, plan, days")
          .eq("client_username", username)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          existingTx = data;
          console.log(`[Webhook] Found pending tx by username fallback: ${data.id}`);
        }
      }

      // Validate we have what we need
      if (!username || !/^[a-zA-Z0-9._-]{1,100}$/.test(username)) {
        console.error(`[Webhook] Invalid or missing username: "${username}"`);
        return jsonResponse({ error: "missing or invalid username" }, 400);
      }
      if (!planKey || !VALID_PLANS[planKey]) {
        console.error(`[Webhook] Invalid or missing plan: "${planKey}"`);
        return jsonResponse({ error: "invalid plan" }, 400);
      }

      const days = existingTx?.days || VALID_PLANS[planKey].days;
      console.log(`[Webhook] ✅ Validated: user=${username}, plan=${planKey}, days=${days}`);

      // ── STEP 4: Ensure transaction is approved ──
      let txId: string | null = existingTx?.id || null;
      if (!alreadyApproved) {
        if (existingTx?.id) {
          const { data } = await supabase
            .from("payment_transactions")
            .update({ client_username: username, plan: planKey, days, status: "approved" })
            .eq("id", existingTx.id)
            .select("id")
            .single();
          txId = data?.id || null;
          console.log(`[Webhook] Updated existing tx to approved: ${txId}`);
        } else {
          const { data } = await supabase
            .from("payment_transactions")
            .insert({
              client_username: username,
              plan: planKey,
              days,
              provider: "abacatepay",
              provider_transaction_id: abacateTxId,
              status: "approved",
            })
            .select("id")
            .single();
          txId = data?.id || null;
          console.log(`[Webhook] Inserted new approved tx: ${txId}`);
        }
      } else {
        console.log(`[Webhook] Reusing existing approved tx for NATV retry: ${txId}`);
      }

      // ── STEP 5: Activate via NATV API ──
      const natvToken = Deno.env.get("NATV_API_TOKEN");
      let natvSuccess = false;
      if (!natvToken) {
        console.error("[Webhook] NATV_API_TOKEN not configured!");
      } else {
        natvSuccess = await activateNatvUser(username, days, natvToken);
        if (!natvSuccess) {
          console.error(`[Webhook] NATV activation FAILED after retries: user=${username}, days=${days}`);
        }
      }

      // ── STEP 6: Record activation result ──
      if (txId) {
        await supabase.from("payment_transactions").update({
          natv_activated: natvSuccess,
          activated_at: natvSuccess ? new Date().toISOString() : null,
        }).eq("id", txId);
      }

      // ── STEP 7: Update clients_list expiration ──
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

              console.log(`[Webhook] ✅ Updated ${username} expiration to ${clients[idx].e}`);
            } else {
              console.warn(`[Webhook] User ${username} not found in clients_list`);
            }
          }
        } catch (err) {
          console.error("[Webhook] Error updating clients_list:", err);
        }
      }

      console.log(`[Webhook] ═══ COMPLETE: user=${username}, plan=${planKey}, natv=${natvSuccess} ═══`);
      if (!natvSuccess) {
        return jsonResponse({ success: false, activated: false, username, plan: planKey, error: "natv activation failed" }, 502);
      }
      return jsonResponse({ success: true, activated: true, username, plan: planKey });
    }

    // Unknown event — acknowledge to prevent AbacatePay retries
    console.log(`[Webhook] Unhandled event: ${body.event || "none"} — acknowledging`);
    return jsonResponse({ received: true });

  } catch (err) {
    console.error("[Webhook] UNHANDLED ERROR:", err);
    // Return 200 to prevent AbacatePay from retrying on our internal errors
    return jsonResponse({ error: "internal error", received: true }, 200);
  }
});
