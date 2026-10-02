async def create_indexes(database):
    if not database.available: return
    for name in ('samples','readings','counters','sample_sessions','states','districts','blocks','villages','devices','thresholds','field_tests','calibrations','alerts','users','audit_log'):
        collection=database.db[name]
        try:
            if hasattr(collection,'create_index'): await collection.create_index([('sample_id',1)], unique=True) if name=='samples' else await collection.create_index([('_id',1)])
        except Exception: continue
