export const CREW = [
  { id: 'rod', name: 'The Angler', role: 'ROD FISHERMAN', subtitle: 'A rod. A quiet spot. A fresh start.', daily_yield: 100, price: 10, limit: 20, capacity: 5, fishTime: 3, walk: 9, rest: 120, color: '#ff7f2a', location: 'River bank' },
  { id: 'net', name: 'The Netter', role: 'NET FISHERMAN', subtitle: 'Cast a little wider. Catch a little more.', daily_yield: 250, price: 25, limit: 100, capacity: 10, fishTime: 1.2, walk: 10, rest: 120, color: '#12b5a5', location: 'West bank' },
  { id: 'boat', name: 'The Captain', role: 'BOAT FISHERMAN', subtitle: 'Good things wait beyond the shore.', daily_yield: 600, price: 60, limit: 200, capacity: 20, fishTime: .8, walk: 10, rest: 120, color: '#3f6dff', location: 'Open sea' },
];
export const CREW_BY_ID = Object.fromEntries(CREW.map(c => [c.id, c]));
export const MARKET = [.4, 1, 2.4];

export function cycleOf(c) {
  const trip = c.capacity * c.fishTime + 2 * c.walk, trips = c.limit / c.capacity, work = trip * trips;
  return { trip, work, total: work + c.rest };
}

// Mirrors backend game.phase so animation matches the authoritative economy.
export function workerPhase(c, elapsed) {
  const { trip, work, total } = cycleOf(c), r = elapsed % total;
  if (r >= work) { const t = r - work; return { state: 'resting', t, restLeft: c.rest - t, energy: t / c.rest, bucket: 0 }; }
  const i = Math.floor(r / trip), te = r % trip, fishing = c.capacity * c.fishTime;
  const energy = 1 - (i * c.capacity + Math.min(c.capacity, te / c.fishTime)) / c.limit;
  if (te < fishing) return { state: 'fishing', t: te, energy, bucket: Math.floor(te / c.fishTime), fishT: (te % c.fishTime) / c.fishTime };
  if (te < fishing + c.walk) return { state: 'delivering', t: te - fishing, energy, bucket: c.capacity };
  return { state: 'returning', t: te - fishing - c.walk, energy, bucket: 0 };
}
