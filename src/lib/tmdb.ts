const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

// TMDB API - publishable read-only key
const API_KEY = '21485546b51b79ae67c0037ae8ecb87e';
const API_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMTQ4NTU0NmI1MWI3OWFlNjdjMDAzN2FlOGVjYjg3ZSIsIm5iZiI6MTc3MDgxODE1MS44MDQsInN1YiI6IjY5OGM4YTY3MDllMGIwZWI2YWQzYTk2ZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.MxbgU3akV6yH4ll5JKAr2yLhsTLRBpBXOHpVReXj57w';

export const tmdbImg = (path: string | null, size: 'w200' | 'w300' | 'w500' | 'w780' | 'original' = 'w500') => {
  if (!path) return 'https://via.placeholder.com/500x750/1a1a1a/666?text=Sem+Imagem';
  return `${TMDB_IMG}/${size}${path}`;
};

export const tmdbBackdrop = (path: string | null) => {
  if (!path) return null;
  return `${TMDB_IMG}/original${path}`;
};

const fetchTMDB = async (endpoint: string, params: Record<string, string> = {}) => {
  if (!API_KEY && !API_TOKEN) {
    console.warn('TMDB API key not configured');
    return null;
  }
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('language', 'pt-BR');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'accept': 'application/json',
    },
  });
  if (!res.ok) return null;
  return res.json();
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

export const getMovieDetails = async (id: number, type: 'movie' | 'tv' = 'movie') => {
  return fetchTMDB(`/${type}/${id}`);
};

export const getMovieVideos = async (id: number, type: 'movie' | 'tv' = 'movie') => {
  const data = await fetchTMDB(`/${type}/${id}/videos`);
  if (!data?.results) return null;
  const trailer = data.results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') 
    || data.results.find((v: any) => v.site === 'YouTube');
  return trailer?.key || null;
};

export const searchMovies = async (query: string): Promise<TMDBMovie[]> => {
  const data = await fetchTMDB('/search/multi', { query });
  return data?.results?.filter((r: any) => r.media_type !== 'person') || [];
};

// Search TMDB for a list of titles and return matched movies
export const searchByTitles = async (titles: string[], maxSample = 20): Promise<TMDBMovie[]> => {
  const sample = titles.length <= maxSample ? titles : titles.sort(() => Math.random() - 0.5).slice(0, maxSample);
  const results: TMDBMovie[] = [];
  const seenIds = new Set<number>();

  // Process in batches of 10 to avoid overwhelming the API
  for (let i = 0; i < sample.length; i += 10) {
    const batch = sample.slice(i, i + 10);
    const searches = batch.map(async (title) => {
      const data = await fetchTMDB('/search/movie', { query: title });
      const first = data?.results?.[0];
      if (first && !seenIds.has(first.id)) {
        seenIds.add(first.id);
        results.push({ ...first, media_type: 'movie' });
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

// Mock data when no API key is configured
function getMockMovies(): TMDBMovie[] {
  return [
    { id: 1, title: 'Interestelar', overview: 'Uma equipe de exploradores viaja através de um buraco de minhoca no espaço.', poster_path: null, backdrop_path: null, vote_average: 8.6, release_date: '2014-11-07', genre_ids: [878, 18, 12], media_type: 'movie' },
    { id: 2, title: 'O Poderoso Chefão', overview: 'O patriarca de uma dinastia do crime organizado transfere o controle do seu império.', poster_path: null, backdrop_path: null, vote_average: 8.7, release_date: '1972-03-14', genre_ids: [18, 80], media_type: 'movie' },
    { id: 3, title: 'Batman: O Cavaleiro das Trevas', overview: 'Batman enfrenta o Coringa, um criminoso que causa caos em Gotham City.', poster_path: null, backdrop_path: null, vote_average: 8.5, release_date: '2008-07-18', genre_ids: [28, 80, 18], media_type: 'movie' },
    { id: 4, title: 'Pulp Fiction', overview: 'As vidas de dois assassinos da máfia se entrelaçam em quatro histórias.', poster_path: null, backdrop_path: null, vote_average: 8.5, release_date: '1994-10-14', genre_ids: [53, 80], media_type: 'movie' },
    { id: 5, title: 'Forrest Gump', overview: 'A vida de um homem simples que testemunha eventos históricos.', poster_path: null, backdrop_path: null, vote_average: 8.5, release_date: '1994-07-06', genre_ids: [35, 18, 10749], media_type: 'movie' },
    { id: 6, title: 'Matrix', overview: 'Um hacker descobre a verdade sobre a realidade e seu papel na guerra contra os controladores.', poster_path: null, backdrop_path: null, vote_average: 8.1, release_date: '1999-03-31', genre_ids: [28, 878], media_type: 'movie' },
    { id: 7, title: 'O Senhor dos Anéis', overview: 'Um hobbit e seus companheiros embarcam em uma missão para destruir um anel poderoso.', poster_path: null, backdrop_path: null, vote_average: 8.8, release_date: '2001-12-19', genre_ids: [12, 14, 28], media_type: 'movie' },
    { id: 8, title: 'Clube da Luta', overview: 'Um homem insone e um vendedor de sabão formam um clube de luta clandestino.', poster_path: null, backdrop_path: null, vote_average: 8.4, release_date: '1999-10-15', genre_ids: [18, 53], media_type: 'movie' },
    { id: 9, title: 'Inception', overview: 'Um ladrão que rouba segredos corporativos através de tecnologia de compartilhamento de sonhos.', poster_path: null, backdrop_path: null, vote_average: 8.4, release_date: '2010-07-16', genre_ids: [28, 878, 12], media_type: 'movie' },
    { id: 10, title: 'Gladiador', overview: 'Um general romano busca vingança contra o imperador corrupto que assassinou sua família.', poster_path: null, backdrop_path: null, vote_average: 8.1, release_date: '2000-05-05', genre_ids: [28, 18, 12], media_type: 'movie' },
  ];
}
