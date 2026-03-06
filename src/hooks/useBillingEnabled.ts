import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useBillingEnabled = () => {
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('app-settings', {
          method: 'GET',
        });
        if (!error && data) {
          setBillingEnabled(!!data.billing_enabled);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return { billingEnabled, loading };
};
