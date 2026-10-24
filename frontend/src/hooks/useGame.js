import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
const API = `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'}/api`;
export function useGame() {
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [actionError, setActionError] = useState('');
  const actionPending = useRef(false);
  const token = useRef(localStorage.getItem('frostfish-session'));
  const gameRef = useRef(null);
  const latestRevision = useRef(-1);
  const accept = useCallback((state) => {
    if (state.revision >= latestRevision.current) {
      latestRevision.current = state.revision;
      gameRef.current = { ...state, received: performance.now(), byUid: Object.fromEntries(state.workers.map(w => [w.uid, w])) };
      setGame(state);
    }
  }, []);
  const request = useCallback(async (path, body) => {
    const res = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token.current ? { Authorization: `Bearer ${token.current}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    if (!res.ok) { const error = new Error(data.detail || 'The island is unreachable. Please try again.'); error.status = res.status; throw error; }
    return data;
  }, []);
  const start = useCallback(async (wallet) => {
    setBusy(true);
    try {
      if (wallet) {
        if (!wallet.address || !wallet.chainId || !wallet.signMessageAsync) throw new Error('Connect an EVM wallet before signing in.');
        const challenge = await request('/auth/challenge', { address: wallet.address, chainId: wallet.chainId });
        const signature = await wallet.signMessageAsync({ message: challenge.message });
        const authenticated = await request('/auth/verify', { address: wallet.address, chainId: wallet.chainId, nonce: challenge.nonce, signature });
        token.current = authenticated.token;
        localStorage.setItem('frostfish-session', authenticated.token);
        localStorage.setItem('frostfish-wallet-address', wallet.address.toLowerCase());
        latestRevision.current = -1;
        accept(authenticated.game); setOnline(true);
        return authenticated.game;
      }
      if (token.current) {
        try { const saved = await request('/game'); accept(saved); setOnline(true); return saved; }
        catch (e) { if (!e.message.includes('expired')) throw e; }
      }
      const res = await request('/sessions', {});
      token.current = res.token;
      localStorage.setItem('frostfish-session', res.token);
      localStorage.removeItem('frostfish-wallet-address');
      latestRevision.current = -1;
      accept(res.game); setOnline(true);
      return res.game;
    } catch (e) { toast.error(e.message); return null; } finally { setBusy(false); }
  }, [request, accept]);
  const resume = useCallback(async () => {
    if (!token.current) return null;
    try { const saved = await request('/game'); accept(saved); setOnline(true); return saved; }
    catch (e) { if (e.status === 401) { token.current = null; localStorage.removeItem('frostfish-session'); localStorage.removeItem('frostfish-wallet-address'); } return null; }
  }, [request, accept]);
  const act = useCallback(async (type, extra = {}) => {
    if (actionPending.current) return null;
    actionPending.current = true;
    setActionError('');
    setBusy(true);
    try {
      let state;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { state = await request('/game/action', { type, ...extra }); break; }
        catch (e) {
          if (e.status !== 409 || !e.message.includes('busy') || attempt === 2) throw e;
          await new Promise(resolve => setTimeout(resolve, 180 * (attempt + 1)));
        }
      }
      accept(state); setOnline(true); return state;
    } catch (e) { setActionError(e.message); toast.error(e.message); return null; }
    finally { actionPending.current = false; setBusy(false); }
  }, [request, accept]);
  const hasGame = !!game;
  useEffect(() => {
    if (!hasGame) return;
    let stopped = false, timer, polling = false;
    const poll = async () => {
      if(stopped||polling||document.hidden)return;
      if (actionPending.current) { timer = setTimeout(poll, 500); return; }
      polling=true;
      try { const state = await request('/game'); if (!stopped) { accept(state); setOnline(true); } }
      catch { if (!stopped) setOnline(false); }
      polling=false;
      if (!stopped) timer = setTimeout(poll, 1800);
    };
    const visible=()=>{if(!document.hidden){clearTimeout(timer);poll();}else clearTimeout(timer);};
    document.addEventListener('visibilitychange',visible);
    timer = setTimeout(poll, 1800);
    return () => { stopped = true; clearTimeout(timer);document.removeEventListener('visibilitychange',visible); };
  }, [hasGame, request, accept]);
  const leaderboard = useCallback(() => request('/leaderboard'), [request]);
  const clearActionError = useCallback(() => setActionError(''), []);
  return { game, gameRef, start, resume, act, busy, online, actionError, clearActionError, leaderboard };
}
