import { riverX, shoreZ } from '../game/villageBuilder';

const BANK_Z = [5.2, 2.9, .6, -8.6, -10.9, -13.2, -15.5, -17.8, -20.1, -22.4, -24.7, -27];
const BOAT_X = [-11, -7.5, -4, -.5, 3, 19, 22.5, 26, 29.5, 33, 36.5, 40];
const Y = 1.02;
const MARKET_STOP = [[.8, Y, 4.3], [.8, Y, 4.1]];
const bank = (z, side, off = 0) => [riverX(z) + side * (1.9 + off), Y, z];
function bankWalk(from, to, side, off) {
  const pts = [], step = from > to ? -2 : 2;
  for (let z = from; step < 0 ? z > to : z < to; z += step) pts.push(bank(z, side, off));
  pts.push(bank(to, side, off));
  return pts;
}

export function workerLayout(type, slot) {
  if (type === 'boat') {
    const n = BOAT_X.length, x = BOAT_X[slot % n], row = Math.floor(slot / n), z = shoreZ(x) + 3 + row * 3.2;
    const spot = [x, .43, z], mz = 13.2 + (slot % 4);
    const sea = x > 7 ? [spot, [x, .43, 19.5 + row * 3.2], [6.4, .43, 19.5 + row * 3.2], [7.1, .43, mz]] : [spot, [7.1, .43, mz]];
    return { spot, facing: 0, seaPoints: sea.length, route: [...sea, [8.8, Y, mz], [8.8, Y, 5.6], [.8, Y, 5.6], [.8, Y, 4.1]] };
  }
  const side = type === 'rod' ? 1 : -1, n = BANK_Z.length, z = BANK_Z[slot % n], off = Math.floor(slot / n) * 3.2;
  const spot = bank(z, side, off);
  const route = type === 'rod'
    ? [...bankWalk(z, 4.3, 1, off), ...MARKET_STOP]
    : [...bankWalk(z, -5.5, -1, off), bank(-5.5, 1, 0), ...bankWalk(-5.5, 4.3, 1, 0), ...MARKET_STOP];
  const hammock = [riverX(z + 1.15) + side * (3.05 + off), Y, z + 1.15];
  return { spot, facing: side > 0 ? -Math.PI / 2 : Math.PI / 2, route, hammock };
}

export function makeRoute(raw) {
  const pts = raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[2] - raw[i - 1][2]) > 1e-4);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  const total = cum[cum.length - 1];
  return {
    total,
    lengthTo: idx => cum[Math.min(idx, cum.length - 1)],
    at(d) {
      const dist = Math.max(0, Math.min(total, d));
      let i = 1;
      while (i < pts.length - 1 && cum[i] < dist) i++;
      const a = pts[i - 1], b = pts[i] || a, seg = (cum[i] - cum[i - 1]) || 1, t = (dist - cum[i - 1]) / seg;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t, angle: Math.atan2(b[0] - a[0], b[2] - a[2]) };
    },
  };
}
