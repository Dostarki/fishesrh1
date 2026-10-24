import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Loader2, Search, ShieldCheck, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { completeEarlyAccessTask, getEarlyAccessProfile, registerEarlyAccess, searchEarlyAccessParticipants } from '../lib/earlyAccess';
import { EarlyAccessStandingCard } from './EarlyAccessStandingCard';
import { useEarlyAccessStanding } from '../hooks/useEarlyAccessStanding';

const RAW_X_POST_URL = process.env.REACT_APP_X_TASK_POST_URL || '';
const X_POST_URL = (() => {
  try {
    const url = new URL(RAW_X_POST_URL);
    return url.protocol === 'https:' && /(^|\.)(x\.com|twitter\.com)$/i.test(url.hostname) ? url.href : '';
  } catch { return ''; }
})();
const TASKS = [
  { id: 'follow', title: 'Follow X', points: 10, detail: 'Follow @fishesrh on X.', href: 'https://x.com/fishesrh', action: 'Open profile' },
  { id: 'retweet', title: 'RT', points: 10, detail: 'Repost the Frostfish Early Access post.', action: 'Open repost' },
  { id: 'like', title: 'LIKE', points: 10, detail: 'Like the Frostfish Early Access post.', action: 'Open post' },
  { id: 'quote', title: 'Quote', points: 30, detail: 'Share that you joined Frostfish Early Access.', action: 'Write a quote' },
];
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function taskHref(task) {
  if (task.id === 'follow') return task.href;
  if (!X_POST_URL) return '';
  const postId = X_POST_URL.match(/\/status\/(\d+)/i)?.[1];
  if (task.id === 'retweet') return postId ? `https://x.com/intent/retweet?tweet_id=${postId}` : X_POST_URL;
  if (task.id === 'like') return postId ? `https://x.com/intent/like?tweet_id=${postId}` : X_POST_URL;
  const quote = new URL('https://x.com/intent/tweet');
  quote.searchParams.set('text', 'I just joined Frostfish Early Access!');
  quote.searchParams.set('url', X_POST_URL);
  return quote.href;
}

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const EarlyAccessDialog = ({ open, onClose, connectedAddress, onAnimationStage }) => {
  const [step, setStep] = useState('details');
  const [xName, setXName] = useState('');
  const [address, setAddress] = useState(connectedAddress || '');
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState({});
  const [sceneCue, setSceneCue] = useState(null);
  const [search, setSearch] = useState('');
  const [participants, setParticipants] = useState([]);
  const [listBusy, setListBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const connected = !!connectedAddress;

  useEffect(() => {
    if (!open) return undefined;
    let current = true;
    setError('');
    setAddress(connectedAddress || '');
    setStep('details');
    setSceneCue(null);
    getEarlyAccessProfile().then((saved) => {
      if (!current || !saved) return;
      setProfile(saved);
      setStep('tasks');
    }).catch((loadError) => { if (current) setError(loadError.message); });
    return () => { current = false; };
  }, [open, connectedAddress]);

  useEffect(() => {
    if (!open || step !== 'tasks') return undefined;
    let current = true;
    const timer = setTimeout(() => {
      setListBusy(true);
      searchEarlyAccessParticipants(search).then((result) => {
        if (current) setParticipants(result.participants);
      }).catch((listError) => {
        if (current) setError(listError.message);
      }).finally(() => { if (current) setListBusy(false); });
    }, search ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [open, step, search, refresh]);

  const completedTasks = useMemo(() => new Set(profile?.completedTasks || []), [profile]);
  const completedCount = TASKS.filter((task) => completedTasks.has(task.id)).length;
  const progressPercent = Math.round((completedCount / TASKS.length) * 100);
  const { standing, loading: standingBusy } = useEarlyAccessStanding(open && step === 'tasks', profile);

  const submitDetails = async (event) => {
    event.preventDefault();
    const cleanName = xName.trim().replace(/^@+/, '');
    const cleanAddress = address.trim();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(cleanName)) {
      setError('Enter a valid X username (1–15 letters, numbers or underscores).');
      return;
    }
    if (!ADDRESS_RE.test(cleanAddress)) {
      setError('Enter a valid EVM address beginning with 0x.');
      return;
    }
    setBusy(true); setError('');
    try {
      const next = await registerEarlyAccess(cleanName, cleanAddress);
      setProfile(next); setStep('tasks'); setRefresh((value) => value + 1);
    } catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  };

  const markComplete = async (taskId) => {
    setBusy(true); setError('');
    try {
      const result = await completeEarlyAccessTask(taskId);
      setProfile(result.participant); setStarted((value) => ({ ...value, [taskId]: false }));
      setRefresh((value) => value + 1);
    } catch (taskError) { setError(taskError.message); }
    finally { setBusy(false); }
  };

  const startIslandScene = (taskId) => {
    const beats = {
      follow: { id: 'cast', title: 'Casting the line', detail: 'Your fisher is sending the line into Frostwater.' },
      retweet: { id: 'catch', title: 'Reeling in a catch', detail: 'A fish is taking the hook and heading for the bucket.' },
      like: { id: 'sell', title: 'Taking the catch to market', detail: 'Your fisher is carrying the catch to the market stall.' },
      quote: { id: 'earn', title: 'Collecting the token reward', detail: 'The catch has been sold and the token reward appears.' },
    };
    const beat = beats[taskId];
    if (!beat) return;
    setSceneCue(beat);
    onAnimationStage?.({ id: beat.id, startedAt: performance.now() });
  };

  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className={`early-access-window ${sceneCue ? 'has-island-animation' : ''} ${sceneCue && ['sell', 'earn'].includes(sceneCue.id) ? 'island-animation-market' : ''}`} overlayClassName={`early-access-overlay ${sceneCue ? 'early-access-cinematic' : ''}`} data-testid="early-access-dialog" onCloseAutoFocus={(event) => event.preventDefault()}>
        <header className="early-access-titlebar">
          <div className="early-access-window-controls" aria-hidden="true"><i/><i/><i/></div>
          <DialogTitle className="early-access-window-title">Play</DialogTitle>
          <DialogDescription className="sr-only">Join Frostfish Early Access and complete community tasks.</DialogDescription>
          <span className="early-access-window-mark" aria-hidden="true">RH</span>
        </header>
        <div className="early-access-window-body">
          {step === 'details' ? <section className="early-access-content early-access-entry">
            <div className="early-access-stage"><span>01 / 02</span><i/><strong>YOUR PROFILE</strong></div>
            <h2>Find your place.</h2>
            <p className="early-access-intro">Join the Frostfish community. Add your X name and EVM address to unlock the Early Access tasks.</p>
            <form className="early-access-form" onSubmit={submitDetails}>
              <label className="early-access-field"><span>X username</span><input data-testid="early-access-x-name" autoComplete="username" autoCapitalize="none" maxLength={16} placeholder="@yourname" value={xName} onChange={(event) => setXName(event.target.value)} /></label>
              <label className="early-access-field"><span>EVM address</span><input data-testid="early-access-wallet-address" autoComplete="off" spellCheck="false" placeholder="0x…" value={address} readOnly={connected} onChange={(event) => setAddress(event.target.value)} /></label>
              {connected && <p className="early-access-connected"><ShieldCheck size={15}/> Connected wallet filled in automatically.</p>}
              {error && <p role="alert" className="form-error" data-testid="early-access-error">{error}</p>}
              <Button className="pixel-button early-access-submit" data-testid="early-access-continue" type="submit" disabled={busy}>
                {busy ? <Loader2 className="spin"/> : null} Continue to tasks <ArrowRight size={17}/>
              </Button>
            </form>
            <p className="early-access-privacy"><ShieldCheck size={14}/> Your wallet address is shown in shortened form on the participant board.</p>
          </section> : <section className="early-access-content early-access-quest-screen">
            <div className="early-access-stage"><span>02 / 02</span><i/><strong>QUEST BOARD</strong></div>
            <div className="early-access-quest-heading"><div><h2>Your island awaits.</h2><p className="early-access-intro">Complete the X tasks and collect points for your place on the board.</p></div>
              <div className="early-access-profile" data-testid="early-access-profile"><span>@{profile?.xName}</span><code>{shortAddress(profile?.walletAddress || '')}</code><strong data-testid="early-access-points">{profile?.points || 0} pts</strong></div>
            </div>
            <div className="early-access-progress" data-testid="early-access-progress">
              <div className="early-access-progress-heading"><span>QUEST PROGRESS</span><strong>{completedCount} / {TASKS.length} tasks</strong></div>
              <div className="early-access-progress-track" role="progressbar" aria-label="Early Access task progress" aria-valuemin="0" aria-valuemax={TASKS.length} aria-valuenow={completedCount}><span style={{ width: `${progressPercent}%` }}/></div>
              <div className="early-access-progress-footer"><span>{progressPercent}% complete</span><strong>{profile?.points || 0} / 60 points</strong></div>
            </div>
            {sceneCue && <div className="early-access-game-cue" role="status" data-testid="early-access-game-cue"><span>ISLAND ACTION</span><strong>{sceneCue.title}</strong><small>{sceneCue.detail}</small></div>}
            <div className="early-access-quest-layout">
              <div className="early-access-tasks" data-testid="early-access-tasks">{TASKS.map((task) => {
        const href = taskHref(task), done = completedTasks.has(task.id);
        return <article className={`early-access-task ${done ? 'is-complete' : ''}`} key={task.id} data-testid={`early-access-task-${task.id}`}>
          <span className="early-access-task-check">{done ? <Check size={16}/> : task.id === 'quote' ? '30' : '10'}</span>
          <div className="early-access-task-copy"><strong>{task.title}<small>+{task.points} points</small></strong><p>{task.detail}</p></div>
          {done ? <span className="early-access-done">Done</span> : <div className="early-access-task-actions">
            {href ? <a className="early-access-open" href={href} target="_blank" rel="noopener noreferrer" onClick={() => { setStarted((value) => ({ ...value, [task.id]: true })); startIslandScene(task.id); }}>{task.action}<ExternalLink size={13}/></a>
              : <><span className="early-access-config-note">Set REACT_APP_X_TASK_POST_URL in frontend/.env</span><button type="button" className="early-access-open" onClick={() => startIslandScene(task.id)}>Preview scene</button></>}
            {started[task.id] && <button className="early-access-mark" disabled={busy} onClick={() => markComplete(task.id)} data-testid={`complete-early-access-${task.id}`}>Mark done</button>}
          </div>}
        </article>;
      })}</div>
              <aside className="early-access-leaderboard" aria-label="Early Access participants">
                <div className="early-access-leaderboard-title"><div><Users size={17}/><strong>Participants</strong></div><span>TOP 50</span></div>
                <EarlyAccessStandingCard profile={profile} standing={standing} loading={standingBusy}/>
                <label className="early-access-search"><Search size={15}/><input data-testid="participant-search" placeholder="Find your X name or wallet" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                <div className="early-access-participants" data-testid="early-access-participants" aria-live="polite">
                  {listBusy ? <p className="early-access-empty">Loading participants…</p> : participants.length ? participants.map((person) => {
                    const isYou = !!profile && (person.xName?.toLowerCase() === profile.xName?.toLowerCase() || person.walletAddress?.toLowerCase() === profile.walletAddress?.toLowerCase());
                    return <div className={`early-access-participant ${isYou ? 'is-you' : ''}`} key={person.id}>
                      <span className="early-access-participant-rank">#{person.rank}</span><strong>@{person.xName}{isYou && <small className="early-access-you-label">YOU</small>}</strong><code>{shortAddress(person.walletAddress)}</code><b>{person.points} pts</b>
                    </div>;
                  }) : <p className="early-access-empty">{search ? 'No participants match this search.' : 'Be the first to join.'}</p>}
                </div>
              </aside>
            </div>
            {error && <p role="alert" className="form-error" data-testid="early-access-error">{error}</p>}
            <p className="early-access-note">X opens a draft or profile; points are recorded after you return and mark a task done.</p>
          </section>}
        </div>
        <footer className="early-access-statusbar"><span>FROSTFISH · EARLY ACCESS</span><span><i/> Robinhood Chain Testnet</span></footer>
        <button className="early-access-back" type="button" onClick={onClose}><ArrowLeft size={16}/> Back to island</button>
      </DialogContent>
  </Dialog>;
};
