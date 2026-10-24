import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

from game import CHARACTERS, VERSION, advance, buy, initial_state, public_state
from local_store import MemoryClient
from villagers import RESIDENTS

load_dotenv(Path(__file__).parent / '.env')
mongo_url = os.getenv('MONGO_URL', '').strip()
app_url = os.getenv('APP_URL', 'http://localhost:3000').rstrip('/')
wallet_chain_id = int(os.getenv('ROBINHOOD_CHAIN_ID', '46630'))
EARLY_ACCESS_TASK_POINTS = {'follow': 10, 'retweet': 10, 'like': 10, 'quote': 30}
X_NAME_PATTERN = re.compile(r'^[A-Za-z0-9_]{1,15}$')
EVM_ADDRESS_PATTERN = re.compile(r'^0x[0-9a-fA-F]{40}$')
if mongo_url:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongo_url)
    db = client[os.getenv('DB_NAME', 'frostfish')]
else:
    # A fresh local checkout can run without installing or configuring MongoDB.
    client = MemoryClient()
    db = client[os.getenv('DB_NAME', 'frostfish')]
app = FastAPI(title='Frostfish')
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(','),
                   allow_credentials=False, allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'Authorization'])


class Action(BaseModel):
    type: str = Field(max_length=30)
    character: str | None = Field(default=None, max_length=20)


class WalletChallengeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    address: str = Field(min_length=42, max_length=42)
    chain_id: int = Field(alias='chainId', gt=0)


class WalletVerifyRequest(WalletChallengeRequest):
    nonce: str = Field(min_length=16, max_length=64)
    signature: str = Field(min_length=130, max_length=132)


class EarlyAccessParticipantRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    x_name: str = Field(alias='xName', min_length=1, max_length=16)
    address: str = Field(min_length=42, max_length=42)


def public_early_access_participant(participant, rank=None):
    address = participant['wallet_address']
    result = {
        'id': participant['id'],
        'xName': participant['x_name'],
        'walletAddress': f'{address[:6]}…{address[-4:]}',
        'points': participant['points'],
        'completedTasks': participant.get('completed_tasks', []),
    }
    if rank is not None:
        result['rank'] = rank
    return result


def early_access_token_hash(authorization):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'An Early Access participant session is required.')
    return hashlib.sha256(authorization[7:].encode()).hexdigest()


async def get_early_access_participant(authorization):
    participant = await db.early_access_participants.find_one(
        {'access_token_hash': early_access_token_hash(authorization)}, {'_id': 0}
    )
    if not participant:
        raise HTTPException(401, 'Your Early Access participant session has expired.')
    return participant


async def session_id(authorization):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'A game session is required.')
    token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
    wallet_session = await db.wallet_sessions.find_one({
        'token_hash': token_hash,
        'expires_at': {'$gt': datetime.now(timezone.utc).replace(tzinfo=None)},
    }, {'_id': 0, 'session_id': 1})
    return wallet_session['session_id'] if wallet_session else token_hash


def create_wallet_message(address, nonce, now, expires_at):
    domain = urlsplit(app_url).netloc
    issued_at = now.replace(tzinfo=timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    expiration_time = expires_at.replace(tzinfo=timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    return (
        f'{domain} wants you to sign in with your Ethereum account:\n'
        f'{address}\n\n'
        'Sign in to Frostfish. This one-time message does not authorize transactions.\n\n'
        f'URI: {app_url}\nVersion: 1\nChain ID: {wallet_chain_id}\nNonce: {nonce}\n'
        f'Issued At: {issued_at}\nExpiration Time: {expiration_time}'
    )


def wallet_crypto():
    try:
        from eth_account import Account
        from eth_account.messages import encode_defunct
        from eth_utils import is_address, to_checksum_address
    except ImportError as error:
        raise HTTPException(503, 'EVM sign-in requires eth-account. Install backend/requirements.txt and restart the API.') from error
    return Account, encode_defunct, is_address, to_checksum_address


@app.post('/api/auth/challenge')
async def wallet_challenge(request: WalletChallengeRequest):
    _, _, is_address, to_checksum_address = wallet_crypto()
    if not is_address(request.address):
        raise HTTPException(422, 'A valid EVM wallet address is required.')
    if request.chain_id != wallet_chain_id:
        raise HTTPException(400, f'Switch to Robinhood Chain Testnet (chain {wallet_chain_id}) to sign in.')
    address = to_checksum_address(request.address)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(minutes=5)
    nonce = secrets.token_hex(16)
    message = create_wallet_message(address, nonce, now, expires_at)
    await db.wallet_challenges.insert_one({
        'nonce': nonce,
        'address': address.lower(),
        'chain_id': wallet_chain_id,
        'message': message,
        'expires_at': expires_at,
    })
    return {
        'nonce': nonce,
        'message': message,
        'expiresAt': expires_at.replace(tzinfo=timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
    }


@app.post('/api/auth/verify')
async def wallet_verify(request: WalletVerifyRequest):
    Account, encode_defunct, is_address, to_checksum_address = wallet_crypto()
    if not is_address(request.address):
        raise HTTPException(422, 'A valid EVM wallet address is required.')
    if request.chain_id != wallet_chain_id:
        raise HTTPException(400, f'Switch to Robinhood Chain Testnet (chain {wallet_chain_id}) to sign in.')
    challenge = await db.wallet_challenges.find_one_and_delete({'nonce': request.nonce})
    if not challenge or challenge['expires_at'] <= datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(401, 'That wallet sign-in request expired. Please try again.')
    address = to_checksum_address(request.address)
    if challenge['address'] != address.lower() or challenge['chain_id'] != request.chain_id:
        raise HTTPException(401, 'The wallet sign-in request does not match this account.')
    try:
        recovered = Account.recover_message(encode_defunct(text=challenge['message']), signature=request.signature)
    except Exception:
        raise HTTPException(401, 'The wallet signature could not be verified.') from None
    if recovered.lower() != address.lower():
        raise HTTPException(401, 'The signature was made by a different wallet.')

    wallet_address = address.lower()
    game = await db.games.find_one({'wallet_address': wallet_address}, {'_id': 0})
    if game:
        sid = game['session_id']
        if game.get('version') != VERSION:
            game = {**initial_state(sid), 'session_id': sid, 'wallet_address': wallet_address}
            await db.games.replace_one({'session_id': sid}, game.copy())
    else:
        sid = hashlib.sha256(secrets.token_urlsafe(40).encode()).hexdigest()
        game = {**initial_state(sid), 'session_id': sid, 'wallet_address': wallet_address}
        await db.games.insert_one(game.copy())
    token = secrets.token_urlsafe(40)
    await db.wallet_sessions.insert_one({
        'token_hash': hashlib.sha256(token.encode()).hexdigest(),
        'session_id': sid,
        'expires_at': datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30),
    })
    return {'token': token, 'game': public_state(game)}


@app.post('/api/early-access/participants')
async def register_early_access_participant(request: EarlyAccessParticipantRequest):
    x_name = request.x_name.strip().lstrip('@')
    address = request.address.strip()
    if not X_NAME_PATTERN.fullmatch(x_name):
        raise HTTPException(422, 'Enter a valid X username (1–15 letters, numbers or underscores).')
    if not EVM_ADDRESS_PATTERN.fullmatch(address):
        raise HTTPException(422, 'Enter a valid EVM address beginning with 0x.')
    x_name_key = x_name.lower()
    if await db.early_access_participants.find_one({'x_name_key': x_name_key}):
        raise HTTPException(409, 'This X username is already registered for Early Access.')
    access_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    participant = {
        'id': secrets.token_hex(16),
        'x_name': x_name,
        'x_name_key': x_name_key,
        'wallet_address': address.lower(),
        'points': 0,
        'completed_tasks': [],
        'access_token_hash': hashlib.sha256(access_token.encode()).hexdigest(),
        'created_at': now,
        'updated_at': now,
    }
    try:
        await db.early_access_participants.insert_one(participant.copy())
    except Exception as error:
        if getattr(error, 'code', None) == 11000:
            raise HTTPException(409, 'This X username is already registered for Early Access.') from None
        raise
    return {'accessToken': access_token, 'participant': public_early_access_participant(participant)}


@app.get('/api/early-access/me')
async def early_access_me(authorization: str | None = Header(default=None)):
    participant = await get_early_access_participant(authorization)
    return {'participant': public_early_access_participant(participant)}


@app.get('/api/early-access/participants')
async def early_access_participants(search: str = Query(default='', max_length=80)):
    cleaned_search = search.strip()
    query = {}
    if cleaned_search:
        pattern = re.escape(cleaned_search)
        query = {'$or': [
            {'x_name': {'$regex': pattern, '$options': 'i'}},
            {'wallet_address': {'$regex': pattern, '$options': 'i'}},
        ]}
    documents = await db.early_access_participants.find(
        query, {'_id': 0, 'access_token_hash': 0, 'x_name_key': 0}
    ).sort('points', -1).limit(50).to_list(50)
    participants = []
    for index, participant in enumerate(documents):
        rank = index + 1 if not cleaned_search else (
            await db.early_access_participants.count_documents({'points': {'$gt': participant['points']}}) + 1
        )
        participants.append(public_early_access_participant(participant, rank))
    return {'participants': participants}


@app.post('/api/early-access/tasks/{task_id}')
async def complete_early_access_task(task_id: str, authorization: str | None = Header(default=None)):
    points = EARLY_ACCESS_TASK_POINTS.get(task_id)
    if points is None:
        raise HTTPException(404, 'Unknown Early Access task.')
    participant = await get_early_access_participant(authorization)
    updated = await db.early_access_participants.update_one(
        {'id': participant['id'], 'completed_tasks': {'$ne': task_id}},
        {'$addToSet': {'completed_tasks': task_id}, '$inc': {'points': points},
         '$set': {'updated_at': datetime.now(timezone.utc).replace(tzinfo=None)}},
    )
    participant = await db.early_access_participants.find_one(
        {'id': participant['id']}, {'_id': 0, 'access_token_hash': 0, 'x_name_key': 0}
    )
    return {
        'awarded': bool(updated.modified_count),
        'awardedPoints': points if updated.modified_count else 0,
        'participant': public_early_access_participant(participant),
    }


@app.get('/api/health')
async def health():
    await db.command('ping')
    return {'status': 'ok', 'game': 'Frostfish'}


@app.get('/api/characters')
async def characters():
    return list(CHARACTERS.values())


@app.get('/api/village')
async def village():
    return {'villagers': RESIDENTS}


@app.post('/api/sessions')
async def create_session():
    token = secrets.token_urlsafe(40)
    sid = hashlib.sha256(token.encode()).hexdigest()
    state = {**initial_state(sid), 'session_id': sid}
    await db.games.insert_one(state.copy())
    return {'token': token, 'game': public_state(state)}


async def mutate(authorization, action=None):
    sid = await session_id(authorization)
    for _ in range(8):
        state = await db.games.find_one({'session_id': sid}, {'_id': 0})
        if not state:
            raise HTTPException(401, 'Your session has expired. Start a new adventure.')
        revision = state['revision']
        if state.get('version') != VERSION:
            state = {**initial_state(sid), 'session_id': sid, **({'wallet_address': state['wallet_address']} if state.get('wallet_address') else {})}
        advance(state)
        if action:
            if action.type == 'buy':
                error = buy(state, action.character)
                if error:
                    raise HTTPException(400 if 'TOKEN' in error else 422, error)
            elif action.type == 'reset':
                state = {**initial_state(sid), 'session_id': sid, **({'wallet_address': state['wallet_address']} if state.get('wallet_address') else {})}
            else:
                raise HTTPException(422, 'Unknown game action.')
        state['revision'] = revision + 1
        result = await db.games.replace_one({'session_id': sid, 'revision': revision}, state.copy())
        if result.modified_count:
            return public_state(state)
    raise HTTPException(409, 'The island is busy. Please try again.')


@app.get('/api/game')
async def get_game(authorization: str | None = Header(default=None)):
    return await mutate(authorization)


@app.post('/api/game/action')
async def game_action(action: Action, authorization: str | None = Header(default=None)):
    return await mutate(authorization, action)


@app.get('/api/leaderboard')
async def leaderboard(authorization: str | None = Header(default=None)):
    sid = await session_id(authorization) if authorization else None
    docs = await db.games.find({'version': VERSION}, {'_id': 0, 'name': 1, 'total_earned_micro': 1, 'workers': 1, 'session_id': 1}) \
        .sort('total_earned_micro', -1).limit(10).to_list(10)
    entries = [{'rank': i + 1, 'name': d['name'], 'rewards': d['total_earned_micro'] / 1_000_000,
                'workers': len(d['workers']), 'you': d['session_id'] == sid} for i, d in enumerate(docs)]
    you = None
    if sid:
        me = await db.games.find_one({'session_id': sid, 'version': VERSION}, {'_id': 0, 'name': 1, 'total_earned_micro': 1, 'workers': 1})
        if me:
            rank = await db.games.count_documents({'version': VERSION, 'total_earned_micro': {'$gt': me['total_earned_micro']}}) + 1
            you = {'rank': rank, 'name': me['name'], 'rewards': me['total_earned_micro'] / 1_000_000, 'workers': len(me['workers'])}
    return {'entries': entries, 'you': you}


@app.on_event('startup')
async def indexes():
    await db.games.create_index('session_id', unique=True)
    await db.games.create_index('wallet_address', unique=True, sparse=True)
    await db.wallet_challenges.create_index('nonce', unique=True)
    await db.wallet_challenges.create_index('expires_at', expireAfterSeconds=0)
    await db.wallet_sessions.create_index('token_hash', unique=True)
    await db.wallet_sessions.create_index('expires_at', expireAfterSeconds=0)
    await db.games.create_index([('total_earned_micro', -1)])
    await db.early_access_participants.create_index('x_name_key', unique=True)
    await db.early_access_participants.create_index('access_token_hash', unique=True)
    await db.early_access_participants.create_index([('points', -1)])


@app.on_event('shutdown')
async def shutdown():
    client.close()
