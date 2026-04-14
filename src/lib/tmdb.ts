import { supabase } from '@/integrations/supabase/client';

const TMDB_IMG = 'https://image.tmdb.org/t/p';

export const tmdbImg = (path: string | null, size: 'w200' | 'w300' | 'w500' | 'w780' | 'original' = 'w500') => {
  if (!path) return 'https://via.placeholder.com/500x750/1a1a1a/666?text=Sem+Imagem';
  return `${TMDB_IMG}/${size}${path}`;
};

export const tmdbBackdrop = (path: string | null) => {
  if (!path) return null;
  return `${TMDB_IMG}/original${path}`;
};

const fetchTMDB = async (endpoint: string, params: Record<string, string> = {}) => {
  try {
    const { data, error } = await supabase.functions.invoke('tmdb-proxy', {
      body: { endpoint, params },
    });
    if (error) {
      console.warn('TMDB proxy error:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('TMDB fetch error:', e);
    return null;
  }
};

export interface TMDBMovie {
  id: number;
  title: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids: number[];
  media_type?: string;
}

export const getTrending = async (): Promise<TMDBMovie[]> => {
  const data = await fetchTMDB('/trending/movie/week');
  return data?.results || getMockMovies();
};

/** Fetch trending titles for a specific media type (movie or tv) */
export const getTrendingByType = async (type: 'movie' | 'tv'): Promise<TMDBMovie[]> => {
  const data = await fetchTMDB(`/trending/${type}/week`);
  return (data?.results || []).map((m: any) => ({ ...m, media_type: type }));
};

export const getMovieDetails = async (id: number, type: 'movie' | 'tv' = 'movie') => {
  return fetchTMDB(`/${type}/${id}`);
};

export const getSeasonDetails = async (tvId: number, seasonNumber: number) => {
  return fetchTMDB(`/tv/${tvId}/season/${seasonNumber}`);
};

export const getMovieVideos = async (id: number, type: 'movie' | 'tv' = 'movie') => {
  const data = await fetchTMDB(`/${type}/${id}/videos`);
  const findTrailer = (results: any[]) =>
    results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
    || results.find((v: any) => v.site === 'YouTube');

  if (data?.results?.length) {
    const t = findTrailer(data.results);
    if (t?.key) return t.key;
  }

  // Fallback: en-US
  const enData = await fetchTMDB(`/${type}/${id}/videos`, { language: 'en-US' });
  const t = findTrailer(enData?.results || []);
  return t?.key || null;
};

export const searchMovies = async (query: string): Promise<TMDBMovie[]> => {
  const data = await fetchTMDB('/search/multi', { query });
  return data?.results?.filter((r: any) => r.media_type !== 'person') || [];
};

export const searchByTitles = async (titles: string[], maxSample = 20, mediaType?: 'movie' | 'tv'): Promise<TMDBMovie[]> => {
  const sample = titles.length <= maxSample ? titles : titles.sort(() => Math.random() - 0.5).slice(0, maxSample);
  const results: TMDBMovie[] = [];
  const seenIds = new Set<number>();
  
  // Use /search/multi to automatically detect if it's a movie or series
  const endpoint = '/search/multi';

  for (let i = 0; i < sample.length; i += 10) {
    const batch = sample.slice(i, i + 10);
    const searches = batch.map(async (title) => {
      const data = await fetchTMDB(endpoint, { query: title });
      // Filter for actual movies or tv shows (exclude persons)
      const first = data?.results?.find((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
      
      if (first && !seenIds.has(first.id)) {
        seenIds.add(first.id);
        // Ensure result has the correct media_type
        results.push({ ...first, media_type: first.media_type });
      }
    });
    await Promise.all(searches);
  }

  return results;
};

export const getByGenre = async (genreId: number): Promise<TMDBMovie[]> => {
  const data = await fetchTMDB('/discover/movie', { with_genres: String(genreId) });
  return data?.results || [];
};

export const GENRES = [
  { id: 28, name: 'Ação' },
  { id: 12, name: 'Aventura' },
  { id: 16, name: 'Animação' },
  { id: 35, name: 'Comédia' },
  { id: 80, name: 'Crime' },
  { id: 18, name: 'Drama' },
  { id: 14, name: 'Fantasia' },
  { id: 27, name: 'Terror' },
  { id: 9648, name: 'Mistério' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Ficção Científica' },
  { id: 53, name: 'Suspense' },
];

function getMockMovies(): TMDBMovie[] {
  return [
    { id: 1, title: 'Interestelar', overview: 'Uma equipe de exploradores viaja através de um buraco de minhoca no espaço.', poster_path: null, backdrop_path: null, vote_average: 8.6, release_date: '2014-11-07', genre_ids: [878, 18, 12], media_type: 'movie' },
    { id: 2, title: 'O Poderoso Chefão', overview: 'O patriarca de uma dinastia do crime organizado transfere o controle do seu império.', poster_path: null, backdrop_path: null, vote_average: 8.7, release_date: '1972-03-14', genre_ids: [18, 80], media_type: 'movie' },
    { id: 3, title: 'Batman: O Cavaleiro das Trevas', overview: 'Batman enfrenta o Coringa, um criminoso que causa caos em Gotham City.', poster_path: null, backdrop_path: null, vote_average: 8.5, release_date: '2008-07-18', genre_ids: [28, 80, 18], media_type: 'movie' },
    { id: 4, title: 'Pulp Fiction', overview: 'As vidas de dois assassinos da máfia se entrelaçam em quatro histórias.', poster_path: null, backdrop_path: null, vote_average: 8.5, release_date: '1994-10-14', genre_ids: [53, 80], media_type: 'movie' },
    { id: 5, title: 'Forrest Gump', overview: 'A vida de um homem simples que testemunha eventos históricos.', poster_path: null, backdrop_path: null, vote_average: 8.5, release_date: '1994-07-06', genre_ids: [35, 18, 10749], media_type: 'movie' },
  ];
}
