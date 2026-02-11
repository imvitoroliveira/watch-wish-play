/**
 * Parse M3U content and extract VOD titles
 */
export function parseM3UTitles(content: string): string[] {
  const titles: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match #EXTINF lines - extract title after the last comma
    if (trimmed.startsWith('#EXTINF:')) {
      // Try tvg-name first
      const tvgMatch = trimmed.match(/tvg-name="([^"]+)"/);
      if (tvgMatch) {
        titles.push(cleanTitle(tvgMatch[1]));
        continue;
      }
      // Fallback: get text after last comma
      const commaIdx = trimmed.lastIndexOf(',');
      if (commaIdx !== -1) {
        const title = trimmed.substring(commaIdx + 1).trim();
        if (title) titles.push(cleanTitle(title));
      }
    }
  }

  // Deduplicate
  return [...new Set(titles)].filter(t => t.length > 1);
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(?\d{4}\)?\s*$/, '') // Remove year
    .replace(/\s*\[.*?\]\s*/g, '') // Remove [tags]
    .replace(/\s*\|.*$/, '') // Remove pipe suffixes
    .replace(/^(VOD|FILME|SERIE)[:\s-]*/i, '') // Remove VOD/FILME prefix
    .replace(/\s*(HD|4K|FHD|SD|720p|1080p)\s*/gi, '') // Remove quality tags
    .trim();
}

export function getStoredM3UTitles(): string[] {
  const saved = localStorage.getItem('msc_m3u_titles');
  return saved ? JSON.parse(saved) : [];
}

export function storeM3UTitles(titles: string[]) {
  localStorage.setItem('msc_m3u_titles', JSON.stringify(titles));
}
