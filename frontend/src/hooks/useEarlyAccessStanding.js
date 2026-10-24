import { useEffect, useState } from 'react';
import { searchEarlyAccessParticipants } from '../lib/earlyAccess';

export function useEarlyAccessStanding(open, profile) {
  const [standing, setStanding] = useState(null);
  const [loading, setLoading] = useState(false);
  const query = profile?.xName || '';
  const xName = query.toLowerCase();
  const walletAddress = profile?.walletAddress?.toLowerCase() || '';
  const points = profile?.points || 0;
  const completedTasks = (profile?.completedTasks || []).join(',');

  useEffect(() => {
    if (!open || !xName) {
      setStanding(null);
      setLoading(false);
      return undefined;
    }

    let current = true;
    setLoading(true);
    searchEarlyAccessParticipants(query).then((result) => {
      if (!current) return;
      const own = (result.participants || []).find((participant) =>
        participant.xName?.toLowerCase() === xName ||
        (walletAddress && participant.walletAddress?.toLowerCase() === walletAddress)
      );
      setStanding(own || null);
    }).catch(() => {
      if (current) setStanding(null);
    }).finally(() => {
      if (current) setLoading(false);
    });

    return () => { current = false; };
  }, [open, query, xName, walletAddress, points, completedTasks]);

  return { standing, loading };
}
