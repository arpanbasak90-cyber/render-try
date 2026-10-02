import pytest
from app.core.config import Settings
from app.db.mongo import Database, MemoryDB, SQLDB

@pytest.mark.asyncio
async def test_memory_db_operations():
    settings = Settings(db_mode='memory')
    db_inst = Database(settings)
    await db_inst.connect()

    coll = db_inst.db['samples']
    await coll.insert_one({'sample_id': 'TEST-001', 'synthetic': False, 'region': {'state_code': 'BR', 'district_name': 'Patna'}})

    item = await coll.find_one({'sample_id': 'TEST-001'})
    assert item is not None
    assert item['region']['district_name'] == 'Patna'

    await coll.update_one({'sample_id': 'TEST-001'}, {'$set': {'status': 'VERIFIED'}})
    updated = await coll.find_one({'sample_id': 'TEST-001'})
    assert updated['status'] == 'VERIFIED'

    items = []
    async for doc in coll.find({'synthetic': False}):
        items.append(doc)
    assert len(items) == 1

@pytest.mark.asyncio
async def test_sql_db_operations(tmp_path):
    db_file = str(tmp_path / 'test_jalraksha.db')
    settings = Settings(db_mode='sqlite')
    db_inst = Database(settings)
    db_inst.db = SQLDB(db_path=db_file)
    db_inst.available = True

    coll = db_inst.db['samples']
    await coll.insert_one({'sample_id': 'SQL-001', 'synthetic': False, 'region': {'state_code': 'MH', 'district_name': 'Pune'}})

    item = await coll.find_one({'sample_id': 'SQL-001'})
    assert item is not None
    assert item['region']['district_name'] == 'Pune'

    await coll.update_one({'sample_id': 'SQL-001'}, {'$set': {'status': 'COMPLETED'}})
    updated = await coll.find_one({'sample_id': 'SQL-001'})
    assert updated['status'] == 'COMPLETED'

    items = []
    async for doc in coll.find({'region.district_name': 'Pune'}):
        items.append(doc)
    assert len(items) == 1

    await db_inst.close()
