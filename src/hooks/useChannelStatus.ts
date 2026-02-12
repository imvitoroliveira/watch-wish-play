import { useState, useEffect } from 'react';

export interface ChannelStatus {
  name: string;
  url: string;
  status: 'online' | 'offline' | 'maintenance';
  httpCode: number | null;
  checkedAt: string;
}

interface MonitorData {
  channels: ChannelStatus[];
  totalLive: number;
  loading: boolean;
  lastCheck: string | null;
  offlineChannels: string[];
}

const CACHE_KEY = 'msc_channel_monitor';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function useChannelStatus(): MonitorData {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [totalLive, setTotalLive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      // Check cache first
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - new Date(parsed.timestamp).getTime() < CACHE_TTL) {
            setChannels(parsed.channels || []);
            setTotalLive(parsed.total_live || 0);
            setLastCheck(parsed.timestamp);
            setLoading(false);
            return;
          }
        } catch { /* ignore */ }
      }

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(`${supabaseUrl}/functions/v1/channel-monitor?limit=30`, {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setChannels(data.channels || []);
        setTotalLive(data.total_live || 0);
        setLastCheck(data.timestamp || null);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn('[Monitor] Failed to fetch channel status:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  const offlineChannels = channels
    .filter(c => c.status !== 'online')
    .map(c => c.name);

  return { channels, totalLive, loading, lastCheck, offlineChannels };
}
