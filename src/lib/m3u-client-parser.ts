import { normalizeTitle } from './m3u-parser';

export interface PlaylistItem {
  title: string;
  normalizedTitle: string;
  url: string;
  group: string;
  logo: string;
  // Para Séries
  isSeries: boolean;
  seriesName?: string;
  season?: number;
  episode?: number;
}

// Configuração Global do Proxy
// O usuário pode definir isso no localStorage via Painel Admin, 
// senão usará a URL principal do Worker criado por padrão.
export const getProxyUrl = () => {
  const localProxy = localStorage.getItem('msc_cloudflare_proxy');
  if (localProxy) return localProxy;
  
  // URL oficial enviada pelo Gestor
  return 'https://proxy-video-msc2.ovitoroliveira60.workers.dev/';
};

export function buildProxyUrl(realUrl: string): string {
  const proxy = getProxyUrl();
  if (!proxy) return realUrl;
  
  // Garantir formatação segura: proxy + url
  // Se o proxy terminar com /, retiramos para concatenar com /http://...
  const base = proxy.endsWith('/') ? proxy.slice(0, -1) : proxy;
  
  // Se o realUrl já tiver http, garantimos apenas UMA barra de separação
  if (realUrl.startsWith('http')) {
    return `${base}/${realUrl}`;
  }
  
  return `${base}${realUrl.startsWith('/') ? '' : '/'}${realUrl}`;
}


/**
 * Faz o fetch da URL M3U direto no cliente, usando o Proxy CORS se configurado, e converte.
 */
export async function fetchAndParseClientM3u(url: string): Promise<PlaylistItem[]> {
  try {
    const proxiedUrl = buildProxyUrl(url);
    const response = await fetch(proxiedUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return parseClientM3u(text);
  } catch (err: any) {
    console.error('Erro ao baixar M3U no cliente. CORS?', err);
    throw new Error('Falha ao obter lista (CORS bloqueado ou servidor offline).');
  }
}

/**
 * Lê o m3u e extrai URL, Nome, Logo e lógica de T01E01 para séries.
 */
export function parseClientM3u(content: string): PlaylistItem[] {
  const items: PlaylistItem[] = [];
  const lines = content.split('\n');

  let currentTitle = '';
  let currentGroup = '';
  let currentLogo = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#EXTINF:')) {
      // #EXTINF:-1 tvg-id="" tvg-name="Nome do canal" tvg-logo="url" group-title="Grupo",Nome do Filme
      const logoMatch = trimmed.match(/tvg-logo="([^"]+)"/i);
      if (logoMatch) currentLogo = logoMatch[1];

      const groupMatch = trimmed.match(/group-title="([^"]+)"/i);
      if (groupMatch) currentGroup = groupMatch[1];

      const commaIdx = trimmed.lastIndexOf(',');
      if (commaIdx !== -1) {
        currentTitle = trimmed.substring(commaIdx + 1).trim();
      } else {
        const nameMatch = trimmed.match(/tvg-name="([^"]+)"/i);
        if (nameMatch) currentTitle = nameMatch[1];
      }
    } else if (trimmed.startsWith('http')) { // URL da stream
      if (currentTitle) {
        // Limpar e extrair temporada/episódio se houver
        const { cleanName, isSeries, season, episode } = extractEpisodeData(currentTitle);

        items.push({
          title: currentTitle,
          normalizedTitle: normalizeTitle(cleanName),
          url: trimmed,
          group: currentGroup,
          logo: currentLogo,
          isSeries,
          seriesName: isSeries ? cleanName : undefined,
          season,
          episode
        });

        // Reset
        currentTitle = '';
        currentGroup = '';
        currentLogo = '';
      }
    }
  }

  return items;
}

function extractEpisodeData(rawTitle: string): { cleanName: string, isSeries: boolean, season?: number, episode?: number } {
  let title = rawTitle
    .replace(/^(4K|UHD|FHD|HD|SD|720p|1080p|2160p)\s*[-–:]\s*/gi, '')
    .replace(/\s*(4K|UHD|FHD|HD|SD|720p|1080p|2160p)\s*/gi, ' ')
    .replace(/^(VOD|FILME|FILMES|SERIE|SERIES|MOVIE|MOVIES)[:\s-]*/i, '')
    .replace(/\s*\[(DUB|LEG|DUAL|NAC|PT|EN|SPA)\w*\]\s*/gi, '')
    .trim();

  // Procurar por T01E01 ou S01E01
  const match = title.match(/(.+?)\s+(?:S|T)(\d{1,3})\s?(?:E|EP)(\d{1,3})/i);
  if (match) {
    return {
      cleanName: match[1].trim(),
      isSeries: true,
      season: parseInt(match[2], 10),
      episode: parseInt(match[3], 10)
    };
  }

  return { cleanName: title, isSeries: false };
}

/**
 * Agrupa todos os episódios de uma série sob o mesmo nome base (normalizedTitle).
 */
export function groupClientSeries(items: PlaylistItem[]): Record<string, PlaylistItem[]> {
  const map: Record<string, PlaylistItem[]> = {};
  for (const item of items) {
    const key = item.normalizedTitle;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }

  // Ordenar cada grupo por S e E
  for (const key in map) {
    if (map[key][0].isSeries) {
      map[key].sort((a, b) => {
        if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
        return (a.episode || 0) - (b.episode || 0);
      });
    }
  }

  return map;
}
