import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tv, Film, Sparkles, ChevronLeft, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MovieGrid from './MovieGrid';
import { TMDBMovie } from '@/lib/tmdb';
import LiveTV from './LiveTV';

interface AssistirPortalProps {
  m3uMovies: TMDBMovie[];
  m3uSeries: TMDBMovie[];
  favorites: Set<number>;
  watchedSet: Set<number>;
  contentAlerts: Set<number>;
  onMovieClick: (movie: TMDBMovie) => void;
  onToggleFavorite: (movie: TMDBMovie) => void;
  onToggleWatched: (movie: TMDBMovie) => void;
  onToggleContentAlert: (movie: TMDBMovie) => void;
  getAvailability: (movie: TMDBMovie) => 'available' | 'soon' | 'unknown';
  searchFullM3U: (query: string, type: 'movie' | 'tv') => Promise<TMDBMovie[]>;
  m3uStats?: any;
  loadMoreByGenre?: (genreKey: string, type: 'movie' | 'tv', batchSize?: number) => Promise<number>;
  loadingMoreGenre?: string | null;
  genreTotals?: (type: 'movie' | 'tv') => Map<string, number>;
}

type ViewMode = 'selection' | 'tv' | 'movies' | 'series';

const AssistirPortal = ({
  m3uMovies,
  m3uSeries,
  favorites,
  watchedSet,
  contentAlerts,
  onMovieClick,
  onToggleFavorite,
  onToggleWatched,
  onToggleContentAlert,
  getAvailability,
  searchFullM3U,
  m3uStats,
  loadMoreByGenre,
  loadingMoreGenre,
  genreTotals,
}: AssistirPortalProps) => {
  const [view, setView] = useState<ViewMode>('selection');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBMovie[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string>('all');

  // Limpa busca ao trocar de categoria
  useEffect(() => {
    setSearchQuery('');
    setSearchResults(null);
    setSelectedGenre('all');
  }, [view]);

  // Debounce para busca no catálogo total
  useEffect(() => {
    if (!searchQuery.trim() || view === 'selection' || view === 'tv') {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const type = view === 'series' ? 'tv' : 'movie';
      const results = await searchFullM3U(searchQuery, type);
      setSearchResults(results);
      setIsSearching(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [searchQuery, view, searchFullM3U]);

  const cards = [
    {
      id: 'tv',
      title: 'TV AO VIVO',
      subtitle: 'Canais em tempo real',
      icon: <Tv className="w-12 h-12" />,
      color: 'from-blue-600/20 to-blue-900/40',
      borderColor: 'border-blue-500/50',
      shadowColor: 'shadow-blue-500/20',
      bgImg: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&q=80&w=800'
    },
    {
      id: 'movies',
      title: 'FILMES AQUI',
      subtitle: 'O melhor do cinema',
      icon: <Film className="w-12 h-12" />,
      color: 'from-purple-600/20 to-purple-900/40',
      borderColor: 'border-purple-500/50',
      shadowColor: 'shadow-purple-500/20',
      bgImg: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800'
    },
    {
      id: 'series',
      title: 'SÉRIES AQUI',
      subtitle: 'Suas maratonas favoritas',
      icon: <Sparkles className="w-12 h-12" />,
      color: 'from-amber-600/20 to-amber-900/40',
      borderColor: 'border-amber-500/50',
      shadowColor: 'shadow-amber-500/20',
      bgImg: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?auto=format&fit=crop&q=80&w=800'
    }
  ];

  if (view === 'selection') {
    return (
      <div className="py-8 space-y-8 min-h-[70vh] flex flex-col justify-center">
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-display text-foreground tracking-tight">O QUE VAMOS ASSISTIR HOJE?</h2>
          <p className="text-muted-foreground text-lg">
            {m3uStats?.episodes > 1000 
              ? `Aproveite mais de ${Math.floor(m3uStats.episodes / 1000)} mil episódios e milhares de filmes direto do seu catálogo.`
              : 'Escolha uma categoria para começar sua diversão'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto w-full px-4">
          {cards.map((card) => (
            <motion.div
              key={card.id}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView(card.id as ViewMode)}
              className={`relative h-[400px] rounded-2xl overflow-hidden border-2 ${card.borderColor} ${card.shadowColor} shadow-2xl cursor-pointer group`}
            >
              <img 
                src={card.bgImg} 
                alt={card.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-40"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${card.color} via-background/80 to-transparent`} />
              
              <div className="absolute inset-0 p-8 flex flex-col items-center justify-center text-center gap-4">
                <div className="p-4 rounded-full bg-background/50 backdrop-blur-md border border-white/10 group-hover:bg-primary/20 transition-colors duration-300">
                  {card.icon}
                </div>
                <div className="space-y-1">
                  <h3 className="text-3xl font-display text-foreground">{card.title}</h3>
                  <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">{card.subtitle}</p>
                </div>
                
                <Button className="mt-4 rounded-full px-8 bg-white/10 hover:bg-white/20 border-white/10 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  ACESSAR AGORA
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  const titles = {
    tv: 'TV AO VIVO',
    movies: 'FILMES DO CATÁLOGO',
    series: 'SÉRIES COMPLETAS'
  };

  const currentList = view === 'movies' ? m3uMovies : view === 'series' ? m3uSeries : [];
  const baseList = searchResults !== null ? searchResults : currentList;

  // Normaliza o nome bruto da categoria (vindo do M3U/XTream) num rótulo curto de gênero.
  const normalizeGenre = (raw: string): string => {
    if (!raw) return '';
    let s = raw.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(FILMES?|SERIES?|VOD|MOVIES?|CANAIS?)\b/g, '')
      .replace(/\b(4K|UHD|FHD|HD|SD|DUBLADO|LEGENDADO|DUB|LEG|NACIONAL|LANCAMENTOS?|LANCAMENTO)\b/g, '')
      .replace(/[|\-–:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Pega o primeiro termo significativo (gênero principal)
    return s || '';
  };

  const genreCounts = new Map<string, number>();
  if (view === 'movies' || view === 'series') {
    for (const m of baseList) {
      const g = normalizeGenre((m as any)._m3uCategory || '');
      if (!g) continue;
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
  }
  const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  const displayList = selectedGenre === 'all'
    ? baseList
    : baseList.filter(m => normalizeGenre((m as any)._m3uCategory || '') === selectedGenre);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-6 gap-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setView('selection')}
            className="hover:bg-white/5 -ml-2"
          >
            <ChevronLeft className="w-5 h-5 mr-1" /> VOLTAR
          </Button>
          <div className="h-6 w-[1px] bg-white/10" />
          <h2 className="text-2xl font-display text-foreground flex items-center gap-3">
            {view === 'movies' && <Film className="w-6 h-6 text-primary" />}
            {view === 'series' && <Sparkles className="w-6 h-6 text-primary" />}
            {view === 'tv' && <Tv className="w-6 h-6 text-primary" />}
            {titles[view as keyof typeof titles]}
          </h2>
        </div>

        {view !== 'tv' && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Pesquisar em todo o catálogo de ${view === 'movies' ? 'filmes' : 'séries'}...`}
              className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 transition-colors h-10"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
            )}
          </div>
        )}

        <div className="flex flex-col items-end gap-1">
          <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">
            {view === 'movies' && m3uStats?.movieCount ? `${m3uStats.movieCount} Filmes` : 
             view === 'series' && m3uStats?.seriesCount ? `${m3uStats.seriesCount} Séries (+ ${m3uStats.episodes} Eps)` :
             view === 'tv' && m3uStats?.liveCount ? `${m3uStats.liveCount} Canais` :
             `${displayList.length} Títulos`}
          </span>
          <span className="text-[9px] text-primary/60 font-medium px-2 italic">Sincronizado via XTream/M3U</span>
        </div>
      </div>

      {(view === 'movies' || view === 'series') && genres.length > 1 && (
        <div className="flex flex-wrap gap-2 -mt-2">
          <button
            onClick={() => setSelectedGenre('all')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors ${selectedGenre === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'}`}
          >
            Todos ({baseList.length})
          </button>
          {genres.map(([g, c]) => (
            <button
              key={g}
              onClick={() => setSelectedGenre(g)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors ${selectedGenre === g ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'}`}
            >
              {g} ({c})
            </button>
          ))}
        </div>
      )}

      {view === 'tv' ? (
        <LiveTV />
      ) : (
        <>
          <MovieGrid
            movies={displayList}
            loading={false}
            favorites={favorites}
            watchedSet={watchedSet}
            contentAlerts={contentAlerts}
            onMovieClick={onMovieClick}
            onToggleFavorite={onToggleFavorite}
            onToggleWatched={onToggleWatched}
            onToggleContentAlert={onToggleContentAlert}
            getAvailability={getAvailability}
            emptyMessage={searchQuery ? "Nenhum resultado encontrado para esta busca." : "Nenhum item disponível nesta categoria."}
          />
          {selectedGenre !== 'all' && !searchQuery && loadMoreByGenre && (() => {
            const type: 'movie' | 'tv' = view === 'series' ? 'tv' : 'movie';
            const totalInCatalog = genreTotals?.(type).get(selectedGenre) || displayList.length;
            const remaining = Math.max(0, totalInCatalog - displayList.length);
            const isLoading = loadingMoreGenre === selectedGenre;
            if (remaining === 0) return null;
            return (
              <div className="flex flex-col items-center gap-2 pt-6">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  Mostrando {displayList.length} de ~{totalInCatalog} títulos de {selectedGenre} no catálogo
                </p>
                <Button
                  disabled={isLoading}
                  onClick={() => loadMoreByGenre(selectedGenre, type, 50)}
                  className="rounded-full px-8 bg-primary/90 hover:bg-primary"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando...</>
                  ) : (
                    <>Carregar mais títulos de {selectedGenre}</>
                  )}
                </Button>
              </div>
            );
          })()}
        </>
      )}
    </motion.div>
  );
};

export default AssistirPortal;
