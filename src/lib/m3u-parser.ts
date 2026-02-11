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
    .replace(/\s*\(?\d{4}\)?\s*$/, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*\|.*$/, '')
    .replace(/^(VOD|FILME|SERIE)[:\s-]*/i, '')
    .replace(/\s*(HD|4K|FHD|SD|720p|1080p)\s*/gi, '')
    .trim();
}

// Fetch catalog from backend (DB-cached)
export async function fetchM3UCatalog(): Promise<{ titles: string[]; source_url: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('parse-m3u', {
      method: 'GET',
    });
    if (error) throw error;
    const titles = data?.titles || [];
    // Cache locally as fallback
    if (titles.length > 0) {
      localStorage.setItem('msc_m3u_titles', JSON.stringify(titles));
    }
    return { titles, source_url: data?.source_url || null };
  } catch (e) {
    console.warn('[M3U] Failed to fetch catalog from backend, using local cache:', e);
    return { titles: getStoredM3UTitles(), source_url: null };
  }
}

// Process M3U via backend edge function
export async function processM3UViaBackend(url?: string, content?: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('parse-m3u', {
      method: 'POST',
      body: { url, content },
    });
    if (error) throw error;
    if (data?.titles) {
      localStorage.setItem('msc_m3u_titles', JSON.stringify(data.titles));
    }
    return { success: true, count: data?.count || 0 };
  } catch (e: any) {
    return { success: false, count: 0, error: e.message || 'Erro ao processar M3U' };
  }
}

// Clear M3U catalog via backend
export async function clearM3UCatalog(): Promise<void> {
  try {
    await supabase.functions.invoke('parse-m3u', { method: 'DELETE' });
  } catch (e) {
    console.warn('[M3U] Failed to clear catalog:', e);
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
