import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Search, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { getEarlyAccessProfile, searchEarlyAccessParticipants } from '../lib/earlyAccess';
import { EarlyAccessStandingCard } from './EarlyAccessStandingCard';
import { useEarlyAccessStanding } from '../hooks/useEarlyAccessStanding';

const shortAddress = (address = '') => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

export const EarlyAccessParticipantsDialog = ({ open, onClose }) => {
  const [search, setSearch] = useState('');
  const [participants, setParticipants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const { standing, loading: standingBusy } = useEarlyAccessStanding(open, profile);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    getEarlyAccessProfile().then((saved) => { if (current) setProfile(saved); }).catch(() => { if (current) setProfile(null); });
    return () => { current = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      setBusy(true);
      setError('');
      searchEarlyAccessParticipants(search).then((result) => {
        if (current) setParticipants(result.participants || []);
      }).catch((loadError) => {
        if (current) setError(loadError.message);
      }).finally(() => { if (current) setBusy(false); });
    }, search ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [open, search]);

  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
    <DialogContent className="early-access-window" overlayClassName="early-access-overlay" data-testid="early-access-participants-dialog" onCloseAutoFocus={(event) => event.preventDefault()}>
      <header className="early-access-titlebar">
        <div className="early-access-window-controls" aria-hidden="true"><i/><i/><i/></div>
        <DialogTitle className="early-access-window-title">Islanders</DialogTitle>
        <DialogDescription className="sr-only">Search the Frostfish Early Access participants.</DialogDescription>
        <span className="early-access-window-mark" aria-hidden="true">RH</span>
      </header>
      <div className="early-access-window-body">
        <section className="early-access-content early-access-participants-screen">
          <div className="early-access-stage"><span>COMMUNITY</span><i/><strong>TOP 50 ISLANDERS</strong></div>
          <h2>Find your place.</h2>
          <p className="early-access-intro">See the Early Access leaderboard and search for your X name or wallet.</p>
          <EarlyAccessStandingCard profile={profile} standing={standing} loading={standingBusy}/>
          <aside className="early-access-leaderboard" aria-label="Early Access participants">
            <div className="early-access-leaderboard-title"><div><Users size={17}/><strong>Participants</strong></div><span>TOP 50</span></div>
            <label className="early-access-search"><Search size={15}/><input data-testid="nav-participant-search" placeholder="Find your X name or wallet" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <div className="early-access-participants" data-testid="nav-early-access-participants" aria-live="polite">
              {busy ? <p className="early-access-empty"><Loader2 className="spin" size={15}/> Loading participants…</p> : error ? <p role="alert" className="early-access-board-error">{error}</p> : participants.length ? participants.map((person) => {
                const isYou = !!profile && (person.xName?.toLowerCase() === profile.xName?.toLowerCase() || person.walletAddress?.toLowerCase() === profile.walletAddress?.toLowerCase());
                return <div className={`early-access-participant ${isYou ? 'is-you' : ''}`} key={person.id}>
                  <span className="early-access-participant-rank">#{person.rank}</span><strong>@{person.xName}{isYou && <small className="early-access-you-label">YOU</small>}</strong><code>{shortAddress(person.walletAddress)}</code><b>{person.points} pts</b>
                </div>;
              }) : <p className="early-access-empty">{search ? 'No participants match this search.' : 'Be the first to join.'}</p>}
            </div>
          </aside>
          <p className="early-access-note">The board shows the 50 highest scoring participants.</p>
        </section>
      </div>
      <footer className="early-access-statusbar"><span>FROSTFISH · EARLY ACCESS</span><span><i/> Robinhood Chain Testnet</span></footer>
      <button className="early-access-back" type="button" onClick={onClose}><ArrowLeft size={16}/> Back to island</button>
    </DialogContent>
  </Dialog>;
};
