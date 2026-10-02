from datetime import datetime, timezone
from app.core.config import Settings
class MemoryCollection:
    def __init__(self): self.docs=[]
    async def insert_one(self, d): self.docs.append(dict(d)); return type('R',(),{'inserted_id':d.get('_id')})()
    async def find_one(self, q):
        return next((d for d in self.docs if all(d.get(k)==v for k,v in q.items())), None)
    async def replace_one(self,q,d,upsert=False):
        old=await self.find_one(q)
        if old: self.docs[self.docs.index(old)]=dict(d)
        elif upsert: self.docs.append(dict(d))
    async def update_one(self,q,u,upsert=False):
        d=await self.find_one(q)
        if not d and upsert: d=dict(q); self.docs.append(d)
        if d:
            for k,v in u.get('$set',{}).items(): d[k]=v
            for k,v in u.get('$inc',{}).items(): d[k]=d.get(k,0)+v
    async def delete_many(self,q): self.docs.clear()
    def find(self,q=None):
        q=q or {}; return MemoryCursor([d for d in self.docs if all(d.get(k)==v for k,v in q.items())])
class MemoryCursor:
    def __init__(self, docs): self.docs=docs
    def sort(self,*a,**k): return self
    def skip(self,n): self.docs=self.docs[n:]; return self
    def limit(self,n): self.docs=self.docs[:n]; return self
    def __aiter__(self): return self._it()
    async def _it(self):
        for d in self.docs: yield d
class MemoryDB:
    def __init__(self): self.collections={}
    def __getitem__(self,k): return self.collections.setdefault(k,MemoryCollection())
class Database:
    def __init__(self, settings): self.settings=settings; self.db=MemoryDB(); self.available=True; self.client=None
    async def connect(self):
        if self.settings.db_mode=='mongo':
            try:
                from motor.motor_asyncio import AsyncIOMotorClient
                self.client=AsyncIOMotorClient(self.settings.mongodb_uri, serverSelectionTimeoutMS=self.settings.mongodb_connect_timeout_ms); await self.client.admin.command('ping'); self.db=self.client[self.settings.mongodb_db_name]
            except Exception: self.available=False
    async def close(self):
        if self.client: self.client.close()
db_instance=None
async def init_db(settings):
    global db_instance; db_instance=Database(settings); await db_instance.connect(); return db_instance
