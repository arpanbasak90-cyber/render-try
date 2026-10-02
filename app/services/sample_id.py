from datetime import datetime
from zoneinfo import ZoneInfo
import asyncio
_lock=asyncio.Lock()
async def next_sample_id(db,state,district,code):
    day=datetime.now(ZoneInfo('Asia/Kolkata')).strftime('%Y%m%d'); key=f'sample:{state}-{code}-{day}'
    async with _lock:
        c=db['counters']; d=await c.find_one({'_id':key})
        seq=(d or {}).get('seq',0)+1; await c.update_one({'_id':key},{'$set':{'seq':seq}},upsert=True)
        return f'{state}-{district}-{day}-{seq:04d}'
