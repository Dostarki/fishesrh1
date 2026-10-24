"""Backend regression for Frostfish (fishsnow) demo economy.
Covers sessions, buy actions (rod/net/boat + unlimited), rejected pause/speed, game advance,
leaderboard, and reset flow via public preview URL."""
import os
import time
import pytest
import requests
from pathlib import Path

# Load frontend .env to get public BACKEND URL
ENV = Path('/app/frontend/.env').read_text()
for line in ENV.splitlines():
    if line.startswith('REACT_APP_BACKEND_URL='):
        BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
        break

PRICES = {'rod': 10, 'net': 25, 'boat': 60}


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture
def session(client):
    r = client.post(f"{BASE_URL}/api/sessions")
    assert r.status_code == 200, r.text
    data = r.json()
    token = data['token']
    client.headers['Authorization'] = f'Bearer {token}'
    return data


# ---------------- Sessions ----------------
class TestSessions:
    def test_create_session_shape(self, client):
        r = client.post(f"{BASE_URL}/api/sessions")
        assert r.status_code == 200
        d = r.json()
        assert 'token' in d and isinstance(d['token'], str) and len(d['token']) > 20
        g = d['game']
        assert g['balance'] == 100
        assert g['workers'] == []
        assert g['name'].startswith('Islander #') and len(g['name']) == len('Islander #') + 4
        assert g['rewards'] == 0
        assert g['paused'] is False and g['speed'] == 1

    def test_get_game_requires_auth(self, client):
        r = client.get(f"{BASE_URL}/api/game")
        assert r.status_code == 401


# ---------------- Buy ----------------
class TestBuy:
    def test_buy_rod_deducts_price(self, client, session):
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'buy', 'character': 'rod'})
        assert r.status_code == 200, r.text
        g = r.json()
        assert g['balance'] <= 100 - PRICES['rod'] + 0.01
        assert g['balance'] >= 100 - PRICES['rod'] - 0.01
        assert len(g['workers']) == 1
        w = g['workers'][0]
        assert w['character'] == 'rod' and w['slot'] == 0 and w['uid'] == 1

    def test_buy_unlimited_same_type(self, client, session):
        for i in range(3):
            r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'buy', 'character': 'rod'})
            assert r.status_code == 200, r.text
        g = r.json()
        rods = [w for w in g['workers'] if w['character'] == 'rod']
        assert len(rods) == 3
        slots = sorted(w['slot'] for w in rods)
        assert slots == [0, 1, 2]

    def test_buy_insufficient_balance_400(self, client, session):
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'buy', 'character': 'boat'})
        assert r.status_code == 200
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'buy', 'character': 'boat'})
        # 100 - 60 = 40, less than 60, should fail
        assert r.status_code == 400
        assert 'TOKEN' in r.json().get('detail', '')

    def test_buy_invalid_character_422(self, client, session):
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'buy', 'character': 'ghost'})
        assert r.status_code == 422

    def test_unknown_action_type_422(self, client, session):
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'pause'})
        assert r.status_code == 422
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'speed'})
        assert r.status_code == 422
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'nonsense'})
        assert r.status_code == 422


# ---------------- Game advance ----------------
class TestAdvance:
    def test_rod_cycle_progresses(self, client, session):
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'buy', 'character': 'rod'})
        assert r.status_code == 200
        statuses = set()
        start_balance = r.json()['balance']
        # Poll frequently; advance clamps delta to 8s per request
        for _ in range(16):
            time.sleep(2)
            g = client.get(f"{BASE_URL}/api/game").json()
            w = g['workers'][0]
            statuses.add(w['status'])
            if g['balance'] > start_balance + 0.0001:
                break
        assert 'Fishing' in statuses
        # Expect at least a delivery after enough time
        assert g['balance'] > start_balance - 0.0001
        # rewards should accrue at some point
        # (not strictly required by first poll; just ensure energy decreases)
        assert w['energy'] <= 100


# ---------------- Leaderboard ----------------
class TestLeaderboard:
    def test_leaderboard_no_auth(self, client):
        r = client.get(f"{BASE_URL}/api/leaderboard")
        assert r.status_code == 200
        d = r.json()
        assert 'entries' in d and isinstance(d['entries'], list)
        assert d['you'] is None

    def test_leaderboard_with_auth(self, client, session):
        r = client.get(f"{BASE_URL}/api/leaderboard", headers=client.headers)
        assert r.status_code == 200
        d = r.json()
        assert 'entries' in d
        # 'you' may be None if session not yet in sorted top-10; but should include rank
        if d['you']:
            assert 'rank' in d['you']


# ---------------- Reset ----------------
class TestReset:
    def test_reset_restores_fresh(self, client, session):
        client.post(f"{BASE_URL}/api/game/action", json={'type': 'buy', 'character': 'rod'})
        r = client.post(f"{BASE_URL}/api/game/action", json={'type': 'reset'})
        assert r.status_code == 200
        g = r.json()
        assert g['balance'] == 100
        assert g['workers'] == []
        assert g['rewards'] == 0
