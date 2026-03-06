import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface TestCase {
  name: string;
  category: "functional" | "security" | "regression";
  fn: string;
  method: string;
  body?: any;
  headers?: Record<string, string>;
  expect: {
    status?: number[];
    hasKey?: string;
    notContains?: string[];
  };
}

const TEST_SUITE: TestCase[] = [
  // admin-login
  { name: "admin-login: rejeitar vazio", category: "functional", fn: "admin-login", method: "POST", body: { user: "", pass: "" }, expect: { status: [400] } },
  { name: "admin-login: rejeitar inválido", category: "functional", fn: "admin-login", method: "POST", body: { user: "fake", pass: "wrong" }, expect: { status: [401] } },
  { name: "admin-login: não vazar config", category: "security", fn: "admin-login", method: "POST", body: { user: "x", pass: "y" }, expect: { notContains: ["admin_user", "admin_pass", "service_role"] } },
  { name: "admin-login: rejeitar GET", category: "security", fn: "admin-login", method: "GET", expect: { status: [405] } },
  { name: "admin-login: formato estável", category: "regression", fn: "admin-login", method: "POST", body: { user: "x", pass: "y" }, expect: { status: [401], hasKey: "success" } },

  // client-login
  { name: "client-login: rejeitar vazio", category: "functional", fn: "client-login", method: "POST", body: { action: "login", username: "", password: "" }, expect: { status: [400] } },
  { name: "client-login: rejeitar inexistente", category: "functional", fn: "client-login", method: "POST", body: { action: "login", username: "nonexistent_xyz", password: "wrong" }, expect: { hasKey: "success" } },
  { name: "client-login: ação inválida", category: "functional", fn: "client-login", method: "POST", body: { action: "unknown" }, expect: { status: [400] } },
  { name: "client-login: sem vazamento", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test", password: "test" }, expect: { notContains: ["service_role"] } },

  // app-settings
  { name: "app-settings: GET retorna billing", category: "functional", fn: "app-settings", method: "GET", expect: { status: [200], hasKey: "billing_enabled" } },
  { name: "app-settings: POST sem auth = 401", category: "security", fn: "app-settings", method: "POST", body: { billing_enabled: true }, expect: { status: [401] } },
  { name: "app-settings: POST auth inválida = 401", category: "security", fn: "app-settings", method: "POST", body: { billing_enabled: true }, headers: { "x-admin-auth": "fake:creds" }, expect: { status: [401] } },
  { name: "app-settings: formato GET estável", category: "regression", fn: "app-settings", method: "GET", expect: { status: [200], hasKey: "billing_enabled" } },

  // manage-clients
  { name: "manage-clients: GET retorna clients", category: "functional", fn: "manage-clients", method: "GET", expect: { status: [200], hasKey: "clients" } },
  { name: "manage-clients: POST vazio = 400", category: "functional", fn: "manage-clients", method: "POST", body: { clients: [] }, expect: { status: [400] } },
  { name: "manage-clients: sem chaves serviço", category: "security", fn: "manage-clients", method: "GET", expect: { notContains: ["service_role", "SUPABASE_SERVICE_ROLE_KEY"] } },
  { name: "manage-clients: formato estável", category: "regression", fn: "manage-clients", method: "GET", expect: { status: [200], hasKey: "clients" } },

  // user-presence
  { name: "user-presence: heartbeat ok", category: "functional", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "health_check_test" }, expect: { status: [200], hasKey: "ok" } },
  { name: "user-presence: logout ok", category: "functional", fn: "user-presence", method: "POST", body: { action: "logout", username: "health_check_test" }, expect: { status: [200], hasKey: "ok" } },
  { name: "user-presence: list sem auth = 401", category: "security", fn: "user-presence", method: "POST", body: { action: "list_online" }, expect: { status: [401] } },
  { name: "user-presence: formato estável", category: "regression", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "regression_hc" }, expect: { status: [200], hasKey: "ok" } },

  // tmdb-proxy
  { name: "tmdb-proxy: trending funciona", category: "functional", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/trending/movie/week" }, expect: { status: [200], hasKey: "results" } },
  { name: "tmdb-proxy: endpoint bloqueado", category: "security", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/configuration" }, expect: { status: [403] } },
  { name: "tmdb-proxy: sem barra = 400", category: "functional", fn: "tmdb-proxy", method: "POST", body: { endpoint: "trending" }, expect: { status: [400] } },
  { name: "tmdb-proxy: formato estável", category: "regression", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/trending/movie/week" }, expect: { status: [200], hasKey: "results" } },

  // stream-proxy
  { name: "stream-proxy: sem URL = 400", category: "functional", fn: "stream-proxy", method: "POST", body: {}, expect: { status: [400] } },
  { name: "stream-proxy: URL inválida", category: "functional", fn: "stream-proxy", method: "POST", body: { url: "http://invalid.example.test/x.mp4" }, expect: { status: [500, 502] } },
  { name: "stream-proxy: sem vazamento", category: "security", fn: "stream-proxy", method: "POST", body: {}, expect: { notContains: ["service_role"] } },
  { name: "stream-proxy: formato erro estável", category: "regression", fn: "stream-proxy", method: "POST", body: {}, expect: { status: [400], hasKey: "error" } },

  // stream-lookup
  { name: "stream-lookup: sem título", category: "functional", fn: "stream-lookup", method: "POST", body: {}, expect: { status: [400, 500] } },
  { name: "stream-lookup: título inexistente", category: "functional", fn: "stream-lookup", method: "POST", body: { title: "zzz_nonexistent_999" }, expect: { status: [200, 404, 500] } },
  { name: "stream-lookup: sem vazamento", category: "security", fn: "stream-lookup", method: "POST", body: { title: "test" }, expect: { notContains: ["service_role"] } },

  // trailer-challenge
  { name: "trailer-challenge: GET progress", category: "functional", fn: "trailer-challenge", method: "GET", expect: { status: [200], hasKey: "today" } },
  { name: "trailer-challenge: sem tokens", category: "security", fn: "trailer-challenge", method: "GET", expect: { notContains: ["PUSHALERT", "service_role"] } },
  { name: "trailer-challenge: formato estável", category: "regression", fn: "trailer-challenge", method: "GET", expect: { status: [200], hasKey: "today" } },

  // match-reminders
  { name: "match-reminders: list ok", category: "functional", fn: "match-reminders", method: "POST", body: { action: "list", username: "hc_test" }, expect: { status: [200], hasKey: "reminders" } },
  { name: "match-reminders: sem vazamento", category: "security", fn: "match-reminders", method: "POST", body: { action: "list", username: "hc_test" }, expect: { notContains: ["service_role", "PUSHALERT"] } },
  { name: "match-reminders: formato estável", category: "regression", fn: "match-reminders", method: "POST", body: { action: "list", username: "regression" }, expect: { status: [200], hasKey: "reminders" } },

  // content-alerts
  { name: "content-alerts: list ok", category: "functional", fn: "content-alerts", method: "POST", body: { action: "list", username: "hc_test" }, expect: { status: [200], hasKey: "alerts" } },
  { name: "content-alerts: sem API keys", category: "security", fn: "content-alerts", method: "POST", body: { action: "list", username: "test" }, expect: { notContains: ["PUSHALERT", "service_role"] } },
  { name: "content-alerts: formato estável", category: "regression", fn: "content-alerts", method: "POST", body: { action: "list", username: "regression" }, expect: { status: [200], hasKey: "alerts" } },

  // n8n-proxy
  { name: "n8n-proxy: sem webhook = 400", category: "functional", fn: "n8n-proxy", method: "POST", body: { payload: { test: true } }, expect: { status: [400] } },
  { name: "n8n-proxy: sem payload = 400", category: "functional", fn: "n8n-proxy", method: "POST", body: { webhook_url: "https://example.com" }, expect: { status: [400] } },
  { name: "n8n-proxy: GET = 405", category: "security", fn: "n8n-proxy", method: "GET", expect: { status: [405] } },
  { name: "n8n-proxy: formato estável", category: "regression", fn: "n8n-proxy", method: "POST", body: {}, expect: { status: [400], hasKey: "error" } },

  // parse-m3u
  { name: "parse-m3u: GET catálogo", category: "functional", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "titles" } },
  { name: "parse-m3u: POST vazio", category: "functional", fn: "parse-m3u", method: "POST", body: {}, expect: { status: [400, 500] } },
  { name: "parse-m3u: sem vazamento", category: "security", fn: "parse-m3u", method: "GET", expect: { notContains: ["service_role"] } },
  { name: "parse-m3u: formato estável", category: "regression", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "titles" } },

  // cakto-webhook
  { name: "cakto-webhook: checkout url", category: "functional", fn: "cakto-webhook", method: "POST", body: { action: "get_checkout_url", username: "hc_test" }, expect: { status: [200, 400, 500] } },
  { name: "cakto-webhook: evento falso", category: "functional", fn: "cakto-webhook", method: "POST", body: { event: "unknown", data: {} }, expect: { status: [200, 400, 500] } },
  { name: "cakto-webhook: sem tokens", category: "security", fn: "cakto-webhook", method: "POST", body: { action: "get_checkout_url", username: "test" }, expect: { notContains: ["CAKTO_CLIENT_SECRET", "NATV_API_TOKEN", "service_role"] } },

  // football-matches
  { name: "football-matches: jogos do dia", category: "functional", fn: "football-matches", method: "POST", body: {}, expect: { status: [200] } },
  { name: "football-matches: sem API keys", category: "security", fn: "football-matches", method: "POST", body: {}, expect: { notContains: ["RAPIDAPI", "service_role", "APIFOOTBALL"] } },
  { name: "football-matches: formato estável", category: "regression", fn: "football-matches", method: "POST", body: {}, expect: { status: [200] } },
];

async function runTest(baseUrl: string, anonKey: string, test: TestCase): Promise<{ name: string; category: string; passed: boolean; error?: string; duration_ms: number }> {
  const start = Date.now();
  try {
    let url = `${baseUrl}/functions/v1/${test.fn}`;
    if (test.method === "GET" && test.fn === "trailer-challenge") {
      url += "?username=health_check_test";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
      "apikey": anonKey,
      ...(test.headers || {}),
    };

    const opts: RequestInit = { method: test.method, headers };
    if (test.body && test.method !== "GET") {
      opts.body = JSON.stringify(test.body);
    }

    const res = await fetch(url, opts);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    const duration_ms = Date.now() - start;

    // Check status
    if (test.expect.status && !test.expect.status.includes(res.status)) {
      return { name: test.name, category: test.category, passed: false, error: `Status ${res.status}, esperado ${test.expect.status.join("|")}`, duration_ms };
    }

    // Check hasKey
    if (test.expect.hasKey && typeof data === "object" && data !== null) {
      if (!(test.expect.hasKey in data)) {
        return { name: test.name, category: test.category, passed: false, error: `Chave "${test.expect.hasKey}" ausente`, duration_ms };
      }
    }

    // Check notContains
    if (test.expect.notContains) {
      const lower = text.toLowerCase();
      for (const forbidden of test.expect.notContains) {
        if (lower.includes(forbidden.toLowerCase())) {
          return { name: test.name, category: test.category, passed: false, error: `Resposta contém "${forbidden}" (vazamento)`, duration_ms };
        }
      }
    }

    return { name: test.name, category: test.category, passed: true, duration_ms };
  } catch (e) {
    return { name: test.name, category: test.category, passed: false, error: (e as Error).message, duration_ms: Date.now() - start };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // GET = list results
    if (req.method === "GET") {
      const { data: results } = await supabase
        .from("test_results")
        .select("*")
        .order("run_at", { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({ results: results || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST = run tests
    if (req.method === "POST") {
      let triggerType = "manual";
      try {
        const body = await req.json();
        triggerType = body?.trigger || "manual";
      } catch { }

      const baseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

      const startTime = Date.now();

      // Run tests in batches of 5 to avoid overwhelming
      const results: any[] = [];
      for (let i = 0; i < TEST_SUITE.length; i += 5) {
        const batch = TEST_SUITE.slice(i, i + 5);
        const batchResults = await Promise.all(
          batch.map(t => runTest(baseUrl, anonKey, t))
        );
        results.push(...batchResults);
      }

      const totalDuration = Date.now() - startTime;
      const passed = results.filter(r => r.passed).length;
      const failed = results.filter(r => !r.passed).length;
      const runId = crypto.randomUUID().slice(0, 8) + "-" + Date.now().toString(36);

      // Store results
      await supabase.from("test_results").insert({
        run_id: runId,
        total_tests: results.length,
        passed,
        failed,
        duration_ms: totalDuration,
        trigger_type: triggerType,
        results: results,
      });

      // Keep only last 50 runs
      const { data: old } = await supabase
        .from("test_results")
        .select("id")
        .order("run_at", { ascending: false })
        .range(50, 999);

      if (old && old.length > 0) {
        await supabase.from("test_results").delete().in("id", old.map(r => r.id));
      }

      return new Response(JSON.stringify({
        run_id: runId,
        total: results.length,
        passed,
        failed,
        duration_ms: totalDuration,
        results,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
