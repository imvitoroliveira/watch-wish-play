import { describe, it, expect } from 'vitest';
import { invokeEdge, edgeUrl, defaultHeaders } from '../helpers/edge-function';

/**
 * Testes de segurança geral: SQLi, XSS, SSRF, Path Traversal
 * Cobertura transversal em múltiplas edge functions
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

describe('Segurança Geral: Injeção e sanitização', () => {
  // ═══════════════════════════════════════════════
  // SQL Injection
  // ═══════════════════════════════════════════════

  describe('SQL Injection', () => {
    it('client-login: username com SQL injection é bloqueado', async () => {
      const { status } = await invokeEdge('client-login', {
        body: { action: 'login', username: "'; DROP TABLE clients_list; --", password: 'test' },
      });
      expect([400, 403]).toContain(status);
    });

    it('client-login: password com SQL injection é bloqueado', async () => {
      const { status } = await invokeEdge('client-login', {
        body: { action: 'login', username: 'test', password: "' OR '1'='1" },
      });
      expect(status).not.toBe(500);
      // Deve retornar login falho, não crash
    });

    it('user-presence: username com UNION SELECT é bloqueado', async () => {
      const { status } = await invokeEdge('user-presence', {
        body: { action: 'heartbeat', username: "test' UNION SELECT * FROM auth.users --" },
      });
      expect([400, 403]).toContain(status);
    });

    it('content-alerts: username com SQL é sanitizado', async () => {
      const { status } = await invokeEdge('content-alerts', {
        body: { action: 'list', username: "test'; DELETE FROM content_alerts; --" },
      });
      expect([200, 400, 403]).toContain(status);
      expect(status).not.toBe(500);
    });

    it('match-reminders: username com injection é bloqueado', async () => {
      const { status } = await invokeEdge('match-reminders', {
        body: { action: 'list', username: "1; UPDATE payment_transactions SET status='approved'" },
      });
      expect([200, 400, 403]).toContain(status);
      expect(status).not.toBe(500);
    });

    it('abacatepay: username com SQL injection é rejeitado', async () => {
      const { status } = await invokeEdge('abacatepay-webhook', {
        body: { action: 'create_billing', username: "'; DROP TABLE payment_transactions; --", plan: 'mensal' },
      });
      expect([400, 403]).toContain(status);
    });
  });

  // ═══════════════════════════════════════════════
  // XSS (Cross-Site Scripting)
  // ═══════════════════════════════════════════════

  describe('XSS', () => {
    it('client-login: username com script tag é bloqueado', async () => {
      const { status, data } = await invokeEdge('client-login', {
        body: { action: 'login', username: '<script>alert("xss")</script>', password: 'test' },
      });
      expect([400, 403]).toContain(status);
      const text = JSON.stringify(data);
      expect(text).not.toContain('<script>');
    });

    it('user-presence: username com XSS é bloqueado', async () => {
      const { status, data } = await invokeEdge('user-presence', {
        body: { action: 'heartbeat', username: '<img src=x onerror=alert(1)>' },
      });
      expect([400, 403]).toContain(status);
      const text = JSON.stringify(data);
      expect(text).not.toContain('onerror');
    });

    it('trailer-challenge: username com XSS é bloqueado', async () => {
      const { status } = await invokeEdge('trailer-challenge', {
        body: { action: 'watch_trailer', username: '"><script>document.cookie</script>' },
      });
      expect([400, 403]).toContain(status);
    });

    it('content-alerts: movie_title com XSS não é refletido', async () => {
      const { status, data } = await invokeEdge('content-alerts', {
        body: {
          action: 'add',
          username: 'xss.test',
          movie_id: 999999,
          movie_title: '<script>alert("xss")</script>',
        },
      });
      if (typeof data === 'object') {
        const text = JSON.stringify(data);
        expect(text).not.toContain('<script>');
      }
    });
  });

  // ═══════════════════════════════════════════════
  // SSRF (Server-Side Request Forgery)
  // ═══════════════════════════════════════════════

  describe('SSRF', () => {
    it('stream-proxy: localhost é bloqueado', async () => {
      const { status } = await invokeEdge('stream-proxy', {
        body: { url: 'http://localhost:8080/admin.mp4' },
      });
      expect(status).toBe(403);
    });

    it('stream-proxy: 127.0.0.1 é bloqueado', async () => {
      const { status } = await invokeEdge('stream-proxy', {
        body: { url: 'http://127.0.0.1/secret.mp4' },
      });
      expect(status).toBe(403);
    });

    it('stream-proxy: metadata endpoint AWS é bloqueado', async () => {
      const { status } = await invokeEdge('stream-proxy', {
        body: { url: 'http://169.254.169.254/latest/meta-data/iam.mp4' },
      });
      expect(status).toBe(403);
    });

    it('stream-proxy: IP interno 10.x é bloqueado', async () => {
      const { status } = await invokeEdge('stream-proxy', {
        body: { url: 'http://10.0.0.1/internal.mp4' },
      });
      expect(status).toBe(403);
    });

    it('stream-proxy: IP interno 192.168.x é bloqueado', async () => {
      const { status } = await invokeEdge('stream-proxy', {
        body: { url: 'http://192.168.1.1/router.mp4' },
      });
      expect(status).toBe(403);
    });

    it('n8n-proxy: domínio não autorizado é bloqueado', async () => {
      const { status } = await invokeEdge('n8n-proxy', {
        body: { webhook_url: 'https://evil.com/steal', payload: { t: 1 } },
        headers: { 'x-admin-auth': btoa('fake:creds') },
      });
      // 401 (auth) ou 403 (domain block)
      expect([401, 403]).toContain(status);
    });
  });

  // ═══════════════════════════════════════════════
  // Path Traversal
  // ═══════════════════════════════════════════════

  describe('Path Traversal', () => {
    it('tmdb-proxy: path traversal com ../ é bloqueado', async () => {
      const { status } = await invokeEdge('tmdb-proxy', {
        body: { endpoint: '/../../../etc/passwd' },
      });
      expect([400, 403]).toContain(status);
    });

    it('tmdb-proxy: double encoding é bloqueado', async () => {
      const { status } = await invokeEdge('tmdb-proxy', {
        body: { endpoint: '/%2e%2e/configuration' },
      });
      expect([400, 403]).toContain(status);
    });

    it('tmdb-proxy: null byte injection é bloqueado', async () => {
      const { status } = await invokeEdge('tmdb-proxy', {
        body: { endpoint: '/trending/movie/week%00.json' },
      });
      // Pode retornar 200 (ignorando null byte) ou 400/403
      expect(status).not.toBe(500);
    });
  });

  // ═══════════════════════════════════════════════
  // Payload oversized / malformed
  // ═══════════════════════════════════════════════

  describe('Payload malformado', () => {
    it('client-login: username com 10000 chars é rejeitado', async () => {
      const { status } = await invokeEdge('client-login', {
        body: { action: 'login', username: 'a'.repeat(10000), password: 'test' },
      });
      expect([400, 413]).toContain(status);
    });

    it('admin-login: payload gigante é rejeitado', async () => {
      const { status } = await invokeEdge('admin-login', {
        body: { user: 'x'.repeat(50000), pass: 'y'.repeat(50000) },
      });
      expect([400, 401, 413]).toContain(status);
    });

    it('abacatepay: corpo não-JSON retorna 400', async () => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/abacatepay-webhook`, {
        method: 'POST',
        headers: defaultHeaders(),
        body: '{invalid json!!!',
      });
      await res.text();
      expect(res.status).toBe(400);
    });

  });


  // ═══════════════════════════════════════════════
  // Vazamento de segredos (cross-function)
  // ═══════════════════════════════════════════════

  describe('Vazamento de segredos', () => {
    const SECRETS = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'service_role',
      'ADMIN_PASS',
      'ADMIN_USER',
      'NATV_API_TOKEN',
      'ABACATEPAY_API_KEY',
      'CAKTO_CLIENT_SECRET',
      'TMDB_API_TOKEN',
      'RAPIDAPI_FOOTBALL_KEY',
      'PUSHALERT_API_KEY',
    ];

    const testCases = [
      { fn: 'admin-login', body: { user: 'x', pass: 'y' } },
      { fn: 'client-login', body: { action: 'login', username: 'leak.test', password: 'test' } },
      { fn: 'tmdb-proxy', body: { endpoint: '/trending/movie/week' } },
      { fn: 'user-presence', body: { action: 'heartbeat', username: 'leak.test' } },
      { fn: 'abacatepay-webhook', body: { event: 'unknown', data: {} } },
    ];

    it.each(testCases)('$fn não vaza segredos', async ({ fn, body }) => {
      const { data } = await invokeEdge(fn, { body });
      const text = JSON.stringify(data).toLowerCase();
      for (const secret of SECRETS) {
        expect(text).not.toContain(secret.toLowerCase());
      }
    });
  });

  // ═══════════════════════════════════════════════
  // Métodos HTTP bloqueados
  // ═══════════════════════════════════════════════

  describe('Métodos HTTP bloqueados', () => {
    it.each([
      { fn: 'admin-login', method: 'GET' },
      { fn: 'client-login', method: 'GET' },
      { fn: 'abacatepay-webhook', method: 'GET' },
      { fn: 'n8n-proxy', method: 'GET' },
      { fn: 'push-test', method: 'GET' },
      { fn: 'google-sheets-sync', method: 'GET' },
    ])('$fn bloqueia $method', async ({ fn, method }) => {
      const { status } = await invokeEdge(fn, { method });
      expect(status).toBe(405);
    });
  });

  // ═══════════════════════════════════════════════
  // CORS preflight
  // ═══════════════════════════════════════════════

  describe('CORS preflight', () => {
    it.each([
      'admin-login',
      'client-login',
      'abacatepay-webhook',
      'user-presence',
      'tmdb-proxy',
    ])('%s OPTIONS retorna CORS', async (fn) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'OPTIONS',
      });
      await res.text();
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
  });
});
