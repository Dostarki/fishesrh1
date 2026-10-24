"""Request-driven, server-authoritative DEMO economy; no blockchain transactions."""
import time
from datetime import datetime, timezone
from villagers import advance_villagers, initial_villagers, public_villagers

VERSION = 2
STARTING_BALANCE = 100
REST = 120
CHARACTERS = {
    'rod': {'id': 'rod', 'name': 'The Angler', 'role': 'Rod fisherman', 'daily_yield': 100, 'price': 10,
            'limit': 20, 'capacity': 5, 'fish_time': 3.0, 'walk': 9.0, 'rest': REST},
    'net': {'id': 'net', 'name': 'The Netter', 'role': 'Net fisherman', 'daily_yield': 250, 'price': 25,
            'limit': 100, 'capacity': 10, 'fish_time': 1.2, 'walk': 10.0, 'rest': REST},
    'boat': {'id': 'boat', 'name': 'The Captain', 'role': 'Boat fisherman', 'daily_yield': 600, 'price': 60,
             'limit': 200, 'capacity': 20, 'fish_time': 0.8, 'walk': 10.0, 'rest': REST},
}


def cycle(c):
    trip = c['capacity'] * c['fish_time'] + 2 * c['walk']
    trips = c['limit'] // c['capacity']
    work = trip * trips
    return trip, trips, work, work + c['rest']


for _c in CHARACTERS.values():
    _c['cycle_seconds'] = cycle(_c)[3]
    _c['fish_value'] = _c['daily_yield'] * _c['cycle_seconds'] / (86400 * _c['limit'])


def phase(c, elapsed):
    trip, trips, work, total = cycle(c)
    cycles, r = divmod(elapsed, total)
    if r >= work:
        return {'status': 'Sleeping', 'energy': round((r - work) / c['rest'] * 100), 'bucket': 0,
                'rest_left': round(total - r), 'session_caught': c['limit'], 'cycles': int(cycles)}
    i, te = divmod(r, trip)
    fishing = c['capacity'] * c['fish_time']
    bucket = min(c['capacity'], int(te // c['fish_time']))
    caught = int(i) * c['capacity'] + bucket
    energy = 100 - (int(i) * c['capacity'] + min(c['capacity'], te / c['fish_time'])) / c['limit'] * 100
    status = 'Fishing' if te < fishing else 'Delivering' if te < fishing + c['walk'] else 'Returning'
    if status == 'Returning':
        bucket = 0
    return {'status': status, 'energy': round(energy), 'bucket': bucket, 'rest_left': 0,
            'session_caught': caught, 'cycles': int(cycles)}


def delivered_trips(c, elapsed):
    trip, trips, work, total = cycle(c)
    cycles, r = divmod(elapsed, total)
    arrive = c['capacity'] * c['fish_time'] + c['walk']
    done = 0 if r < arrive else min(trips, int((r - arrive) // trip) + 1)
    return int(cycles) * trips + done


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def initial_state(sid):
    return {'version': VERSION, 'name': f"Islander #{sid[:4].upper()}", 'workers': [],
            'balance_micro': STARTING_BALANCE * 1_000_000, 'total_earned_micro': 0,
            'fish_sold': 0, 'fish_caught': 0, 'market_stock': 0, 'events': [], 'revision': 0, 'next_uid': 1,
            'last_tick': time.time(), 'created_at': now_iso(), 'villagers': initial_villagers(),
            'customers_served': 0, 'simulation_time': 0.0, 'next_sale_at': 0.0}


def advance(state):
    now = time.time()
    delta = min(8, max(0, now - state['last_tick']))
    state['last_tick'] = now
    for w in state['workers']:
        c = CHARACTERS[w['character']]
        w['elapsed'] += delta
        done = delivered_trips(c, w['elapsed'])
        if done > w['delivered']:
            fish = (done - w['delivered']) * c['capacity']
            earn = round(fish * c['fish_value'] * 1_000_000)
            w['delivered'] = done
            w['sold'] += fish
            w['earned_micro'] += earn
            state['balance_micro'] += earn
            state['total_earned_micro'] += earn
            state['market_stock'] += fish
            state['events'].insert(0, {'text': f"{c['name']} #{w['uid']} delivered {fish} fish · +{earn / 1_000_000:.4f} TOKEN",
                                       'kind': 'sale', 'at': now_iso()})
    remaining = delta
    while remaining > .000001:
        dt = min(.2, remaining)
        remaining -= dt
        state['simulation_time'] += dt
        advance_villagers(state, dt)
    state['fish_caught'] = sum(caught(w) for w in state['workers'])
    state['events'] = state['events'][:12]


def caught(w):
    c = CHARACTERS[w['character']]
    p = phase(c, w['elapsed'])
    return p['cycles'] * c['limit'] + p['session_caught']


def buy(state, character):
    c = CHARACTERS.get(character)
    if not c:
        return 'Choose a valid fisherman.'
    price = c['price'] * 1_000_000
    if state['balance_micro'] < price:
        return 'Not enough TOKEN for this fisherman yet.'
    slot = sum(1 for w in state['workers'] if w['character'] == character)
    uid = state['next_uid']
    state['workers'].append({'uid': uid, 'character': character, 'slot': slot, 'elapsed': 0.0,
                             'delivered': 0, 'sold': 0, 'earned_micro': 0})
    state['next_uid'] += 1
    state['balance_micro'] -= price
    state['events'].insert(0, {'text': f"Hired {c['name']} #{uid} · −{c['price']} TOKEN", 'kind': 'crew', 'at': now_iso()})
    return None


def worker_view(w):
    c = CHARACTERS[w['character']]
    p = phase(c, w['elapsed'])
    return {'uid': w['uid'], 'id': w['character'], 'character': w['character'], 'slot': w['slot'],
            'name': c['name'], 'role': c['role'], 'daily_yield': c['daily_yield'], 'capacity': c['capacity'],
            'limit': c['limit'], 'elapsed': w['elapsed'], 'status': p['status'], 'energy': p['energy'],
            'bucket': p['bucket'], 'rest_left': p['rest_left'], 'caught': p['cycles'] * c['limit'] + p['session_caught'],
            'sold': w['sold'], 'earned': w['earned_micro'] / 1_000_000}


def public_state(state):
    workers = [worker_view(w) for w in state['workers']]
    return {'name': state['name'], 'workers': workers,
            'active_workers': sum(1 for w in workers if w['status'] != 'Sleeping'),
            'daily_yield': sum(w['daily_yield'] for w in workers),
            'balance': state['balance_micro'] / 1_000_000, 'rewards': state['total_earned_micro'] / 1_000_000,
            'fish_sold': state['fish_sold'], 'fish_caught': state['fish_caught'],
            'customers_served': state['customers_served'], 'market_stock': state['market_stock'],
            'paused': False, 'speed': 1, 'events': state['events'][:12], 'revision': state['revision'],
            'created_at': state['created_at'], 'demo': True, 'villagers': public_villagers(state),
            'simulation_time': state['simulation_time']}
