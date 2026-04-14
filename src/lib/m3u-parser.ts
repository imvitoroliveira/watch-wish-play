/**
 * M3U catalog - reads from backend edge function with localStorage fallback
 */
import { supabase } from "@/integrations/supabase/client";

export function parseM3UTitles(content: string): string[] {
  const titles: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
      if (tvgMatch) {
        titles.push(cleanTitle(tvgMatch[1]));
        continue;
      }
      const commaIdx = trimmed.lastIndexOf(',');
      if (commaIdx !== -1) {
        const title = trimmed.substring(commaIdx + 1).trim();
        if (title) titles.push(cleanTitle(title));
      }
    }
  }

  return [...new Set(titles)].filter(t => t.length > 1);
}

function cleanTitle(title: string): string {
  return title
    .replace(/^(4K|UHD|FHD|HD|SD|720p|1080p|2160p)\s*[-–:]\s*/gi, '')
    .replace(/\s*(4K|UHD|FHD|HD|SD|720p|1080p|2160p)\s*/gi, ' ')
    .replace(/^(VOD|FILME|FILMES|SERIE|SERIES|MOVIE|MOVIES)[:\s-]*/i, '')
    .replace(/\s*\[(DUB|LEG|DUAL|NAC|PT|EN|SPA)\w*\]\s*/gi, '')
    .replace(/\s*\((DUB|LEG|DUAL|NAC|DUBLADO|LEGENDADO)\)\s*/gi, '')
    .replace(/\s*\(?\d{4}\)?\s*$/, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*\|.*$/, '')
    .replace(/\s*S\d{1,2}\s*E\d{1,3}.*$/i, '')
    .replace(/\s*T\d{1,2}\s*E\d{1,3}.*$/i, '')
    .replace(/\s+[-–]\s*$/, '')
    .trim();
}


/** Normalize a title for fuzzy matching */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, '') // keep only alphanumeric
    .replace(/\s+/g, ' ')
    .trim();
}

/** Check if a TMDB title matches any M3U title (strict exact match only) */
export function isInM3UCatalog(tmdbTitle: string, m3uTitlesNormalized: Set<string>): boolean {
  const normalized = normalizeTitle(tmdbTitle);
  if (!normalized || normalized.length < 2) return false;
  return m3uTitlesNormalized.has(normalized);
}

// Helper robusto para extrair dados de uma linha do catálogo (formato: Tipo|ID|CatID|Nome)
export function parseCatalogItem(t: string): { type: string, id: string, catId: string, name: string } {
  const parts = t.split('|');
  const type = parts[0] || '';
  const id = parts[1] || '';
  const catId = parts[2] || '';
  const name = parts.slice(3).join('|'); // Re-junta o resto como nome (caso tenha pipes no nome)
  return { type, id, catId, name };
}

// Fetch catalog from backend (DB-cached)
export async function fetchM3UCatalog(): Promise<{ titles: string[]; total: number; source_url: string | null; updated_at: string | null; stats?: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('parse-m3u', {
      method: 'GET',
    });
    if (error) throw error;
    const titles = data?.titles || [];
    if (titles.length > 0) {
      localStorage.setItem('msc_m3u_titles', JSON.stringify(titles));
    }

    let stats = data?.stats;
    if (!stats && titles.length > 0) {
      const movieCount = titles.filter(t => t.startsWith('0|')).length;
      const seriesCount = titles.filter(t => t.startsWith('1|')).length;
      const liveCount = titles.filter(t => t.startsWith('2|')).length;
      stats = { movieCount, seriesCount, liveCount, total: titles.length, episodes: 0 };
    }

    return { 
      titles, 
      total: stats?.total || titles.length, 
      source_url: null, 
      updated_at: data?.updated_at || null,
      stats: stats
    };
  } catch (e) {
    const cached = getStoredM3UTitles();
    return { titles: cached, total: cached.length, source_url: null, updated_at: null };
  }
}

// Fetch a random sample of titles from the full catalog
export async function fetchRandomM3UTitles(count: number): Promise<string[]> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/parse-m3u?random=${count}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.titles || [];
  } catch (e) {
    // Silent fallback to local cache
    const cached = getStoredM3UTitles();
    const shuffled = [...cached].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }
}

// Process M3U via backend edge function
export async function processM3UViaBackend(url?: string, content?: string): Promise<{ success: boolean; count: number; rawCount?: number; stats?: any; error?: string; rawResponse?: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('parse-m3u', {
      method: 'POST',
      body: { url, content },
    });
    if (error) throw error;
    
    // Salvar localmente para atualização imediata dos grids e componentes
    if (data?.titles) {
      localStorage.setItem('msc_m3u_titles', JSON.stringify(data.titles));
    }

    // Fallback: se o backend não enviou stats (versão antiga), calculamos aqui
    let stats = data?.stats;
    if (!stats && data?.titles) {
      const titles = data.titles as string[];
      const movieCount = titles.filter(t => t.startsWith('0|')).length;
      const seriesCount = titles.filter(t => t.startsWith('1|')).length;
      const liveCount = titles.filter(t => t.startsWith('2|')).length;
      stats = { movieCount, seriesCount, liveCount, total: titles.length, episodes: 0 };
    }

    return { 
      success: true, 
      count: stats?.total || data?.titles?.length || 0, 
      rawCount: stats?.rawTotal || 0,
      stats: stats,
      rawResponse: data // Retornamos para diagnóstico no AdminPanel
    };
  } catch (e: any) {
    return { success: false, count: 0, error: e.message || 'Erro ao processar M3U' };
  }
}

// Clear M3U catalog via backend
export async function clearM3UCatalog(): Promise<void> {
  try {
    await supabase.functions.invoke('parse-m3u', { method: 'DELETE' });
  } catch (e) {
    // Silent fail
  }
  localStorage.removeItem('msc_m3u_titles');
  localStorage.removeItem('msc_m3u_url');
}

// Local fallback
export function getStoredM3UTitles(): string[] {
  const saved = localStorage.getItem('msc_m3u_titles');
  return saved ? JSON.parse(saved) : [];
}

export function storeM3UTitles(titles: string[]) {
  localStorage.setItem('msc_m3u_titles', JSON.stringify(titles));
}
