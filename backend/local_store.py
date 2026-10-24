"""Small in-memory Mongo-like store used for a zero-setup local demo."""

from copy import deepcopy
import re
from types import SimpleNamespace


class MemoryDuplicateKeyError(Exception):
    code = 11000


def _matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(document, option) for option in expected):
                return False
            continue
        actual = document.get(key)
        if isinstance(expected, dict):
            if "$gt" in expected and (actual is None or actual <= expected["$gt"]):
                return False
            if "$ne" in expected:
                forbidden = expected["$ne"]
                if actual == forbidden or (isinstance(actual, list) and forbidden in actual):
                    return False
            if "$regex" in expected:
                flags = re.IGNORECASE if "i" in expected.get("$options", "") else 0
                if actual is None or not re.search(expected["$regex"], str(actual), flags):
                    return False
        elif actual != expected:
            return False
    return True


def _project(document, projection):
    result = deepcopy(document)
    if not projection:
        return result
    included = [key for key, enabled in projection.items() if enabled]
    if included:
        return {key: deepcopy(document[key]) for key in included if key in document}
    for key, enabled in projection.items():
        if not enabled:
            result.pop(key, None)
    return result


class MemoryCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, key, direction=1):
        self.documents.sort(key=lambda document: document.get(key, 0), reverse=direction < 0)
        return self

    def limit(self, count):
        self.documents = self.documents[:count]
        return self

    async def to_list(self, length=None):
        return deepcopy(self.documents if length is None else self.documents[:length])


class MemoryCollection:
    def __init__(self):
        self.documents = []
        self.unique_indexes = []

    async def insert_one(self, document):
        for key in self.unique_indexes:
            if any(existing.get(key) == document.get(key) for existing in self.documents):
                raise MemoryDuplicateKeyError(f"Duplicate value for unique field {key}.")
        self.documents.append(deepcopy(document))
        return SimpleNamespace(inserted_id=None)

    async def find_one(self, query, projection=None):
        for document in self.documents:
            if _matches(document, query):
                return _project(document, projection)
        return None

    async def find_one_and_delete(self, query):
        for index, document in enumerate(self.documents):
            if _matches(document, query):
                return self.documents.pop(index)
        return None

    async def replace_one(self, query, replacement):
        for index, document in enumerate(self.documents):
            if _matches(document, query):
                self.documents[index] = deepcopy(replacement)
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def update_one(self, query, update):
        for document in self.documents:
            if not _matches(document, query):
                continue
            before = deepcopy(document)
            for key, values in update.get("$set", {}).items():
                document[key] = deepcopy(values)
            for key, amount in update.get("$inc", {}).items():
                document[key] = document.get(key, 0) + amount
            for key, value in update.get("$addToSet", {}).items():
                document.setdefault(key, [])
                if value not in document[key]:
                    document[key].append(deepcopy(value))
            return SimpleNamespace(matched_count=1, modified_count=int(document != before))
        return SimpleNamespace(matched_count=0, modified_count=0)

    def find(self, query, projection=None):
        return MemoryCursor([_project(document, projection) for document in self.documents if _matches(document, query)])

    async def count_documents(self, query):
        return sum(_matches(document, query) for document in self.documents)

    async def create_index(self, key, **kwargs):
        if kwargs.get("unique") and isinstance(key, str):
            self.unique_indexes.append(key)
        return None


class MemoryDatabase:
    def __init__(self):
        self.games = MemoryCollection()
        self.wallet_challenges = MemoryCollection()
        self.wallet_sessions = MemoryCollection()
        self.early_access_participants = MemoryCollection()

    async def command(self, command):
        if command != "ping":
            raise ValueError(f"Unsupported local database command: {command}")
        return {"ok": 1}


class MemoryClient:
    def __init__(self):
        self.databases = {}

    def __getitem__(self, name):
        if name not in self.databases:
            self.databases[name] = MemoryDatabase()
        return self.databases[name]

    def close(self):
        self.databases.clear()
