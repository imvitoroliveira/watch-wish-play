import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

export function useChannelStatus(): MonitorData {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [totalLive, setTotalLive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // Read latest result from database
        const { data, error } = await supabase
          .from('channel_monitor_results')
          .select('channels, total_live, checked, checked_at')
          .order('checked_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          const channelData = (data.channels as unknown as ChannelStatus[]) || [];
          setChannels(channelData);
          setTotalLive(data.total_live || 0);
          setLastCheck(data.checked_at);
        }
      } catch (e) {
        console.warn('[Monitor] Failed to fetch channel status from DB:', e);
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
