import json
import sqlite3
import uuid
import os
from datetime import datetime, timezone
from app.core.config import Settings

def doc_matches(doc, q):
    if not q:
        return True
    for k, v in q.items():
        parts = k.split('.')
        curr = doc
        for p in parts:
            if isinstance(curr, dict) and p in curr:
                curr = curr[p]
            else:
                curr = None
                break
        if curr != v:
            return False
    return True

class MemoryCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, d):
        doc = dict(d)
        self.docs.append(doc)
        return type('R', (), {'inserted_id': doc.get('_id') or doc.get('sample_id') or str(uuid.uuid4())})()

    async def find_one(self, q):
        return next((d for d in self.docs if doc_matches(d, q)), None)

    async def replace_one(self, q, d, upsert=False):
        old = await self.find_one(q)
        if old:
            self.docs[self.docs.index(old)] = dict(d)
        elif upsert:
            self.docs.append(dict(d))

    async def update_one(self, q, u, upsert=False):
        d = await self.find_one(q)
        if not d and upsert:
            d = dict(q)
            self.docs.append(d)
        if d:
            for k, v in u.get('$set', {}).items():
                d[k] = v
            for k, v in u.get('$inc', {}).items():
                d[k] = d.get(k, 0) + v

    async def delete_many(self, q):
        if not q:
            self.docs.clear()
        else:
            self.docs = [d for d in self.docs if not doc_matches(d, q)]

    def find(self, q=None):
        q = q or {}
        return MemoryCursor([d for d in self.docs if doc_matches(d, q)])

class MemoryCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *a, **k):
        return self

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __aiter__(self):
        return self._it()

    async def _it(self):
        for d in self.docs:
            yield d

class MemoryDB:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, k):
        return self.collections.setdefault(k, MemoryCollection())

class SQLCollection:
    def __init__(self, db_conn, name):
        self.conn = db_conn
        self.name = name
        self._init_table()

    def _init_table(self):
        with self.conn:
            self.conn.execute(f"CREATE TABLE IF NOT EXISTS collection_{self.name} (id TEXT PRIMARY KEY, doc TEXT)")

    async def insert_one(self, d):
        doc = dict(d)
        doc_id = str(doc.get('_id') or doc.get('sample_id') or uuid.uuid4())
        doc_str = json.dumps(doc)
        with self.conn:
            self.conn.execute(f"INSERT OR REPLACE INTO collection_{self.name} (id, doc) VALUES (?, ?)", (doc_id, doc_str))
        return type('R', (), {'inserted_id': doc_id})()

    async def find_one(self, q):
        docs = await self._all_docs()
        return next((d for d in docs if doc_matches(d, q)), None)

    async def replace_one(self, q, d, upsert=False):
        old = await self.find_one(q)
        if old:
            doc_id = str(old.get('_id') or old.get('sample_id'))
            doc = dict(d)
            with self.conn:
                self.conn.execute(f"UPDATE collection_{self.name} SET doc = ? WHERE id = ?", (json.dumps(doc), doc_id))
        elif upsert:
            await self.insert_one(d)

    async def update_one(self, q, u, upsert=False):
        d = await self.find_one(q)
        if not d and upsert:
            d = dict(q)
            await self.insert_one(d)
            d = await self.find_one(q)
        if d:
            for k, v in u.get('$set', {}).items():
                d[k] = v
            for k, v in u.get('$inc', {}).items():
                d[k] = d.get(k, 0) + v
            doc_id = str(d.get('_id') or d.get('sample_id'))
            with self.conn:
                self.conn.execute(f"UPDATE collection_{self.name} SET doc = ? WHERE id = ?", (json.dumps(d), doc_id))

    async def delete_many(self, q):
        if not q:
            with self.conn:
                self.conn.execute(f"DELETE FROM collection_{self.name}")
        else:
            docs = await self._all_docs()
            matching_ids = [str(d.get('_id') or d.get('sample_id')) for d in docs if doc_matches(d, q)]
            for doc_id in matching_ids:
                with self.conn:
                    self.conn.execute(f"DELETE FROM collection_{self.name} WHERE id = ?", (doc_id,))

    def find(self, q=None):
        q = q or {}
        docs = self._sync_all_docs()
        matching = [d for d in docs if doc_matches(d, q)]
        return MemoryCursor(matching)

    def _sync_all_docs(self):
        cursor = self.conn.execute(f"SELECT doc FROM collection_{self.name}")
        rows = cursor.fetchall()
        docs = []
        for r in rows:
            try:
                docs.append(json.loads(r[0]))
            except Exception:
                pass
        return docs

    async def _all_docs(self):
        return self._sync_all_docs()

class SQLDB:
    def __init__(self, db_path="jalraksha.db"):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.collections = {}

    def __getitem__(self, k):
        if k not in self.collections:
            self.collections[k] = SQLCollection(self.conn, k)
        return self.collections[k]

    def close(self):
        self.conn.close()

class Database:
    def __init__(self, settings):
        self.settings = settings
        self.db = MemoryDB()
        self.available = True
        self.client = None

    async def connect(self):
        mode = self.settings.db_mode
        if mode == 'mongo':
            try:
                from motor.motor_asyncio import AsyncIOMotorClient
                self.client = AsyncIOMotorClient(
                    self.settings.mongodb_uri,
                    serverSelectionTimeoutMS=self.settings.mongodb_connect_timeout_ms
                )
                await self.client.admin.command('ping')
                self.db = self.client[self.settings.mongodb_db_name]
                self.available = True
            except Exception:
                self.available = False
        elif mode in ('postgres', 'sqlite'):
            try:
                # Standard SQL DB connection (Render Postgres / SQLite file)
                db_path = os.getenv('SQLITE_DB_PATH', 'jalraksha.db')
                self.db = SQLDB(db_path=db_path)
                self.available = True
            except Exception:
                self.available = False
        else:
            self.db = MemoryDB()
            self.available = True

    async def close(self):
        if self.client:
            self.client.close()
        elif isinstance(self.db, SQLDB):
            self.db.close()

db_instance = None

async def init_db(settings):
    global db_instance
    db_instance = Database(settings)
    await db_instance.connect()
    return db_instance

