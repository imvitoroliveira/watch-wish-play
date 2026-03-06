/**
 * Helper para testes de Edge Functions
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function edgeUrl(fnName: string): string {
  return `${SUPABASE_URL}/functions/v1/${fnName}`;
}

export function defaultHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ANON_KEY}`,
    'apikey': ANON_KEY,
    ...extra,
  };
}

export async function invokeEdge(
  fnName: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: any }> {
  const { method = 'POST', body, headers = {} } = options;
  const res = await fetch(edgeUrl(fnName), {
    method,
    headers: defaultHeaders(headers),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

/** Snapshot de resposta para comparação de regressão */
export interface ResponseSnapshot {
  status: number;
  hasExpectedKeys: boolean;
  timestamp: string;
}

export function createSnapshot(status: number, hasExpectedKeys: boolean): ResponseSnapshot {
  return { status, hasExpectedKeys, timestamp: new Date().toISOString() };
}

export function compareSnapshots(current: ResponseSnapshot, baseline: ResponseSnapshot): {
  statusMatch: boolean;
  structureMatch: boolean;
} {
  return {
    statusMatch: current.status === baseline.status,
    structureMatch: current.hasExpectedKeys === baseline.hasExpectedKeys,
  };
}
