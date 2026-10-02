from fastapi import FastAPI, HTTPException, Query
from app.repositories.samples import SamplesRepository
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.errors import AppError, app_error_handler
from app.db.mongo import init_db
from app.db.indexes import create_indexes
from app.core.constants import STATE_NAMES,SOURCE_TYPES,SCENARIOS
import json
from pathlib import Path
DISTRICTS=json.loads(Path('app/data/geography/districts.json').read_text())
from datetime import datetime,timezone
settings=get_settings(); app=FastAPI(title='JALRAKSHA Backend',version='0.1.0'); app.add_exception_handler(AppError,app_error_handler)
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins.split(','),allow_methods=['*'],allow_headers=['*'])
@app.on_event('startup')
async def startup():
    app.state.database=await init_db(settings); await create_indexes(app.state.database)
@app.get('/api/v1/health')
async def health(): return {'db':'memory' if settings.db_mode=='memory' else ('connected' if app.state.database.available else 'unavailable'),'transport':settings.device_transport,'device_status':'offline','version':app.version,'server_time':datetime.now(timezone.utc).isoformat()}
@app.get('/api/v1/samples')
async def samples(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    return await SamplesRepository(app.state.database).list_real(limit, offset)

@app.get('/api/v1/meta/options')
async def options(): return {'source_types':SOURCE_TYPES,'states':STATE_NAMES,'languages':['en','hi','bn'],'threshold_summary':{'version':'BIS-IS-10500-2012'},'simulator_scenarios':SCENARIOS if settings.device_transport=='simulator' else [],'config_flags':{'reading_mode':settings.reading_mode,'filter_mode':settings.filter_mode,'transport':settings.device_transport}}
@app.get('/api/v1/meta/states')
async def states(): return {'items':[{'code':k,**v} for k,v in STATE_NAMES.items()]}
@app.get('/api/v1/meta/states/{state_code}/districts')
async def districts(state_code: str):
    if state_code not in STATE_NAMES: raise AppError('invalid_state','Unknown state',status_code=422)
    return {'items':[d for d in DISTRICTS if d['state_code']==state_code], 'total':sum(d['state_code']==state_code for d in DISTRICTS)}
