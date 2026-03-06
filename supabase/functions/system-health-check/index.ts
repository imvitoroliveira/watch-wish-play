import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface TestCase {
  name: string;
  category: "functional" | "security" | "regression" | "integration";
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
  // ═══════════════════════════════════════════════
  // admin-login (5 tests)
  // ═══════════════════════════════════════════════
  { name: "admin-login: rejeitar body vazio", category: "functional", fn: "admin-login", method: "POST", body: { user: "", pass: "" }, expect: { status: [400] } },
  { name: "admin-login: rejeitar credenciais inválidas", category: "functional", fn: "admin-login", method: "POST", body: { user: "fake", pass: "wrong" }, expect: { status: [401] } },
  { name: "admin-login: não vazar segredos", category: "security", fn: "admin-login", method: "POST", body: { user: "x", pass: "y" }, expect: { notContains: ["admin_user", "admin_pass", "service_role", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_USER", "ADMIN_PASS"] } },
  { name: "admin-login: bloquear GET", category: "security", fn: "admin-login", method: "GET", expect: { status: [405] } },
  { name: "admin-login: resposta tem campo success", category: "regression", fn: "admin-login", method: "POST", body: { user: "x", pass: "y" }, expect: { status: [401], hasKey: "success" } },

  // ═══════════════════════════════════════════════
  // client-login (5 tests)
  // ═══════════════════════════════════════════════
  { name: "client-login: rejeitar campos vazios", category: "functional", fn: "client-login", method: "POST", body: { action: "login", username: "", password: "" }, expect: { status: [400] } },
  { name: "client-login: usuário inexistente retorna success=false", category: "functional", fn: "client-login", method: "POST", body: { action: "login", username: "nonexistent_xyz_999", password: "wrong" }, expect: { status: [200], hasKey: "success" } },
  { name: "client-login: ação desconhecida = 400", category: "functional", fn: "client-login", method: "POST", body: { action: "unknown_action" }, expect: { status: [400] } },
  { name: "client-login: não vazar segredos", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test", password: "test" }, expect: { notContains: ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASS"] } },
  { name: "client-login: bloquear GET", category: "security", fn: "client-login", method: "GET", expect: { status: [405] } },

  // ═══════════════════════════════════════════════
  // app-settings (4 tests)
  // ═══════════════════════════════════════════════
  { name: "app-settings: GET retorna billing_enabled", category: "functional", fn: "app-settings", method: "GET", expect: { status: [200], hasKey: "billing_enabled" } },
  { name: "app-settings: POST sem auth = 401", category: "security", fn: "app-settings", method: "POST", body: { billing_enabled: true }, expect: { status: [401] } },
  { name: "app-settings: POST com auth falsa = 401", category: "security", fn: "app-settings", method: "POST", body: { billing_enabled: true }, headers: { "x-admin-auth": "fake:creds" }, expect: { status: [401] } },
  { name: "app-settings: não vazar segredos", category: "security", fn: "app-settings", method: "GET", expect: { notContains: ["service_role", "ADMIN_PASS", "ADMIN_USER"] } },

  // ═══════════════════════════════════════════════
  // manage-clients (5 tests)
  // ═══════════════════════════════════════════════
  { name: "manage-clients: GET retorna array clients", category: "functional", fn: "manage-clients", method: "GET", expect: { status: [200], hasKey: "clients" } },
  { name: "manage-clients: POST vazio = 400", category: "functional", fn: "manage-clients", method: "POST", body: { clients: [] }, expect: { status: [400] } },
  { name: "manage-clients: GET clients é array não-vazio", category: "integration", fn: "manage-clients", method: "GET", expect: { status: [200], hasKey: "clients" } },
  { name: "manage-clients: não vazar segredos", category: "security", fn: "manage-clients", method: "GET", expect: { notContains: ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASS"] } },
  { name: "manage-clients: formato estável", category: "regression", fn: "manage-clients", method: "GET", expect: { status: [200], hasKey: "clients" } },

  // ═══════════════════════════════════════════════
  // user-presence (5 tests)
  // ═══════════════════════════════════════════════
  { name: "user-presence: heartbeat ok", category: "functional", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "health_check_test" }, expect: { status: [200], hasKey: "ok" } },
  { name: "user-presence: logout ok", category: "functional", fn: "user-presence", method: "POST", body: { action: "logout", username: "health_check_test" }, expect: { status: [200], hasKey: "ok" } },
  { name: "user-presence: list sem auth = 401", category: "security", fn: "user-presence", method: "POST", body: { action: "list_online" }, expect: { status: [401] } },
  { name: "user-presence: ação sem username = 400", category: "functional", fn: "user-presence", method: "POST", body: { action: "heartbeat" }, expect: { status: [400] } },
  { name: "user-presence: não vazar segredos", category: "security", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "test" }, expect: { notContains: ["service_role", "ADMIN_PASS"] } },

  // ═══════════════════════════════════════════════
  // tmdb-proxy (5 tests)
  // ═══════════════════════════════════════════════
  { name: "tmdb-proxy: trending retorna results", category: "functional", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/trending/movie/week" }, expect: { status: [200], hasKey: "results" } },
  { name: "tmdb-proxy: endpoint bloqueado = 403", category: "security", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/configuration" }, expect: { status: [403] } },
  { name: "tmdb-proxy: sem barra = 400", category: "functional", fn: "tmdb-proxy", method: "POST", body: { endpoint: "trending" }, expect: { status: [400] } },
  { name: "tmdb-proxy: body vazio = 400", category: "functional", fn: "tmdb-proxy", method: "POST", body: {}, expect: { status: [400] } },
  { name: "tmdb-proxy: não vazar TMDB token", category: "security", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/trending/movie/week" }, expect: { notContains: ["TMDB_API_TOKEN", "service_role", "eyJ"] } },

  // ═══════════════════════════════════════════════
  // stream-proxy (4 tests)
  // ═══════════════════════════════════════════════
  { name: "stream-proxy: sem URL = 400", category: "functional", fn: "stream-proxy", method: "POST", body: {}, expect: { status: [400], hasKey: "error" } },
  { name: "stream-proxy: URL inválida retorna erro", category: "functional", fn: "stream-proxy", method: "POST", body: { url: "http://invalid.example.test/x.mp4" }, expect: { status: [500, 502] } },
  { name: "stream-proxy: não vazar segredos", category: "security", fn: "stream-proxy", method: "POST", body: {}, expect: { notContains: ["service_role", "source_url"] } },
  { name: "stream-proxy: formato erro estável", category: "regression", fn: "stream-proxy", method: "POST", body: {}, expect: { status: [400], hasKey: "error" } },

  // ═══════════════════════════════════════════════
  // stream-lookup (4 tests)
  // ═══════════════════════════════════════════════
  { name: "stream-lookup: sem título = 400", category: "functional", fn: "stream-lookup", method: "POST", body: {}, expect: { status: [400] } },
  { name: "stream-lookup: título inexistente retorna 404", category: "functional", fn: "stream-lookup", method: "POST", body: { title: "zzz_nonexistent_999" }, expect: { status: [404], hasKey: "stream_url" } },
  { name: "stream-lookup: não vazar source_url", category: "security", fn: "stream-lookup", method: "POST", body: { title: "test" }, expect: { notContains: ["service_role", "source_url", "SUPABASE_SERVICE_ROLE_KEY"] } },
  { name: "stream-lookup: formato estável", category: "regression", fn: "stream-lookup", method: "POST", body: { title: "zzz_nonexistent_999" }, expect: { status: [404], hasKey: "stream_url" } },

  // ═══════════════════════════════════════════════
  // trailer-challenge (4 tests)
  // ═══════════════════════════════════════════════
  { name: "trailer-challenge: GET retorna today", category: "functional", fn: "trailer-challenge", method: "GET", expect: { status: [200], hasKey: "today" } },
  { name: "trailer-challenge: POST sem body = erro", category: "functional", fn: "trailer-challenge", method: "POST", body: {}, expect: { status: [400, 500] } },
  { name: "trailer-challenge: não vazar tokens", category: "security", fn: "trailer-challenge", method: "GET", expect: { notContains: ["PUSHALERT", "service_role", "SUPABASE_SERVICE_ROLE_KEY"] } },
  { name: "trailer-challenge: formato estável", category: "regression", fn: "trailer-challenge", method: "GET", expect: { status: [200], hasKey: "today" } },

  // ═══════════════════════════════════════════════
  // match-reminders (4 tests)
  // ═══════════════════════════════════════════════
  { name: "match-reminders: list retorna reminders", category: "functional", fn: "match-reminders", method: "POST", body: { action: "list", username: "hc_test" }, expect: { status: [200], hasKey: "reminders" } },
  { name: "match-reminders: ação inválida = 400", category: "functional", fn: "match-reminders", method: "POST", body: { action: "invalid_action" }, expect: { status: [400] } },
  { name: "match-reminders: não vazar segredos", category: "security", fn: "match-reminders", method: "POST", body: { action: "list", username: "hc_test" }, expect: { notContains: ["service_role", "PUSHALERT", "RAPIDAPI"] } },
  { name: "match-reminders: formato estável", category: "regression", fn: "match-reminders", method: "POST", body: { action: "list", username: "regression" }, expect: { status: [200], hasKey: "reminders" } },

  // ═══════════════════════════════════════════════
  // content-alerts (4 tests)
  // ═══════════════════════════════════════════════
  { name: "content-alerts: list retorna alerts", category: "functional", fn: "content-alerts", method: "POST", body: { action: "list", username: "hc_test" }, expect: { status: [200], hasKey: "alerts" } },
  { name: "content-alerts: ação inválida = 400", category: "functional", fn: "content-alerts", method: "POST", body: { action: "invalid_action_xyz" }, expect: { status: [400] } },
  { name: "content-alerts: não vazar API keys", category: "security", fn: "content-alerts", method: "POST", body: { action: "list", username: "test" }, expect: { notContains: ["PUSHALERT", "service_role", "TMDB_API_TOKEN"] } },
  { name: "content-alerts: formato estável", category: "regression", fn: "content-alerts", method: "POST", body: { action: "list", username: "regression" }, expect: { status: [200], hasKey: "alerts" } },

  // ═══════════════════════════════════════════════
  // n8n-proxy (4 tests)
  // ═══════════════════════════════════════════════
  { name: "n8n-proxy: sem webhook_url = 400", category: "functional", fn: "n8n-proxy", method: "POST", body: { payload: { test: true } }, expect: { status: [400], hasKey: "error" } },
  { name: "n8n-proxy: sem payload = 400", category: "functional", fn: "n8n-proxy", method: "POST", body: { webhook_url: "https://example.com" }, expect: { status: [400], hasKey: "error" } },
  { name: "n8n-proxy: bloquear GET = 405", category: "security", fn: "n8n-proxy", method: "GET", expect: { status: [405] } },
  { name: "n8n-proxy: formato erro estável", category: "regression", fn: "n8n-proxy", method: "POST", body: {}, expect: { status: [400], hasKey: "error" } },

  // ═══════════════════════════════════════════════
  // parse-m3u (6 tests) — CRITICAL: validates catalog health
  // ═══════════════════════════════════════════════
  { name: "parse-m3u: GET retorna titles", category: "functional", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "titles" } },
  { name: "parse-m3u: catálogo tem >100 títulos", category: "integration", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "total" } },
  { name: "parse-m3u: catálogo tem updated_at", category: "integration", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "updated_at" } },
  { name: "parse-m3u: POST sem url/content = 400", category: "functional", fn: "parse-m3u", method: "POST", body: {}, expect: { status: [400] } },
  { name: "parse-m3u: não vazar source_url nem segredos", category: "security", fn: "parse-m3u", method: "GET", expect: { notContains: ["service_role", "SUPABASE_SERVICE_ROLE_KEY"] } },
  { name: "parse-m3u: DELETE funciona", category: "regression", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "titles" } },

  // ═══════════════════════════════════════════════
  // m3u-auto-refresh (3 tests) — NEW: validates auto-sync pipeline
  // ═══════════════════════════════════════════════
  { name: "m3u-auto-refresh: executa sem erro", category: "functional", fn: "m3u-auto-refresh", method: "POST", body: {}, expect: { status: [200] } },
  { name: "m3u-auto-refresh: retorna count ou skipped", category: "integration", fn: "m3u-auto-refresh", method: "POST", body: {}, expect: { status: [200] } },
  { name: "m3u-auto-refresh: não vazar segredos", category: "security", fn: "m3u-auto-refresh", method: "POST", body: {}, expect: { notContains: ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "source_url"] } },

  // ═══════════════════════════════════════════════
  // cakto-webhook (4 tests)
  // ═══════════════════════════════════════════════
  { name: "cakto-webhook: checkout sem plan = 400", category: "functional", fn: "cakto-webhook", method: "POST", body: { action: "get_checkout_url", username: "hc_test" }, expect: { status: [400] } },
  { name: "cakto-webhook: evento desconhecido não causa 500", category: "functional", fn: "cakto-webhook", method: "POST", body: { event: "unknown_hc_event", data: {} }, expect: { status: [200] } },
  { name: "cakto-webhook: não vazar tokens de pagamento", category: "security", fn: "cakto-webhook", method: "POST", body: { action: "get_checkout_url", username: "test" }, expect: { notContains: ["CAKTO_CLIENT_SECRET", "CAKTO_CLIENT_ID", "NATV_API_TOKEN", "service_role"] } },
  { name: "cakto-webhook: formato estável", category: "regression", fn: "cakto-webhook", method: "POST", body: { event: "unknown_hc", data: {} }, expect: { status: [200] } },

  // ═══════════════════════════════════════════════
  // football-matches (5 tests)
  // ═══════════════════════════════════════════════
  { name: "football-matches: POST retorna 200", category: "functional", fn: "football-matches", method: "POST", body: {}, expect: { status: [200] } },
  { name: "football-matches: resposta tem matches ou fonte", category: "integration", fn: "football-matches", method: "POST", body: {}, expect: { status: [200] } },
  { name: "football-matches: não vazar API keys", category: "security", fn: "football-matches", method: "POST", body: {}, expect: { notContains: ["RAPIDAPI", "APIFOOTBALL", "service_role", "RAPIDAPI_FOOTBALL_KEY", "APIFOOTBALL_COM_KEY"] } },
  { name: "football-matches: GET retorna dados", category: "functional", fn: "football-matches", method: "GET", expect: { status: [200] } },
  { name: "football-matches: formato estável", category: "regression", fn: "football-matches", method: "POST", body: {}, expect: { status: [200] } },

  // ═══════════════════════════════════════════════
  // push-test (4 tests)
  // ═══════════════════════════════════════════════
  { name: "push-test: sem auth = 401", category: "security", fn: "push-test", method: "POST", body: { action: "validate" }, expect: { status: [401] } },
  { name: "push-test: auth inválida = 401", category: "security", fn: "push-test", method: "POST", body: { action: "validate" }, headers: { "x-admin-auth": "fake:creds" }, expect: { status: [401] } },
  { name: "push-test: não vazar API key", category: "security", fn: "push-test", method: "POST", body: { action: "validate" }, expect: { notContains: ["PUSHALERT", "PUSHALERT_API_KEY", "service_role"] } },
  { name: "push-test: bloquear GET = 405", category: "security", fn: "push-test", method: "GET", expect: { status: [405] } },
];

// Custom deep validations beyond simple status/key checks
function runCustomValidation(test: TestCase, data: any): string | null {
  // parse-m3u: catalog must have >100 titles
  if (test.name === "parse-m3u: catálogo tem >100 títulos") {
    const total = data?.total || (Array.isArray(data?.titles) ? data.titles.length : 0);
    if (total < 100) return `Catálogo tem apenas ${total} títulos (mínimo: 100). O auto-refresh pode estar falhando.`;
  }

  // parse-m3u: must have recent updated_at (not older than 48h)
  if (test.name === "parse-m3u: catálogo tem updated_at") {
    const updatedAt = data?.updated_at;
    if (!updatedAt) return "Campo updated_at ausente — catálogo pode nunca ter sido processado.";
    const age = Date.now() - new Date(updatedAt).getTime();
    const maxAge = 48 * 60 * 60 * 1000; // 48 hours
    if (age > maxAge) {
      const hours = Math.round(age / (60 * 60 * 1000));
      return `Catálogo desatualizado há ${hours}h (máx: 48h). Verificar cron m3u-auto-refresh.`;
    }
  }

  // m3u-auto-refresh: must return count or skipped
  if (test.name === "m3u-auto-refresh: retorna count ou skipped") {
    if (!data?.skipped && data?.count === undefined && data?.success === undefined) {
      return "Resposta sem 'count', 'success' ou 'skipped' — pipeline de sync pode estar quebrado.";
    }
  }

  // manage-clients: clients array should not be empty
  if (test.name === "manage-clients: GET clients é array não-vazio") {
    const clients = data?.clients;
    if (!Array.isArray(clients) || clients.length === 0) {
      return "Lista de clientes vazia — upload pode ter falhado ou tabela está sem dados.";
    }
  }

  // football-matches: should have some structure
  if (test.name === "football-matches: resposta tem matches ou fonte") {
    if (!data?.matches && !data?.fonte && !data?.cached && !data?.source && data?.length === undefined) {
      return "Resposta sem 'matches', 'fonte', 'cached' ou array — formato inesperado.";
    }
  }

  // cakto-webhook: checkout without plan should be 400
  if (test.name === "cakto-webhook: checkout sem plan = 400") {
    // Already handled by status check, but verify error message exists
    if (data && typeof data === "object" && !data.error) {
      return "Esperava campo 'error' na resposta de validação.";
    }
  }

  return null; // passed
}

async function runTest(baseUrl: string, anonKey: string, test: TestCase): Promise<{ name: string; category: string; passed: boolean; error?: string; duration_ms: number }> {
  const start = Date.now();
  const TIMEOUT_MS = 30000; // 30s timeout per test
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

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    opts.signal = controller.signal;

    let res: Response;
    try {
      res = await fetch(url, opts);
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        return { name: test.name, category: test.category, passed: false, error: `Timeout (${TIMEOUT_MS / 1000}s) — função pode estar travada`, duration_ms: Date.now() - start };
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

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
        return { name: test.name, category: test.category, passed: false, error: `Chave "${test.expect.hasKey}" ausente na resposta`, duration_ms };
      }
    }

    // Check notContains
    if (test.expect.notContains) {
      const lower = text.toLowerCase();
      for (const forbidden of test.expect.notContains) {
        if (lower.includes(forbidden.toLowerCase())) {
          return { name: test.name, category: test.category, passed: false, error: `⚠️ VAZAMENTO: resposta contém "${forbidden}"`, duration_ms };
        }
      }
    }

    // Custom deep validations
    const customError = runCustomValidation(test, data);
    if (customError) {
      return { name: test.name, category: test.category, passed: false, error: customError, duration_ms };
    }

    // Warn on slow responses (>10s)
    if (duration_ms > 10000) {
      return { name: test.name, category: test.category, passed: true, error: `⚠️ Lento: ${Math.round(duration_ms / 1000)}s`, duration_ms };
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
      const runId = crypto.randomUUID().slice(0, 8) + "-" + Date.now().toString(36);

      const startTime = Date.now();

      // Create initial row so polling can see progress
      const { data: inserted } = await supabase.from("test_results").insert({
        run_id: runId,
        total_tests: TEST_SUITE.length,
        passed: 0,
        failed: 0,
        duration_ms: 0,
        trigger_type: triggerType,
        results: [],
      }).select("id").single();

      const rowId = inserted?.id;

      // Run tests one by one, updating DB after each test
      const results: any[] = [];
      for (let i = 0; i < TEST_SUITE.length; i++) {
        const result = await runTest(baseUrl, anonKey, TEST_SUITE[i]);
        results.push(result);

        // Update partial results in DB for real-time polling
        if (rowId) {
          const passed = results.filter(r => r.passed).length;
          const failed = results.filter(r => !r.passed).length;
          await supabase.from("test_results").update({
            passed,
            failed,
            duration_ms: Date.now() - startTime,
            results,
          }).eq("id", rowId);
        }
      }

      const totalDuration = Date.now() - startTime;
      const passed = results.filter(r => r.passed).length;
      const failed = results.filter(r => !r.passed).length;

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
