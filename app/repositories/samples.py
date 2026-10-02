from app.core.errors import AppError

class SamplesRepository:
    def __init__(self, database):
        self.database = database

    async def list_real(self, limit=50, offset=0, district_name=None, state_code=None):
        if not self.database.available:
            raise AppError('db_unavailable', 'Database unavailable', status_code=503)
        # Fail closed: only explicitly non-synthetic records are eligible.
        records = []
        query = {'synthetic': False}
        if district_name:
            query['region.district_name'] = district_name
        if state_code:
            query['region.state_code'] = state_code
        async for doc in self.database.db['samples'].find(query):
            records.append({k: v for k, v in doc.items() if k != '_id'})
        records.sort(key=lambda item: str(item.get('measured_at', '')), reverse=True)
        return {'items': records[offset:offset + limit], 'total': len(records), 'limit': limit, 'offset': offset}
