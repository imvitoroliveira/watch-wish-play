import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Search, Heart, Dices, HelpCircle, LogOut, Trophy, Menu, Film, Sparkles } from 'lucide-react';
import eagleLogo from '@/assets/eagle-logo.png';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { getLastSeenDate } from '@/components/CatalogUpdates';

export type Tab = 'home' | 'assistir' | 'watchlist' | 'roleta' | 'jogos' | 'updates' | 'support';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Início', icon: <Search className="w-4 h-4" /> },
  { id: 'assistir', label: 'Categorias', icon: <Film className="w-4 h-4" /> },
  { id: 'watchlist', label: 'Minha Lista', icon: <Heart className="w-4 h-4" /> },
  { id: 'roleta', label: 'Cine-Roleta', icon: <Dices className="w-4 h-4" /> },
  { id: 'jogos', label: 'Agenda Esportiva', icon: <Trophy className="w-4 h-4" /> },
  { id: 'updates', label: 'Atualizações', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'support', label: 'Central de Ajuda', icon: <HelpCircle className="w-4 h-4" /> },
];

interface DashboardHeaderProps {
  tab: Tab;
  setTab: (tab: Tab) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const DashboardHeader = ({ tab, setTab, searchQuery, setSearchQuery }: DashboardHeaderProps) => {
  const { currentClient, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasNewUpdates, setHasNewUpdates] = useState(false);

  // Check for unseen updates
  useEffect(() => {
    const checkUpdates = async () => {
      const lastSeen = getLastSeenDate();
      const { data } = await supabase
        .from('m3u_updates')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const latestUpdate = data[0].updated_at;
        if (!lastSeen || new Date(latestUpdate) > new Date(lastSeen)) {
          setHasNewUpdates(true);
        }
      }
    };
    checkUpdates();
  }, []);

  // Clear badge when navigating to updates tab
  useEffect(() => {
    if (tab === 'updates') {
      setHasNewUpdates(false);
    }
  }, [tab]);

  const renderBadge = (tabId: Tab) => {
    if (tabId === 'updates' && hasNewUpdates) {
      return (
        <span className="relative flex h-2 w-2 ml-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
      );
    }
    return null;
  };

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {isMobile && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button className="text-foreground p-1">
                  <Menu className="w-6 h-6" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-card border-border p-0">
                <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center">
                      <img src={eagleLogo} alt="StreamTV" className="w-9 h-9 object-contain" />
                    </div>
                    <span className="font-display text-xl text-foreground tracking-wide">MEU STREAM</span>
                  </div>
                </div>
                <nav className="p-3 space-y-1">
                  {tabs.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        tab === t.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`}
                    >
                      {t.icon} {t.label} {renderBadge(t.id)}
                    </button>
                  ))}
                </nav>
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">{currentClient?.u}</p>
                  <button
                    onClick={() => { logout(); navigate('/'); }}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Sair
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          )}
          <div className="w-9 h-9 rounded-lg flex items-center justify-center">
            <img src={eagleLogo} alt="StreamTV" className="w-9 h-9 object-contain" />
          </div>
          <span className="font-display text-xl text-foreground tracking-wide hidden sm:block">MEU STREAM</span>
        </div>

        {tab === 'home' && (
          <div className="flex-1 max-w-md mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar filmes e séries..."
                className="pl-10 h-9 bg-card border-border text-foreground placeholder:text-muted-foreground text-sm"
                maxLength={200}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {currentClient?.u}
          </span>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs - desktop only */}
      {!isMobile && (
        <div className="max-w-7xl mx-auto px-4 pb-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card'
                }`}
              >
                {t.icon} {t.label} {renderBadge(t.id)}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};

export default DashboardHeader;
