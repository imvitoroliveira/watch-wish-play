import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useVideo } from '@/contexts/VideoContext';
import { Search, ListFilter, Play, Tv, Loader2, Signal } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getCredentialsFromM3uUrl } from '@/lib/m3u-client-parser';
import { supabase } from '@/integrations/supabase/client';

interface Channel {
  name: string;
  id: string;
  categoryId: string;
  logo?: string;
}

const LIVE_CHANNELS_CACHE_ID = '00000000-0000-0000-0000-000000000003';
const LIVE_CATEGORIES_CACHE_ID = '00000000-0000-0000-0000-000000000002';

const LiveTV = () => {
  const { currentClient } = useAuth();
  const { playVideo } = useVideo();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchChannels = async () => {
      setLoading(true);
      try {
        const clientM3uUrl = currentClient?.m3u || localStorage.getItem('msc_m3u_url') || '';
        const credentials = getCredentialsFromM3uUrl(clientM3uUrl);

        if (credentials) {
          await fetchFromXtreamAPI(credentials);
        } else {
          await fetchFromCache();
        }
      } catch (err) {
        console.error('[LiveTV] Erro ao carregar canais:', err);
        await fetchFromCache();
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, [currentClient?.m3u]);

  // Salva canais e categorias no Supabase para uso futuro (quando XTream API não estiver acessível)
  const saveToCache = async (channelList: Channel[], catMap: Record<string, string>) => {
    try {
      // Salvar canais no formato compacto: id|catId|name|logo
      const channelTitles = channelList.map(c => `${c.id}|${c.categoryId}|${c.name}|${c.logo || ''}`);
      await supabase.from('m3u_catalog').upsert({
        id: LIVE_CHANNELS_CACHE_ID,
        titles: channelTitles as any,
        updated_at: new Date().toISOString(),
      });

      // Salvar categorias como JSON
      await supabase.from('m3u_catalog').upsert({
        id: LIVE_CATEGORIES_CACHE_ID,
        titles: [JSON.stringify(catMap)] as any,
        updated_at: new Date().toISOString(),
      });

      console.log(`[LiveTV] ✅ Cache salvo: ${channelList.length} canais, ${Object.keys(catMap).length} categorias`);
    } catch (e) {
      console.warn('[LiveTV] Erro ao salvar cache:', e);
    }
  };

  const fetchFromXtreamAPI = async (creds: { domain: string; user: string; pass: string }) => {
    try {
      // Tenta XTream API diretamente (funciona com IP residencial do usuário)
      const catRes = await fetch(
        `${creds.domain}/player_api.php?username=${creds.user}&password=${creds.pass}&action=get_live_categories`,
        { headers: { 'User-Agent': 'VLC/3.0.18' } }
      );
      let catMap: Record<string, string> = {};
      if (catRes.ok) {
        const catData = await catRes.json();
        if (Array.isArray(catData)) {
          catData.forEach((c: any) => {
            catMap[String(c.category_id)] = c.category_name;
          });
          setCategories(catMap);
        }
      }

      const liveRes = await fetch(
        `${creds.domain}/player_api.php?username=${creds.user}&password=${creds.pass}&action=get_live_streams`,
        { headers: { 'User-Agent': 'VLC/3.0.18' } }
      );
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        if (Array.isArray(liveData) && liveData.length > 0) {
          const parsed: Channel[] = liveData.map((item: any) => ({
            id: String(item.stream_id || ''),
            name: item.name || '',
            categoryId: String(item.category_id || '0'),
            logo: item.stream_icon || '',
          })).filter(c => c.id && c.name);
          setChannels(parsed);

          // Salvar no cache do Supabase para acesso futuro (HTTPS preview, etc.)
          if (parsed.length > 0) {
            saveToCache(parsed, catMap);
          }
          return;
        }
      }
    } catch (e) {
      console.warn('[LiveTV] XTream API falhou (CORS/mixed-content esperado em HTTPS), usando cache:', e);
    }
    await fetchFromCache();
  };

  const fetchFromCache = async () => {
    try {
      console.log('[LiveTV] Carregando canais do cache...');

      // Carregar categorias do cache
      const { data: categoriesData } = await supabase
        .from('m3u_catalog')
        .select('titles')
        .eq('id', LIVE_CATEGORIES_CACHE_ID)
        .maybeSingle();

      if (categoriesData?.titles?.[0]) {
        try {
          const parsed = JSON.parse(categoriesData.titles[0] as string);
          setCategories(parsed);
        } catch { /* ignore */ }
      }

      // Carregar canais do cache
      const { data: channelsData } = await supabase
        .from('m3u_catalog')
        .select('titles')
        .eq('id', LIVE_CHANNELS_CACHE_ID)
        .maybeSingle();

      if (channelsData?.titles) {
        const parsed: Channel[] = [];
        for (const t of channelsData.titles as string[]) {
          const parts = (t as string).split('|');
          if (parts.length >= 3) {
            parsed.push({
              id: parts[0],
              categoryId: parts[1],
              name: parts[2],
              logo: parts[3] || '',
            });
          }
        }
        console.log(`[LiveTV] ✅ Cache carregado: ${parsed.length} canais`);
        setChannels(parsed);
      } else {
        console.warn('[LiveTV] Nenhum cache de canais encontrado. Acesse via localhost primeiro para popular o cache.');
      }
    } catch (e) {
      console.error('[LiveTV] Erro ao carregar cache:', e);
    }
  };

  // Filtragem
  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      const matchCategory = selectedCategory === 'all' || c.categoryId === selectedCategory;
      const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [channels, selectedCategory, searchQuery]);

  const sortedCategories = useMemo(() => {
    return Object.entries(categories).sort((a, b) => a[1].localeCompare(b[1]));
  }, [categories]);

  // Playback
  const handlePlayChannel = async (channel: Channel) => {
    const clientM3uUrl = currentClient?.m3u || localStorage.getItem('msc_m3u_url') || '';
    const credentials = getCredentialsFromM3uUrl(clientM3uUrl);

    if (credentials && channel.id) {
      const streamUrl = `${credentials.domain}/${credentials.user}/${credentials.pass}/${channel.id}`;
      playVideo(streamUrl, {
        id: parseInt(channel.id) || 0,
        title: channel.name,
        poster: channel.logo || '',
        media_type: 'movie'
      });
      return;
    }

    import('@/hooks/use-toast').then(({ toast }) => {
      toast({ title: "Sintonizando...", description: `Conectando com o servidor mestre para ${channel.name}`, duration: 3000 });
      
      supabase.functions.invoke('stream-lookup', {
        body: { title: channel.name },
      }).then(({ data, error }) => {
        if (!error && data?.stream_url) {
          playVideo(data.stream_url, {
            id: channel.id ? parseInt(channel.id) : 0,
            title: channel.name,
            poster: channel.logo || '',
            media_type: 'movie'
          });
        } else {
          toast({ title: "Sinal Indisponível", description: "O servidor não conseguiu resolver o stream deste canal.", variant: "destructive" });
        }
      }).catch(() => {
        toast({ title: "Erro de Conexão", description: "Falha ao contactar o servidor mestre.", variant: "destructive" });
      });
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground animate-pulse">Sintonizando canais...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar de Categorias */}
      <aside className="w-full md:w-64 space-y-4">
        <div className="bg-card/50 border border-border/50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4 text-foreground font-semibold">
            <ListFilter className="w-4 h-4 text-primary" />
            <span>Categorias</span>
          </div>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all ${
                selectedCategory === 'all'
                  ? 'bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/20'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              Todos os Canais
            </button>
            {sortedCategories.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setSelectedCategory(id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all truncate ${
                  selectedCategory === id
                    ? 'bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/20'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Grid de Canais */}
      <div className="flex-1 space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar canal..."
              className="pl-10 bg-card/50 border-border/50 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Signal className="w-3 h-3 text-green-500" />
            <span>{filteredChannels.length} canais disponíveis</span>
          </div>
        </div>

        {filteredChannels.length === 0 ? (
          <div className="bg-card/30 border border-dashed border-border rounded-3xl py-20 flex flex-col items-center justify-center text-center px-4">
            <Tv className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground">Nenhum canal encontrado</h3>
            <p className="text-muted-foreground text-sm">
              {channels.length === 0
                ? 'O cache de canais está vazio. Acesse o app via HTTP (localhost) uma vez para popular automaticamente.'
                : 'Tente mudar a categoria ou o termo de busca.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredChannels.map(channel => (
              <motion.div
                key={`${channel.id}-${channel.name}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -5 }}
                onClick={() => handlePlayChannel(channel)}
                className="group relative aspect-video bg-card border border-border/50 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl hover:shadow-primary/10 hover:border-primary/50 transition-all"
              >
                <div className="absolute inset-0 flex items-center justify-center bg-secondary/30">
                  {channel.logo ? (
                    <img
                      src={channel.logo}
                      alt={channel.name}
                      className="w-full h-full object-contain p-3"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <Tv className="w-8 h-8 text-primary/20 group-hover:text-primary/40 transition-colors" />
                  )}
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3">
                  <Badge variant="outline" className="w-fit mb-1.5 bg-black/40 text-[10px] border-white/20 text-white/90">
                    LIVE
                  </Badge>
                  <h4 className="text-white text-sm font-semibold truncate group-hover:text-primary transition-colors">
                    {channel.name}
                  </h4>
                  <p className="text-white/50 text-[10px] truncate">
                    {categories[channel.categoryId] || 'Geral'}
                  </p>
                </div>

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                    <Play className="w-5 h-5 text-primary-foreground fill-current" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveTV;
