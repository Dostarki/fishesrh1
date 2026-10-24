import { useEffect, useState } from 'react';
import { Fish, Store, Coins, Footprints, ArrowUpRight, RotateCcw, Sparkles, Moon, Package, Trophy, Crown, Users, Zap } from 'lucide-react';
import { GameDialog } from './GameDialog';
import { Button } from './ui/button';
import { CharacterArt } from './CharacterArt';
import { CREW } from '../lib/gameData';

const ownedBy = (game, id) => (game?.workers || []).filter(w => w.character === id).length;

export const MarketDialog = ({ open, onClose, game, onBuy, busy }) => {
  const balance = game?.balance ?? 0;
  return <GameDialog open={open} onClose={onClose} id="market" title="Fishermen Market" subtitle="Hire as many as you like. Each one fishes, carries the catch to market, then naps in a hammock." className="shop-dialog">
    {game && <div className="shop-balance" data-testid="shop-balance"><Coins size={18}/> <strong>{balance.toFixed(4)}</strong> TOKEN</div>}
    <div className="shop-grid">{CREW.map(c => {
      const owned = ownedBy(game, c.id), afford = !game || balance >= c.price;
      return <div className={`shop-card shop-${c.id}`} key={c.id} data-testid={`shop-card-${c.id}`}>
        <div className="shop-art"><CharacterArt type={c.id}/><span className="owned-badge" data-testid={`owned-count-${c.id}`}>OWNED ×{owned}</span></div>
        <div className="shop-role">{c.role}</div>
        <h3 data-testid={`shop-name-${c.id}`}>{c.name}</h3>
        <div className="shop-yield"><Sparkles size={16}/><strong data-testid={`shop-daily-yield-${c.id}`}>{c.daily_yield}</strong><span>TOKEN / day</span></div>
        <ul className="shop-facts">
          <li><Fish size={13}/> {c.limit} fish per shift</li>
          <li><Package size={13}/> {c.capacity} fish per trip</li>
          <li><Moon size={13}/> 2 min hammock nap</li>
        </ul>
        <button className="game-btn btn-gold shop-buy" data-testid={`buy-${c.id}-button`} disabled={busy || !afford} onClick={() => onBuy(c.id)}>
          <span className="btn-icon"><Coins size={18}/></span><span className="btn-label">HIRE<small>{c.price} TOKEN</small></span>
        </button>
        {!afford && <p className="shop-short" data-testid={`shop-short-${c.id}`}>Need {(c.price - balance).toFixed(2)} more TOKEN</p>}
      </div>;
    })}</div>
    {!!game?.events?.length && <><div className="ledger-heading"><span>MARKET ACTIVITY</span><span>{game.fish_sold} fish sold · {game.customers_served} customers</span></div>
      <div className="activity-list" data-testid="market-activity">{game.events.slice(0, 6).map((event, i) => <div className="activity-item" key={`${event.at}-${i}`} data-testid={`activity-${i}`}><span className={`activity-icon ${event.kind}`}><ArrowUpRight size={15}/></span><span>{event.text}</span><time>{new Date(event.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div></>}
  </GameDialog>;
};

const STATUS_CLASS = { Fishing: 'st-fish', Delivering: 'st-deliver', Returning: 'st-return', Sleeping: 'st-sleep' };
export const InventoryDialog = ({ open, onClose, game, onMarket }) => {
  const workers = game?.workers || [];
  return <GameDialog open={open} onClose={onClose} id="inventory" title="Inventory" subtitle="Every fisherman you own, live from the island." className="inventory-dialog">
    <div className="inventory-summary">{CREW.map(c => <div key={c.id} className={`inv-sum inv-${c.id}`} data-testid={`inventory-summary-${c.id}`}><CharacterArt type={c.id} small/><div><strong>×{ownedBy(game, c.id)}</strong><span>{c.name}</span></div></div>)}</div>
    {workers.length ? <div className="inventory-list" data-testid="inventory-list">{workers.map(w => <div className="inv-row" key={w.uid} data-testid={`inventory-worker-${w.uid}`}>
      <CharacterArt type={w.character} small/>
      <div className="inv-main"><div className="inv-top"><strong>{w.name} #{w.uid}</strong><span className={`inv-status ${STATUS_CLASS[w.status]}`} data-testid={`inventory-status-${w.uid}`}>{w.status === 'Sleeping' ? `Sleeping · ${w.rest_left}s` : w.status}</span></div>
        <div className="inv-energy"><Zap size={12}/><div className="energy-track"><i style={{ width: `${w.energy}%` }} className={w.energy > 50 ? 'e-high' : w.energy > 20 ? 'e-mid' : 'e-low'}/></div><span data-testid={`inventory-energy-${w.uid}`}>{w.energy}%</span></div>
        <div className="inv-meta"><span><Fish size={12}/> {w.caught} caught</span><span><Coins size={12}/> +{w.earned.toFixed(4)}</span><span><Sparkles size={12}/> {w.daily_yield}/day</span></div>
      </div>
    </div>)}</div> : <div className="empty-market" data-testid="inventory-empty">No fishermen yet. <button className="text-button" onClick={onMarket} data-testid="inventory-open-market">Visit the market</button></div>}
  </GameDialog>;
};

export const LeaderboardDialog = ({ open, onClose, load }) => {
  const [data, setData] = useState(null);
  useEffect(() => { if (open) load().then(setData).catch(() => setData({ entries: [], you: null })); }, [open, load]);
  return <GameDialog open={open} onClose={onClose} id="leaderboard" title="Leaderboard" subtitle="Top islanders by lifetime rewards." className="leaderboard-dialog">
    {!data ? <div className="empty-market" data-testid="leaderboard-loading">Counting the catch…</div> : <>
      <div className="lb-list" data-testid="leaderboard-list">{data.entries.map(e => <div className={`lb-row ${e.you ? 'lb-you' : ''} lb-rank-${e.rank}`} key={e.rank} data-testid={`leaderboard-row-${e.rank}`}>
        <span className="lb-rank">{e.rank <= 3 ? <Crown size={16}/> : null}{e.rank}</span><strong>{e.name}{e.you && <em>YOU</em>}</strong><span className="lb-workers"><Users size={12}/> {e.workers}</span><span className="lb-rewards">{e.rewards.toFixed(4)}</span>
      </div>)}</div>
      {data.you && <div className="lb-me" data-testid="leaderboard-you"><Trophy size={18}/> Your rank <strong>#{data.you.rank}</strong> · {data.you.rewards.toFixed(4)} TOKEN</div>}
    </>}
  </GameDialog>;
};

export const GuideDialog = ({ open, onClose }) => <GameDialog open={open} onClose={onClose} id="guide" title="A fisherman's field guide" subtitle="Life moves a little slower in Frosthaven." className="guide-dialog">
  <div className="guide-steps">{[[Store,'01','Hire at the market','Spend TOKEN to hire Anglers, Netters and Captains. There is no limit. Each one takes their own spot by the water.'],[Footprints,'02','Catch, carry, earn','Fishermen fill their bucket, carry it to the market and earn TOKEN for every fish delivered.'],[Moon,'03','Energy & naps','Anglers rest after 20 fish, Netters after 100, Captains after 200. They nap in a hammock for 2 minutes, then get back to work.']].map(([Icon,n,title,description])=><div className="guide-step" key={n} data-testid={`guide-step-${n}`}><span className="guide-icon"><Icon size={22}/></span><div><span className="step-number">{n}</span><h3>{title}</h3><p>{description}</p></div></div>)}</div>
  <p className="guide-footnote" data-testid="guide-demo-notice">Progress is saved in this browser's session. Earnings accrue while your island is open. Demo TOKEN has no monetary value and is not transferred on-chain.</p>
</GameDialog>;

export const ResetDialog = ({ open, onClose, onReset, busy }) => <GameDialog open={open} onClose={onClose} id="reset" title="A fresh start?" subtitle="This clears your workers, catches, and demo TOKEN balance. This cannot be undone.">
  <div className="reset-actions"><Button variant="outline" data-testid="cancel-reset-button" onClick={onClose}>Keep my island</Button><Button className="pixel-button" data-testid="confirm-reset-button" onClick={onReset} disabled={busy}><RotateCcw size={16}/> Start fresh</Button></div>
</GameDialog>;
