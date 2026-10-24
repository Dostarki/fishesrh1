"""Dependency-free local API server for the Frostfish demo."""

import copy
import hashlib
import json
import os
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from game import CHARACTERS, VERSION, advance, buy, initial_state, public_state
from villagers import RESIDENTS


def _load_env_file(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(Path(__file__).parent / ".env")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
}
APP_URL = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")
CHAIN_ID = int(os.getenv("ROBINHOOD_CHAIN_ID", "46630"))
TASK_POINTS = {"follow": 10, "retweet": 10, "like": 10, "quote": 30}
X_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{1,15}$")
EVM_ADDRESS_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")
SESSIONS = {}
WALLET_GAMES = {}
WALLET_SESSIONS = {}
WALLET_CHALLENGES = {}
SESSION_LOCK = threading.RLock()
PARTICIPANTS = {}
PARTICIPANT_LOCK = threading.RLock()
MONGO_CLIENT = None
MONGO_PARTICIPANTS = None
MONGO_URL = os.getenv("MONGO_URL", "").strip()
if MONGO_URL:
    try:
        from pymongo import MongoClient
    except ImportError as error:
        raise RuntimeError("MONGO_URL is set, but pymongo is missing. Run start.ps1 to install the MongoDB driver.") from error
    MONGO_CLIENT = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    MONGO_DB = MONGO_CLIENT[os.getenv("DB_NAME", "frostfish")]
    MONGO_PARTICIPANTS = MONGO_DB.early_access_participants
    MONGO_CLIENT.admin.command("ping")
    MONGO_PARTICIPANTS.create_index("x_name_key", unique=True)
    MONGO_PARTICIPANTS.create_index("access_token_hash", unique=True)
    MONGO_PARTICIPANTS.create_index([("points", -1)])


class ApiError(Exception):
    def __init__(self, status, detail):
        self.status = status
        self.detail = detail


def _session_id(authorization, allow_missing=False):
    if not authorization and allow_missing:
        return None
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "A game session is required.")
    token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
    wallet_session = WALLET_SESSIONS.get(token_hash)
    if wallet_session and wallet_session["expires_at"] > datetime.now(timezone.utc):
        return wallet_session["session_id"]
    return token_hash


def _wallet_account():
    try:
        from eth_account import Account
        from eth_account.messages import encode_defunct
        from eth_utils import is_address, to_checksum_address
    except ImportError as error:
        raise ApiError(503, "EVM sign-in requires the eth-account package. Run start.ps1 to install it.") from error
    return Account, encode_defunct, is_address, to_checksum_address


def _new_wallet_challenge(body):
    _, _, is_address, to_checksum_address = _wallet_account()
    if not isinstance(body, dict):
        raise ApiError(422, "Wallet sign-in request must be a JSON object.")
    address = body.get("address")
    chain_id = body.get("chainId")
    if not isinstance(address, str) or not is_address(address):
        raise ApiError(422, "A valid EVM wallet address is required.")
    if chain_id != CHAIN_ID:
        raise ApiError(400, f"Switch to Robinhood Chain Testnet (chain {CHAIN_ID}) to sign in.")
    address = to_checksum_address(address)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=5)
    nonce = secrets.token_hex(16)
    domain = urlsplit(APP_URL).netloc
    issued_at = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    expiration_time = expires_at.isoformat(timespec="seconds").replace("+00:00", "Z")
    message = (
        f"{domain} wants you to sign in with your Ethereum account:\n"
        f"{address}\n\n"
        "Sign in to Frostfish. This one-time message does not authorize transactions.\n\n"
        f"URI: {APP_URL}\nVersion: 1\nChain ID: {CHAIN_ID}\nNonce: {nonce}\n"
        f"Issued At: {issued_at}\nExpiration Time: {expiration_time}"
    )
    with SESSION_LOCK:
        WALLET_CHALLENGES[nonce] = {
            "address": address.lower(), "chain_id": CHAIN_ID,
            "message": message, "expires_at": expires_at,
        }
    return {"nonce": nonce, "message": message, "expiresAt": expiration_time}


def _verify_wallet(body):
    Account, encode_defunct, is_address, to_checksum_address = _wallet_account()
    if not isinstance(body, dict):
        raise ApiError(422, "Wallet sign-in request must be a JSON object.")
    address = body.get("address")
    chain_id = body.get("chainId")
    nonce = body.get("nonce")
    signature = body.get("signature")
    if not isinstance(address, str) or not is_address(address):
        raise ApiError(422, "A valid EVM wallet address is required.")
    if chain_id != CHAIN_ID:
        raise ApiError(400, f"Switch to Robinhood Chain Testnet (chain {CHAIN_ID}) to sign in.")
    if not isinstance(nonce, str) or not isinstance(signature, str):
        raise ApiError(422, "The wallet signature is incomplete.")
    with SESSION_LOCK:
        challenge = WALLET_CHALLENGES.pop(nonce, None)
    if not challenge or challenge["expires_at"] <= datetime.now(timezone.utc):
        raise ApiError(401, "That wallet sign-in request expired. Please try again.")
    normalized_address = to_checksum_address(address)
    if challenge["address"] != normalized_address.lower() or challenge["chain_id"] != chain_id:
        raise ApiError(401, "The wallet sign-in request does not match this account.")
    try:
        recovered = Account.recover_message(encode_defunct(text=challenge["message"]), signature=signature)
    except Exception as error:
        raise ApiError(401, "The wallet signature could not be verified.") from error
    if recovered.lower() != normalized_address.lower():
        raise ApiError(401, "The signature was made by a different wallet.")

    wallet_key = normalized_address.lower()
    token = secrets.token_urlsafe(40)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    with SESSION_LOCK:
        session_id = WALLET_GAMES.get(wallet_key)
        state = SESSIONS.get(session_id) if session_id else None
        if state is None:
            session_id = hashlib.sha256(secrets.token_urlsafe(40).encode()).hexdigest()
            state = {**initial_state(session_id), "session_id": session_id, "wallet_address": wallet_key}
            SESSIONS[session_id] = state
            WALLET_GAMES[wallet_key] = session_id
        WALLET_SESSIONS[token_hash] = {
            "session_id": session_id,
            "expires_at": now + timedelta(days=30),
        }
        state = copy.deepcopy(state)
    return {"token": token, "game": public_state(state)}


def _mutate(authorization, action=None):
    sid = _session_id(authorization)
    with SESSION_LOCK:
        stored = SESSIONS.get(sid)
        if not stored:
            raise ApiError(401, "Your session has expired. Start a new adventure.")
        revision = stored["revision"]
        state = copy.deepcopy(stored)
        if state.get("version") != VERSION:
            state = {**initial_state(sid), "session_id": sid, **({"wallet_address": state["wallet_address"]} if state.get("wallet_address") else {})}
        advance(state)
        if action:
            if action["type"] == "buy":
                error = buy(state, action.get("character"))
                if error:
                    raise ApiError(400 if "TOKEN" in error else 422, error)
            elif action["type"] == "reset":
                state = {**initial_state(sid), "session_id": sid, **({"wallet_address": state["wallet_address"]} if state.get("wallet_address") else {})}
            else:
                raise ApiError(422, "Unknown game action.")
        state["revision"] = revision + 1
        SESSIONS[sid] = copy.deepcopy(state)
        return public_state(state)


def _leaderboard(authorization):
    sid = _session_id(authorization, allow_missing=True)
    with SESSION_LOCK:
        docs = sorted(
            (state for state in SESSIONS.values() if state.get("version") == VERSION),
            key=lambda state: state["total_earned_micro"],
            reverse=True,
        )
        entries = [
            {
                "rank": index + 1,
                "name": state["name"],
                "rewards": state["total_earned_micro"] / 1_000_000,
                "workers": len(state["workers"]),
                "you": state["session_id"] == sid,
            }
            for index, state in enumerate(docs[:10])
        ]
        you = None
        me = SESSIONS.get(sid) if sid else None
        if me and me.get("version") == VERSION:
            rank = sum(
                state["total_earned_micro"] > me["total_earned_micro"]
                for state in docs
            ) + 1
            you = {
                "rank": rank,
                "name": me["name"],
                "rewards": me["total_earned_micro"] / 1_000_000,
                "workers": len(me["workers"]),
            }
        return {"entries": entries, "you": you}


def _public_early_access_participant(participant, rank=None):
    address = participant["wallet_address"]
    result = {
        "id": participant["id"],
        "xName": participant["x_name"],
        "walletAddress": f"{address[:6]}…{address[-4:]}",
        "points": participant["points"],
        "completedTasks": participant.get("completed_tasks", []),
    }
    if rank is not None:
        result["rank"] = rank
    return result


def _participant_token_hash(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "An Early Access participant session is required.")
    return hashlib.sha256(authorization[7:].encode()).hexdigest()


def _get_early_access_participant(authorization):
    token_hash = _participant_token_hash(authorization)
    if MONGO_PARTICIPANTS is not None:
        participant = MONGO_PARTICIPANTS.find_one({"access_token_hash": token_hash}, {"_id": 0})
    else:
        with PARTICIPANT_LOCK:
            participant = next((copy.deepcopy(item) for item in PARTICIPANTS.values()
                                if item["access_token_hash"] == token_hash), None)
    if participant is None:
        raise ApiError(401, "Your Early Access participant session has expired.")
    return participant


def _register_early_access_participant(body):
    if not isinstance(body, dict):
        raise ApiError(422, "Participant details must be a JSON object.")
    x_name = body.get("xName")
    address = body.get("address")
    if not isinstance(x_name, str):
        raise ApiError(422, "Enter your X username.")
    x_name = x_name.strip().lstrip("@")
    if not X_NAME_PATTERN.fullmatch(x_name):
        raise ApiError(422, "Enter a valid X username (1–15 letters, numbers or underscores).")
    if not isinstance(address, str) or not EVM_ADDRESS_PATTERN.fullmatch(address.strip()):
        raise ApiError(422, "Enter a valid EVM address beginning with 0x.")
    x_name_key = x_name.lower()
    if MONGO_PARTICIPANTS is not None and MONGO_PARTICIPANTS.find_one({"x_name_key": x_name_key}):
        raise ApiError(409, "This X username is already registered for Early Access.")
    access_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    participant = {
        "id": secrets.token_hex(16),
        "x_name": x_name,
        "x_name_key": x_name_key,
        "wallet_address": address.strip().lower(),
        "points": 0,
        "completed_tasks": [],
        "access_token_hash": hashlib.sha256(access_token.encode()).hexdigest(),
        "created_at": now,
        "updated_at": now,
    }
    try:
        if MONGO_PARTICIPANTS is not None:
            MONGO_PARTICIPANTS.insert_one(participant.copy())
        else:
            with PARTICIPANT_LOCK:
                if any(item["x_name_key"] == x_name_key for item in PARTICIPANTS.values()):
                    raise ApiError(409, "This X username is already registered for Early Access.")
                PARTICIPANTS[participant["id"]] = copy.deepcopy(participant)
    except ApiError:
        raise
    except Exception as error:
        if getattr(error, "code", None) == 11000:
            raise ApiError(409, "This X username is already registered for Early Access.") from None
        raise
    return {"accessToken": access_token, "participant": _public_early_access_participant(participant)}


def _list_early_access_participants(search):
    cleaned = search.strip()[:80]
    if MONGO_PARTICIPANTS is not None:
        query = {}
        if cleaned:
            pattern = re.escape(cleaned)
            query = {"$or": [
                {"x_name": {"$regex": pattern, "$options": "i"}},
                {"wallet_address": {"$regex": pattern, "$options": "i"}},
            ]}
        documents = list(MONGO_PARTICIPANTS.find(
            query, {"_id": 0, "access_token_hash": 0, "x_name_key": 0}
        ).sort("points", -1).limit(50))
        if cleaned:
            all_documents = list(MONGO_PARTICIPANTS.find({}, {"_id": 0, "points": 1}))
            for participant in documents:
                participant["rank"] = sum(item["points"] > participant["points"] for item in all_documents) + 1
    else:
        with PARTICIPANT_LOCK:
            all_documents = [copy.deepcopy(item) for item in PARTICIPANTS.values()]
        if cleaned:
            needle = cleaned.casefold()
            all_documents = [item for item in all_documents if needle in item["x_name"].casefold()
                             or needle in item["wallet_address"].casefold()]
        all_documents.sort(key=lambda item: item["points"], reverse=True)
        documents = all_documents[:50]
        if cleaned:
            whole_list = list(PARTICIPANTS.values())
            for participant in documents:
                participant["rank"] = sum(item["points"] > participant["points"] for item in whole_list) + 1
    return {"participants": [
        _public_early_access_participant(participant, participant.get("rank", index + 1))
        for index, participant in enumerate(documents)
    ]}


def _complete_early_access_task(task_id, authorization):
    points = TASK_POINTS.get(task_id)
    if points is None:
        raise ApiError(404, "Unknown Early Access task.")
    participant = _get_early_access_participant(authorization)
    if MONGO_PARTICIPANTS is not None:
        result = MONGO_PARTICIPANTS.update_one(
            {"id": participant["id"], "completed_tasks": {"$ne": task_id}},
            {"$addToSet": {"completed_tasks": task_id}, "$inc": {"points": points},
             "$set": {"updated_at": datetime.now(timezone.utc)}},
        )
        awarded = bool(result.modified_count)
        participant = MONGO_PARTICIPANTS.find_one(
            {"id": participant["id"]}, {"_id": 0, "access_token_hash": 0, "x_name_key": 0}
        )
    else:
        with PARTICIPANT_LOCK:
            participant = PARTICIPANTS[participant["id"]]
            awarded = task_id not in participant["completed_tasks"]
            if awarded:
                participant["completed_tasks"].append(task_id)
                participant["points"] += points
                participant["updated_at"] = datetime.now(timezone.utc)
            participant = copy.deepcopy(participant)
    return {
        "awarded": awarded,
        "awardedPoints": points if awarded else 0,
        "participant": _public_early_access_participant(participant),
    }


class FrostfishHandler(BaseHTTPRequestHandler):
    server_version = "FrostfishLocal/1.0"

    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string()}] {format_string % args}")

    def _send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        if self.command == "OPTIONS":
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                raise ApiError(413, "Request body is too large.")
            return json.loads(self.rfile.read(length) or b"{}")
        except ApiError:
            raise
        except (ValueError, json.JSONDecodeError):
            raise ApiError(422, "Request body must be valid JSON.") from None

    def _route(self):
        parsed_url = urlsplit(self.path)
        path = parsed_url.path
        query = parse_qs(parsed_url.query)
        authorization = self.headers.get("Authorization")

        if self.command == "GET":
            if path == "/api/health":
                return {"status": "ok", "game": "Frostfish"}
            if path == "/api/characters":
                return list(CHARACTERS.values())
            if path == "/api/village":
                return {"villagers": RESIDENTS}
            if path == "/api/game":
                return _mutate(authorization)
            if path == "/api/leaderboard":
                return _leaderboard(authorization)
            if path == "/api/early-access/me":
                return {"participant": _public_early_access_participant(_get_early_access_participant(authorization))}
            if path == "/api/early-access/participants":
                return _list_early_access_participants(query.get("search", [""])[0])
        elif self.command == "POST":
            if path == "/api/auth/challenge":
                return _new_wallet_challenge(self._read_json())
            if path == "/api/auth/verify":
                return _verify_wallet(self._read_json())
            if path == "/api/sessions":
                token = secrets.token_urlsafe(40)
                sid = hashlib.sha256(token.encode()).hexdigest()
                state = {**initial_state(sid), "session_id": sid}
                with SESSION_LOCK:
                    SESSIONS[sid] = state
                return {"token": token, "game": public_state(state)}
            if path == "/api/early-access/participants":
                return _register_early_access_participant(self._read_json())
            if path.startswith("/api/early-access/tasks/"):
                task_id = path.rsplit("/", 1)[-1]
                return _complete_early_access_task(task_id, authorization)
            if path == "/api/game/action":
                body = self._read_json()
                if not isinstance(body, dict):
                    raise ApiError(422, "Action must be a JSON object.")
                action_type = body.get("type")
                character = body.get("character")
                if not isinstance(action_type, str) or len(action_type) > 30:
                    raise ApiError(422, "Action type must be a string of at most 30 characters.")
                if character is not None and (not isinstance(character, str) or len(character) > 20):
                    raise ApiError(422, "Character must be a string of at most 20 characters.")
                return _mutate(authorization, {"type": action_type, "character": character})

        raise ApiError(404, "Not Found")

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _handle(self):
        try:
            self._send_json(200, self._route())
        except ApiError as error:
            self._send_json(error.status, {"detail": error.detail})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as error:
            print(f"Local API error: {error}")
            self._send_json(500, {"detail": "The island encountered an internal error."})


if __name__ == "__main__":
    httpd = ThreadingHTTPServer((HOST, PORT), FrostfishHandler)
    print(f"Frostfish local API listening at http://{HOST}:{PORT}")
    print("Demo sessions are stored in memory and reset when this server stops.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Stopping Frostfish local API.")
    finally:
        httpd.server_close()
