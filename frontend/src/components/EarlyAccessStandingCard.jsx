import { Loader2, Trophy } from 'lucide-react';

export function EarlyAccessStandingCard({ profile, standing, loading }) {
  if (!profile) return null;

  const rank = standing?.rank;
  const note = loading
    ? 'Finding your place on the board…'
    : rank && rank <= 50
      ? 'You’re in the top 50. Your row is highlighted below.'
      : rank
        ? 'Your place is shown here, even outside the top 50.'
        : 'Your rank will appear after your entry reaches the board.';

  return <section className="early-access-your-standing" data-testid="early-access-your-standing" aria-live="polite">
    <span className="early-access-your-standing-icon"><Trophy size={17}/></span>
    <div className="early-access-your-standing-copy">
      <span>YOUR PLACE ON THE BOARD</span>
      <strong>@{profile.xName}</strong>
      <small>{note}</small>
    </div>
    <div className="early-access-your-standing-score">
      {loading ? <Loader2 className="spin" size={18}/> : <strong>{rank ? `#${rank}` : '—'}</strong>}
      <span>{standing?.points ?? profile.points ?? 0} pts</span>
    </div>
  </section>;
}
